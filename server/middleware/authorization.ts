import type { Request, Response, NextFunction, RequestHandler } from "express";
import { storage } from "../storage";

// Types
export type Role = "participant" | "coach" | "admin";

// Logger interface for unauthorized access attempts
export interface AuthorizationLogger {
  logUnauthorizedAccess(details: {
    userId: string | undefined;
    userRole: string | undefined;
    attemptedAction: string;
    resourceId?: string;
    ipAddress: string;
    timestamp: Date;
    reason: string;
  }): void;
}

// Default console logger (can be replaced with proper logging service)
const defaultLogger: AuthorizationLogger = {
  logUnauthorizedAccess(details) {
    console.warn("[UNAUTHORIZED ACCESS ATTEMPT]", JSON.stringify({
      ...details,
      timestamp: details.timestamp.toISOString(),
    }));
  }
};

let logger: AuthorizationLogger = defaultLogger;

/**
 * Set a custom logger for authorization events
 */
export function setAuthorizationLogger(customLogger: AuthorizationLogger): void {
  logger = customLogger;
}

/**
 * Get the current logger (useful for testing)
 */
export function getAuthorizationLogger(): AuthorizationLogger {
  return logger;
}

/**
 * Reset to default logger (useful for testing)
 */
export function resetAuthorizationLogger(): void {
  logger = defaultLogger;
}

/**
 * Middleware to check if user is authenticated
 */
export const requireAuth: RequestHandler = (req: Request, res: Response, next: NextFunction): void => {
  if (req.isAuthenticated && req.isAuthenticated() && req.user) {
    return next();
  }

  logger.logUnauthorizedAccess({
    userId: undefined,
    userRole: undefined,
    attemptedAction: `${req.method} ${req.path}`,
    ipAddress: req.ip || req.socket?.remoteAddress || "unknown",
    timestamp: new Date(),
    reason: "Not authenticated",
  });

  res.status(401).json({ message: "Unauthorized" });
};

/**
 * Middleware factory that restricts access to specific roles
 *
 * @param allowedRoles - Array of roles that are permitted access
 * @param options - Additional options for the middleware
 * @returns Express middleware function
 *
 * @example
 * // Admin only route
 * app.get("/api/admin/users", requireAuth, requireRoles(["admin"]), handler);
 *
 * // Coach or admin route
 * app.get("/api/admin/participants", requireAuth, requireRoles(["coach", "admin"]), handler);
 */
export function requireRoles(
  allowedRoles: Role[],
  options: { actionDescription?: string } = {}
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user as any;

    if (!user) {
      logger.logUnauthorizedAccess({
        userId: undefined,
        userRole: undefined,
        attemptedAction: options.actionDescription || `${req.method} ${req.path}`,
        ipAddress: req.ip || req.socket?.remoteAddress || "unknown",
        timestamp: new Date(),
        reason: "No user in request",
      });
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    if (!allowedRoles.includes(user.role)) {
      logger.logUnauthorizedAccess({
        userId: user.id,
        userRole: user.role,
        attemptedAction: options.actionDescription || `${req.method} ${req.path}`,
        ipAddress: req.ip || req.socket?.remoteAddress || "unknown",
        timestamp: new Date(),
        reason: `Role '${user.role}' not in allowed roles: [${allowedRoles.join(", ")}]`,
      });
      res.status(403).json({ message: "Forbidden" });
      return;
    }

    next();
  };
}

// Convenience middleware for common role combinations
export const requireAdmin: RequestHandler = requireRoles(["admin"], { actionDescription: "Admin action" });
export const requireCoachOrAdmin: RequestHandler = requireRoles(["coach", "admin"], { actionDescription: "Coach/Admin action" });
export const requireParticipant: RequestHandler = requireRoles(["participant"], { actionDescription: "Participant action" });

/**
 * Middleware factory for resource ownership verification
 * Ensures the authenticated user owns the resource or has elevated privileges
 *
 * @param getResourceOwnerId - Async function to retrieve the owner ID of the resource
 * @param options - Configuration options
 * @returns Express middleware function
 *
 * @example
 * app.put("/api/metrics/:id", requireAuth, requireOwnership(
 *   async (req) => {
 *     const entry = await storage.getMetricEntryById(req.params.id);
 *     return entry?.userId;
 *   },
 *   { allowAdmin: true }
 * ), handler);
 */
