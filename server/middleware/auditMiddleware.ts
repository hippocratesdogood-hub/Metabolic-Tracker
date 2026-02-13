/**
 * Audit Middleware
 *
 * Express middleware for automatic audit logging of PHI access and data modifications.
 * Apply these middleware functions to routes that access or modify protected health information.
 */

import type { RequestHandler, Request, Response, NextFunction } from "express";
import type { User, AuditResourceType } from "../../shared/schema";
import {
  auditPhiAccess,
  auditRecordCreate,
  auditRecordUpdate,
  auditRecordDelete,
  auditAccessDenied,
} from "../services/auditLogger";

/**
 * Get the authenticated user from request
 */
function getRequestUser(req: Request): Pick<User, "id" | "role"> | undefined {
  const user = req.user as User | undefined;
  if (user) {
    return { id: user.id, role: user.role };
  }
  return undefined;
}

/**
 * Extract resource ID from request params or body
 */
function getResourceId(req: Request, paramName: string = "id"): string | undefined {
  return req.params[paramName] || req.body?.id;
}

/**
 * Extract target user ID from request
 * Used when accessing another user's data (e.g., coach viewing participant)
 */
function getTargetUserId(req: Request): string | undefined {
  return (
    req.params.userId ||
    req.params.participantId ||
    req.query.userId as string ||
    req.body?.userId
  );
}

/**
 * Middleware to audit PHI read access
 *
 * Apply to GET routes that return protected health information.
 * Logs the access after successful response.
 *
 * @param resourceType - The type of resource being accessed
 * @param options - Configuration options
 */
export function auditPhiRead(
  resourceType: AuditResourceType,
  options: {
    /** Parameter name containing the resource ID (default: "id") */
    resourceIdParam?: string;
    /** Whether to extract target user ID from request (default: true) */
    extractTargetUser?: boolean;
  } = {}
): RequestHandler {
  const { resourceIdParam = "id", extractTargetUser = true } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    // Store original json method
    const originalJson = res.json.bind(res);

    // Override json to log after successful response
    res.json = function (body: unknown) {
      // Only audit successful responses (2xx status codes)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const user = getRequestUser(req);
        if (user) {
          const resourceId = getResourceId(req, resourceIdParam);
          const targetUserId = extractTargetUser ? getTargetUserId(req) : undefined;

          // Log asynchronously, don't block response
          auditPhiAccess(user, req, resourceType, resourceId || "multiple", targetUserId).catch(
            (err) => console.error("[AUDIT_MIDDLEWARE] Failed to log PHI access:", err)
          );
        }
      }

      return originalJson(body);
    };

    next();
  };
}

/**
 * Middleware to audit record creation
 *
 * Apply to POST routes that create new records.
 * Logs the creation after successful response.
 *
 * @param resourceType - The type of resource being created
 */
export function auditCreate(resourceType: AuditResourceType): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const originalJson = res.json.bind(res);

    res.json = function (body: unknown) {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const user = getRequestUser(req);
        if (user) {
          // Try to get ID from response body
          const responseBody = body as Record<string, unknown> | undefined;
          const resourceId = responseBody?.id as string || "unknown";

          auditRecordCreate(user, req, resourceType, resourceId).catch((err) =>
            console.error("[AUDIT_MIDDLEWARE] Failed to log record creation:", err)
          );
        }
      }

      return originalJson(body);
    };

    next();
  };
}

/**
 * Middleware to audit record updates
 *
 * Apply to PUT/PATCH routes that modify existing records.
 *
 * @param resourceType - The type of resource being updated
 * @param options - Configuration options
 */
export function auditUpdate(
  resourceType: AuditResourceType,
  options: {
    resourceIdParam?: string;
    /** Fields that were potentially changed (for audit metadata) */
    trackFields?: string[];
  } = {}
): RequestHandler {
  const { resourceIdParam = "id", trackFields } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    const originalJson = res.json.bind(res);

    res.json = function (body: unknown) {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const user = getRequestUser(req);
        if (user) {
          const resourceId = getResourceId(req, resourceIdParam);

          // Determine which fields were changed (if tracking specified fields)
          let changedFields: string[] | undefined;
          if (trackFields) {
            changedFields = trackFields.filter((field) => req.body?.[field] !== undefined);
          }

          auditRecordUpdate(user, req, resourceType, resourceId || "unknown", changedFields).catch(
            (err) => console.error("[AUDIT_MIDDLEWARE] Failed to log record update:", err)
          );
        }
      }

      return originalJson(body);
    };

    next();
  };
}

/**
 * Middleware to audit record deletion
 *
 * Apply to DELETE routes.
 *
 * @param resourceType - The type of resource being deleted
 * @param resourceIdParam - Parameter name containing the resource ID
 */
export function auditDelete(
  resourceType: AuditResourceType,
  resourceIdParam: string = "id"
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const resourceId = getResourceId(req, resourceIdParam);
    const user = getRequestUser(req);

    // Use res.on('finish') to log after response completes
    res.on("finish", () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        if (user) {
          auditRecordDelete(user, req, resourceType, resourceId || "unknown").catch((err) =>
            console.error("[AUDIT_MIDDLEWARE] Failed to log record deletion:", err)
          );
        }
      }
    });

    next();
  };
}

/**
 * Middleware to audit access denial
 *
 * Use this to manually trigger an access denied audit when authorization fails.
 * This is typically called from authorization middleware when access is denied.
 *
 * @param req - Express request
 * @param resourceType - Type of resource access was denied for
 * @param resourceId - ID of the resource (optional)
 * @param reason - Reason for denial
 */
export async function logAccessDenied(
  req: Request,
  resourceType: AuditResourceType,
  resourceId?: string,
  reason?: string
): Promise<void> {
  const user = getRequestUser(req);
  await auditAccessDenied(user || null, req, resourceType, resourceId, reason);
}

/**
 * Create a combined middleware for a complete CRUD resource
 *
 * Returns an object with middleware for each operation type.
 *
 * @param resourceType - The type of resource
 * @param resourceIdParam - Parameter name for resource ID (default: "id")
 */
export function createResourceAuditMiddleware(
  resourceType: AuditResourceType,
  resourceIdParam: string = "id"
) {
  return {
    read: auditPhiRead(resourceType, { resourceIdParam }),
    create: auditCreate(resourceType),
    update: auditUpdate(resourceType, { resourceIdParam }),
    delete: auditDelete(resourceType, resourceIdParam),
  };
}
