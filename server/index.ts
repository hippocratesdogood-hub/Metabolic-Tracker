import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { seedIfEmpty } from "./seedIfEmpty";
import { forceHttps, securityHeaders, sanitizeForLogging } from "./middleware/security";
import {
  initializeErrorMonitoring,
  requestTrackingMiddleware,
  errorHandlingMiddleware,
  reportError,
  ErrorSeverity,
} from "./services/errorMonitoring";
import { errorMetricsService } from "./services/errorMetrics";
import { performanceMonitor } from "./services/performanceMonitor";

// Initialize error monitoring FIRST (before any other code)
initializeErrorMonitoring();

const app = express();
const httpServer = createServer(app);

// Request tracking middleware (adds request IDs and Sentry transactions)
app.use(requestTrackingMiddleware);

// Security middleware - apply early
app.use(forceHttps());
app.use(securityHeaders());

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;

      // Sanitize response before logging to prevent PHI/PII exposure
      if (capturedJsonResponse) {
        const sanitized = sanitizeForLogging(capturedJsonResponse);
        logLine += ` :: ${JSON.stringify(sanitized)}`;
      }

      log(logLine);

      // Record performance metrics
      performanceMonitor.recordApiResponse(path, req.method, duration, res.statusCode);
    }
  });

  next();
});

(async () => {
  await seedIfEmpty();
  await registerRoutes(httpServer, app);

  // Error handling middleware - must be LAST
  // This reports errors to Sentry and sends appropriate responses
  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;

    // Record error in metrics
    errorMetricsService.recordError(err, {
      userId: (req.user as any)?.id,
      requestId: req.requestId,
    });

    // Report to Sentry with full context
    reportError({
      severity: status >= 500 ? ErrorSeverity.HIGH : ErrorSeverity.MEDIUM,
      error: err,
      context: {
        userId: (req.user as any)?.id,
        userRole: (req.user as any)?.role,
        requestId: req.requestId,
        action: `${req.method} ${req.path}`,
        metadata: {
          statusCode: status,
        },
      },
    });

    // In production, send generic message to prevent info leakage
    const message = process.env.NODE_ENV === "production"
      ? "Internal Server Error"
      : err.message || "Internal Server Error";

    res.status(status).json({
      message,
      requestId: req.requestId, // Include for support reference
    });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(port, "0.0.0.0", () => {
    log(`serving on port ${port}`);
  });

  // Graceful shutdown - flush Sentry events before exit
  const gracefulShutdown = async (signal: string) => {
    log(`Received ${signal}. Shutting down gracefully...`);

    // Stop accepting new connections
    httpServer.close(async () => {
      log("HTTP server closed");

      // Flush pending Sentry events
      const { flushEvents } = await import("./services/errorMonitoring");
      await flushEvents(5000);

      // Stop error metrics cleanup timer
      errorMetricsService.stopCleanupTimer();

      log("Shutdown complete");
      process.exit(0);
    });

    // Force exit if graceful shutdown takes too long
    setTimeout(() => {
      log("Forcing shutdown after timeout");
      process.exit(1);
    }, 10000);
  };

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
})();