export function requireOwnership(
  getResourceOwnerId: (req: Request) => Promise<string | undefined>,
  options: {
    allowAdmin?: boolean;
    allowCoach?: boolean;  // Allow if coach is assigned to the resource owner
    resourceName?: string;
  } = {}
): RequestHandler {
  const { allowAdmin = true, allowCoach = false, resourceName = "resource" } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const user = req.user as any;

    if (!user) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    try {
      const ownerId = await getResourceOwnerId(req);

      if (!ownerId) {
        res.status(404).json({ message: `${resourceName} not found` });
        return;
      }

      // Check if user is the owner
      if (ownerId === user.id) {
        return next();
      }

      // Check admin override
      if (allowAdmin && user.role === "admin") {
        return next();
      }

      // Check coach override - coach must be assigned to the resource owner
      if (allowCoach && user.role === "coach") {
        const resourceOwner = await storage.getUser(ownerId);
        if (resourceOwner && resourceOwner.coachId === user.id) {
          return next();
        }
      }

      // Unauthorized
      logger.logUnauthorizedAccess({
        userId: user.id,
        userRole: user.role,
        attemptedAction: `${req.method} ${req.path}`,
        resourceId: ownerId,
        ipAddress: req.ip || req.socket?.remoteAddress || "unknown",
        timestamp: new Date(),
        reason: `User does not own ${resourceName} and lacks override privileges`,
      });

      res.status(403).json({ message: "Forbidden" });
    } catch (error) {
      console.error("Error in ownership check:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  };
}

/**
 * Middleware to ensure a coach can only access their assigned participants
 *
 * @param getParticipantId - Function to extract participant ID from request
 * @returns Express middleware function
 */
export function requireCoachAssignment(
  getParticipantId: (req: Request) => string | Promise<string | undefined>
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const user = req.user as any;

    if (!user) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    // Admins can access any participant
    if (user.role === "admin") {
      return next();
    }

    // Only coaches need assignment verification
    if (user.role !== "coach") {
      logger.logUnauthorizedAccess({
        userId: user.id,
        userRole: user.role,
        attemptedAction: `${req.method} ${req.path}`,
        ipAddress: req.ip || req.socket?.remoteAddress || "unknown",
        timestamp: new Date(),
        reason: "Non-coach attempting coach-only action",
      });
      res.status(403).json({ message: "Forbidden" });
      return;
    }

    try {
      const participantId = await getParticipantId(req);

      if (!participantId) {
        res.status(404).json({ message: "Participant not found" });
        return;
      }

      const participant = await storage.getUser(participantId);

      if (!participant) {
        res.status(404).json({ message: "Participant not found" });
        return;
      }

      // Verify the coach is assigned to this participant
      if (participant.coachId !== user.id) {
        logger.logUnauthorizedAccess({
          userId: user.id,
          userRole: user.role,
          attemptedAction: `${req.method} ${req.path}`,
          resourceId: participantId,
          ipAddress: req.ip || req.socket?.remoteAddress || "unknown",
          timestamp: new Date(),
          reason: `Coach not assigned to participant ${participantId}`,
        });
        res.status(403).json({ message: "Forbidden" });
        return;
      }

      next();
    } catch (error) {
      console.error("Error in coach assignment check:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  };
}

/**
 * Middleware for self-access: user can only access their own data
 * Admins can access anyone's data
 *
 * @param getUserIdParam - Parameter name containing the user ID (default: "id")
 */
export function requireSelfOrAdmin(getUserIdParam: string = "id"): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user as any;
    const targetUserId = req.params[getUserIdParam];

    if (!user) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    if (user.id === targetUserId || user.role === "admin") {
      return next();
    }

    logger.logUnauthorizedAccess({
      userId: user.id,
      userRole: user.role,
      attemptedAction: `${req.method} ${req.path}`,
      resourceId: targetUserId,
      ipAddress: req.ip || req.socket?.remoteAddress || "unknown",
      timestamp: new Date(),
      reason: "Attempting to access another user's data",
    });

    res.status(403).json({ message: "Forbidden" });
  };
}

/**
 * Combine multiple authorization middlewares (all must pass)
 */
export function combineAuth(...middlewares: RequestHandler[]): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    let index = 0;

    const runNext = (err?: any): void => {
      if (err) {
        return next(err);
      }

      if (index >= middlewares.length) {
        return next();
      }

      const middleware = middlewares[index++];
      try {
        middleware(req, res, runNext);
      } catch (error) {
        next(error);
      }
    };

    runNext();
  };
}
