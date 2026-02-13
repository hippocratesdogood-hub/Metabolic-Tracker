/**
 * React Error Boundary Component
 *
 * Catches JavaScript errors anywhere in the child component tree,
 * logs them, and displays a fallback UI instead of crashing.
 *
 * Usage:
 * ```tsx
 * <AppErrorBoundary>
 *   <YourComponent />
 * </AppErrorBoundary>
 * ```
 *
 * For page-level boundaries:
 * ```tsx
 * <PageErrorBoundary pageName="Dashboard">
 *   <Dashboard />
 * </PageErrorBoundary>
 * ```
 */

import React, { Component, ErrorInfo, ReactNode } from "react";
import { reportError, ErrorSeverity } from "@/lib/errorTracking";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, RefreshCw, Home, Bug } from "lucide-react";

// ============================================================================
// TYPES
// ============================================================================

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Name of the component/page for error tracking */
  name?: string;
  /** Custom fallback component */
  fallback?: ReactNode;
  /** Called when an error is caught */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /** Show detailed error in development */
  showDetails?: boolean;
  /** Severity level for this boundary */
  severity?: ErrorSeverity;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  eventId: string | null;
}

// ============================================================================
// APP ERROR BOUNDARY
// ============================================================================

/**
 * Main application error boundary.
 * Wraps the entire app to catch fatal errors.
 */
export class AppErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      eventId: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const { name = "App", onError, severity = ErrorSeverity.CRITICAL } = this.props;

    // Report to error tracking
    const eventId = reportError(error, severity, {
      component: name,
      action: "componentCatch",
      metadata: {
        componentStack: errorInfo.componentStack?.slice(0, 500) || "unknown",
      },
    });

    this.setState({ errorInfo, eventId });

    // Call custom error handler if provided
    onError?.(error, errorInfo);

    // Log to console in development
    if (import.meta.env.MODE !== "production") {
      console.error("Error caught by boundary:", error);
      console.error("Component stack:", errorInfo.componentStack);
    }
  }

  handleRetry = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      eventId: null,
    });
  };

  handleGoHome = (): void => {
    window.location.href = "/";
  };

  handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    const { hasError, error, errorInfo, eventId } = this.state;
    const { children, fallback, showDetails = import.meta.env.MODE !== "production" } = this.props;

    if (hasError) {
      if (fallback) {
        return fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <Card className="max-w-lg w-full">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-red-100 flex items-center justify-center">
                <AlertTriangle className="h-6 w-6 text-red-600" />
              </div>
              <CardTitle className="text-xl">Something went wrong</CardTitle>
              <CardDescription>
                We encountered an unexpected error. Our team has been notified.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {showDetails && error && (
                <div className="rounded-lg bg-muted p-4 text-sm font-mono overflow-auto max-h-40">
                  <p className="font-semibold text-destructive">{error.name}: {error.message}</p>
                  {errorInfo?.componentStack && (
                    <pre className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap">
                      {errorInfo.componentStack.slice(0, 500)}
                    </pre>
                  )}
                </div>
              )}

              {eventId && (
                <p className="text-xs text-muted-foreground text-center">
                  Error ID: {eventId}
                </p>
              )}

              <div className="flex flex-col sm:flex-row gap-2">
                <Button onClick={this.handleRetry} variant="default" className="flex-1">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Try Again
                </Button>
                <Button onClick={this.handleGoHome} variant="outline" className="flex-1">
                  <Home className="h-4 w-4 mr-2" />
                  Go Home
                </Button>
              </div>

              <Button
                onClick={this.handleReload}
                variant="ghost"
                className="w-full text-muted-foreground"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Reload Page
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }

    return children;
  }
}

// ============================================================================
// PAGE ERROR BOUNDARY
// ============================================================================

interface PageErrorBoundaryProps extends ErrorBoundaryProps {
  pageName: string;
}

/**
 * Page-level error boundary with page-specific recovery options.
 */
export class PageErrorBoundary extends Component<PageErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: PageErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      eventId: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const { pageName, onError, severity = ErrorSeverity.HIGH } = this.props;

    const eventId = reportError(error, severity, {
      component: `Page:${pageName}`,
      action: "pageError",
      metadata: {
        componentStack: errorInfo.componentStack?.slice(0, 500) || "unknown",
      },
    });

    this.setState({ errorInfo, eventId });
    onError?.(error, errorInfo);
  }

  handleRetry = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      eventId: null,
    });
  };

  render(): ReactNode {
    const { hasError, error, eventId } = this.state;
    const { children, pageName, fallback, showDetails = import.meta.env.MODE !== "production" } = this.props;

    if (hasError) {
      if (fallback) {
        return fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center p-8 min-h-[400px]">
          <div className="text-center max-w-md">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-amber-100 flex items-center justify-center">
              <Bug className="h-6 w-6 text-amber-600" />
            </div>
            <h2 className="text-lg font-semibold mb-2">Unable to load {pageName}</h2>
            <p className="text-muted-foreground mb-4">
              There was a problem loading this page. Please try again.
            </p>

            {showDetails && error && (
              <div className="rounded-lg bg-muted p-3 text-xs font-mono text-left mb-4 overflow-auto max-h-24">
                {error.message}
              </div>
            )}

            {eventId && (
              <p className="text-xs text-muted-foreground mb-4">
                Error ID: {eventId}
              </p>
            )}

            <Button onClick={this.handleRetry}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </div>
      );
    }

    return children;
  }
}

// ============================================================================
// COMPONENT ERROR BOUNDARY
// ============================================================================

/**
 * Component-level error boundary with minimal UI disruption.
 */
export class ComponentErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      eventId: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const { name = "Component", onError, severity = ErrorSeverity.MEDIUM } = this.props;

    const eventId = reportError(error, severity, {
      component: name,
      action: "componentError",
    });

    this.setState({ errorInfo, eventId });
    onError?.(error, errorInfo);
  }

  handleRetry = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      eventId: null,
    });
  };

  render(): ReactNode {
    const { hasError } = this.state;
    const { children, fallback, name } = this.props;

    if (hasError) {
      if (fallback) {
        return fallback;
      }

      return (
        <div className="rounded-lg border border-dashed border-muted-foreground/25 p-4 text-center">
          <p className="text-sm text-muted-foreground mb-2">
            {name ? `${name} failed to load` : "Component failed to load"}
          </p>
          <Button size="sm" variant="ghost" onClick={this.handleRetry}>
            <RefreshCw className="h-3 w-3 mr-1" />
            Retry
          </Button>
        </div>
      );
    }

    return children;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default AppErrorBoundary;
