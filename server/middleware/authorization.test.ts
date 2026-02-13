import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Request, Response, NextFunction } from "express";
import {
  requireAuth,
  requireRoles,
  requireAdmin,
  requireCoachOrAdmin,
  requireParticipant,
  requireOwnership,
  requireCoachAssignment,
  requireSelfOrAdmin,
  combineAuth,
  setAuthorizationLogger,
  resetAuthorizationLogger,
  type AuthorizationLogger,
  type Role,
} from "./authorization";

// Mock the storage module
vi.mock("../storage", () => ({
  storage: {
    getUser: vi.fn(),
  },
}));

import { storage } from "../storage";

// Helper to create mock request
function createMockRequest(overrides: Partial<Request> = {}): Request {
  return {
    method: "GET",
    path: "/test",
    params: {},
    body: {},
    query: {},
    user: undefined,
    isAuthenticated: () => false,
    ip: "127.0.0.1",
    socket: { remoteAddress: "127.0.0.1" },
    ...overrides,
  } as unknown as Request;
}

// Helper to create mock response
function createMockResponse(): Response {
  const res: Partial<Response> = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res as Response;
}

// Helper to create mock user
function createMockUser(role: Role, id: string = "user-123", coachId?: string) {
  return {
    id,
    email: `${role}@example.com`,
    role,
    name: `Test ${role}`,
    forcePasswordReset: false,
    coachId,
  };
}

describe("Authorization Middleware", () => {
  let mockLogger: AuthorizationLogger;
  let loggedAttempts: any[];

  beforeEach(() => {
    vi.clearAllMocks();
    loggedAttempts = [];
    mockLogger = {
      logUnauthorizedAccess: vi.fn((details) => {
        loggedAttempts.push(details);
      }),
    };
    setAuthorizationLogger(mockLogger);
  });

  afterEach(() => {
    resetAuthorizationLogger();
  });

  describe("requireAuth", () => {
    it("should call next() for authenticated users", () => {
      const req = createMockRequest({
        isAuthenticated: () => true,
        user: createMockUser("participant"),
      });
      const res = createMockResponse();
      const next = vi.fn();

      requireAuth(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it("should return 401 for unauthenticated users", () => {
      const req = createMockRequest({
        isAuthenticated: () => false,
      });
      const res = createMockResponse();
      const next = vi.fn();

      requireAuth(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: "Unauthorized" });
    });

    it("should log unauthorized access attempts", () => {
      const req = createMockRequest({
        isAuthenticated: () => false,
        method: "POST",
        path: "/api/admin/users",
      });
      const res = createMockResponse();
      const next = vi.fn();

      requireAuth(req, res, next);

      expect(mockLogger.logUnauthorizedAccess).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: undefined,
          userRole: undefined,
          attemptedAction: "POST /api/admin/users",
          reason: "Not authenticated",
        })
      );
    });
  });

  describe("requireRoles", () => {
    it("should allow access for users with matching role", () => {
      const middleware = requireRoles(["admin"]);
      const req = createMockRequest({
        user: createMockUser("admin"),
      });
      const res = createMockResponse();
      const next = vi.fn();

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it("should allow access for users with any of multiple allowed roles", () => {
      const middleware = requireRoles(["coach", "admin"]);

      // Test coach
      const reqCoach = createMockRequest({
        user: createMockUser("coach"),
      });
      const resCoach = createMockResponse();
      const nextCoach = vi.fn();

      middleware(reqCoach, resCoach, nextCoach);
      expect(nextCoach).toHaveBeenCalled();

      // Test admin
      const reqAdmin = createMockRequest({
        user: createMockUser("admin"),
      });
      const resAdmin = createMockResponse();
      const nextAdmin = vi.fn();

      middleware(reqAdmin, resAdmin, nextAdmin);
      expect(nextAdmin).toHaveBeenCalled();
    });

    it("should deny access for users with non-matching role", () => {
      const middleware = requireRoles(["admin"]);
      const req = createMockRequest({
        user: createMockUser("participant"),
      });
      const res = createMockResponse();
      const next = vi.fn();

      middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ message: "Forbidden" });
    });

    it("should return 401 when no user is present", () => {
      const middleware = requireRoles(["admin"]);
      const req = createMockRequest({
        user: undefined,
      });
      const res = createMockResponse();
      const next = vi.fn();

      middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it("should log unauthorized access with role mismatch", () => {
      const middleware = requireRoles(["admin"]);
      const req = createMockRequest({
        user: createMockUser("participant", "user-456"),
        method: "DELETE",
        path: "/api/admin/users/123",
      });
      const res = createMockResponse();
      const next = vi.fn();

      middleware(req, res, next);

      expect(mockLogger.logUnauthorizedAccess).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user-456",
          userRole: "participant",
          reason: "Role 'participant' not in allowed roles: [admin]",
        })
      );
    });
  });

  describe("requireAdmin convenience middleware", () => {
    it("should allow admin users", () => {
      const req = createMockRequest({
        user: createMockUser("admin"),
      });
      const res = createMockResponse();
      const next = vi.fn();

      requireAdmin(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it("should deny coach users", () => {
      const req = createMockRequest({
        user: createMockUser("coach"),
      });
      const res = createMockResponse();
      const next = vi.fn();

      requireAdmin(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("should deny participant users", () => {
      const req = createMockRequest({
        user: createMockUser("participant"),
      });
      const res = createMockResponse();
      const next = vi.fn();

      requireAdmin(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe("requireCoachOrAdmin convenience middleware", () => {
    it("should allow admin users", () => {
      const req = createMockRequest({
        user: createMockUser("admin"),
      });
      const res = createMockResponse();
      const next = vi.fn();

      requireCoachOrAdmin(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it("should allow coach users", () => {
      const req = createMockRequest({
        user: createMockUser("coach"),
      });
      const res = createMockResponse();
      const next = vi.fn();

      requireCoachOrAdmin(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it("should deny participant users", () => {
      const req = createMockRequest({
        user: createMockUser("participant"),
      });
      const res = createMockResponse();
      const next = vi.fn();

      requireCoachOrAdmin(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe("requireParticipant convenience middleware", () => {
    it("should allow participant users", () => {
      const req = createMockRequest({
        user: createMockUser("participant"),
      });
      const res = createMockResponse();
      const next = vi.fn();

      requireParticipant(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it("should deny admin users", () => {
      const req = createMockRequest({
        user: createMockUser("admin"),
      });
      const res = createMockResponse();
      const next = vi.fn();

      requireParticipant(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe("requireOwnership", () => {
    it("should allow access when user is the owner", async () => {
      const getOwnerId = vi.fn().mockResolvedValue("user-123");
      const middleware = requireOwnership(getOwnerId);
      const req = createMockRequest({
        user: createMockUser("participant", "user-123"),
      });
      const res = createMockResponse();
      const next = vi.fn();

      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it("should allow admin access to any resource by default", async () => {
      const getOwnerId = vi.fn().mockResolvedValue("other-user");
      const middleware = requireOwnership(getOwnerId);
      const req = createMockRequest({
        user: createMockUser("admin", "admin-123"),
      });
      const res = createMockResponse();
      const next = vi.fn();

      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it("should deny admin access when allowAdmin is false", async () => {
      const getOwnerId = vi.fn().mockResolvedValue("other-user");
      const middleware = requireOwnership(getOwnerId, { allowAdmin: false });
      const req = createMockRequest({
        user: createMockUser("admin", "admin-123"),
      });
      const res = createMockResponse();
      const next = vi.fn();

      await middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("should deny access when user is not the owner", async () => {
      const getOwnerId = vi.fn().mockResolvedValue("other-user");
      const middleware = requireOwnership(getOwnerId);
      const req = createMockRequest({
        user: createMockUser("participant", "user-123"),
      });
      const res = createMockResponse();
      const next = vi.fn();

      await middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("should return 404 when resource is not found", async () => {
      const getOwnerId = vi.fn().mockResolvedValue(undefined);
      const middleware = requireOwnership(getOwnerId, { resourceName: "Metric" });
      const req = createMockRequest({
        user: createMockUser("participant"),
      });
      const res = createMockResponse();
      const next = vi.fn();

      await middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: "Metric not found" });
    });

    it("should allow coach access when allowCoach is true and coach is assigned", async () => {
      const getOwnerId = vi.fn().mockResolvedValue("participant-123");
      vi.mocked(storage.getUser).mockResolvedValue({
        id: "participant-123",
        coachId: "coach-123",
        role: "participant",
        email: "p@test.com",
        name: "Participant",
      } as any);

      const middleware = requireOwnership(getOwnerId, { allowCoach: true });
      const req = createMockRequest({
        user: createMockUser("coach", "coach-123"),
      });
      const res = createMockResponse();
      const next = vi.fn();

      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it("should deny coach access when coach is not assigned to participant", async () => {
      const getOwnerId = vi.fn().mockResolvedValue("participant-123");
      vi.mocked(storage.getUser).mockResolvedValue({
        id: "participant-123",
        coachId: "other-coach",
        role: "participant",
        email: "p@test.com",
        name: "Participant",
      } as any);

      const middleware = requireOwnership(getOwnerId, { allowCoach: true });
      const req = createMockRequest({
        user: createMockUser("coach", "coach-123"),
      });
      const res = createMockResponse();
      const next = vi.fn();

      await middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe("requireCoachAssignment", () => {
    it("should allow admin access to any participant", async () => {
      const getParticipantId = vi.fn().mockResolvedValue("any-participant");
      const middleware = requireCoachAssignment(getParticipantId);
      const req = createMockRequest({
        user: createMockUser("admin"),
      });
      const res = createMockResponse();
      const next = vi.fn();

      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(storage.getUser).not.toHaveBeenCalled();
    });

    it("should allow coach access to assigned participant", async () => {
      const getParticipantId = vi.fn().mockResolvedValue("participant-123");
      vi.mocked(storage.getUser).mockResolvedValue({
        id: "participant-123",
        coachId: "coach-123",
        role: "participant",
        email: "p@test.com",
        name: "Participant",
      } as any);

      const middleware = requireCoachAssignment(getParticipantId);
      const req = createMockRequest({
        user: createMockUser("coach", "coach-123"),
      });
      const res = createMockResponse();
      const next = vi.fn();

      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it("should deny coach access to unassigned participant", async () => {
      const getParticipantId = vi.fn().mockResolvedValue("participant-123");
      vi.mocked(storage.getUser).mockResolvedValue({
        id: "participant-123",
        coachId: "other-coach",
        role: "participant",
        email: "p@test.com",
        name: "Participant",
      } as any);

      const middleware = requireCoachAssignment(getParticipantId);
      const req = createMockRequest({
        user: createMockUser("coach", "coach-123"),
      });
      const res = createMockResponse();
      const next = vi.fn();

      await middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("should deny participant access", async () => {
      const getParticipantId = vi.fn().mockResolvedValue("any-id");
      const middleware = requireCoachAssignment(getParticipantId);
      const req = createMockRequest({
        user: createMockUser("participant"),
      });
      const res = createMockResponse();
      const next = vi.fn();

      await middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("should return 404 when participant not found", async () => {
      const getParticipantId = vi.fn().mockResolvedValue("nonexistent");
      vi.mocked(storage.getUser).mockResolvedValue(undefined);

      const middleware = requireCoachAssignment(getParticipantId);
      const req = createMockRequest({
        user: createMockUser("coach"),
      });
      const res = createMockResponse();
      const next = vi.fn();

      await middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe("requireSelfOrAdmin", () => {
    it("should allow user to access their own data", () => {
      const middleware = requireSelfOrAdmin();
      const req = createMockRequest({
        user: createMockUser("participant", "user-123"),
        params: { id: "user-123" },
      });
      const res = createMockResponse();
      const next = vi.fn();

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it("should allow admin to access any user's data", () => {
      const middleware = requireSelfOrAdmin();
      const req = createMockRequest({
        user: createMockUser("admin", "admin-123"),
        params: { id: "other-user-456" },
      });
      const res = createMockResponse();
      const next = vi.fn();

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it("should deny user access to another user's data", () => {
      const middleware = requireSelfOrAdmin();
      const req = createMockRequest({
        user: createMockUser("participant", "user-123"),
        params: { id: "other-user-456" },
      });
      const res = createMockResponse();
      const next = vi.fn();

      middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("should work with custom parameter name", () => {
      const middleware = requireSelfOrAdmin("userId");
      const req = createMockRequest({
        user: createMockUser("participant", "user-123"),
        params: { userId: "user-123" },
      });
      const res = createMockResponse();
      const next = vi.fn();

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it("should log unauthorized cross-user access attempts", () => {
      const middleware = requireSelfOrAdmin();
      const req = createMockRequest({
        user: createMockUser("participant", "user-123"),
        params: { id: "victim-456" },
        method: "GET",
        path: "/api/users/victim-456",
      });
      const res = createMockResponse();
      const next = vi.fn();

      middleware(req, res, next);

      expect(mockLogger.logUnauthorizedAccess).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user-123",
          userRole: "participant",
          resourceId: "victim-456",
          reason: "Attempting to access another user's data",
        })
      );
    });
  });

  describe("combineAuth", () => {
    it("should pass when all middlewares pass", async () => {
      const middleware1 = vi.fn((req, res, next) => next());
      const middleware2 = vi.fn((req, res, next) => next());
      const combined = combineAuth(middleware1, middleware2);

      const req = createMockRequest();
      const res = createMockResponse();
      const next = vi.fn();

      await combined(req, res, next);

      expect(middleware1).toHaveBeenCalled();
      expect(middleware2).toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });

    it("should stop when a middleware fails", async () => {
      const middleware1 = vi.fn((req, res, next) => {
        res.status(403).json({ message: "Forbidden" });
      });
      const middleware2 = vi.fn((req, res, next) => next());
      const combined = combineAuth(middleware1, middleware2);

      const req = createMockRequest();
      const res = createMockResponse();
      const next = vi.fn();

      await combined(req, res, next);

      expect(middleware1).toHaveBeenCalled();
      expect(middleware2).not.toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe("Edge Cases", () => {
    it("should handle missing user context gracefully", () => {
      const middleware = requireRoles(["admin"]);
      const req = createMockRequest({
        user: null as any,
      });
      const res = createMockResponse();
      const next = vi.fn();

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it("should handle invalid role gracefully", () => {
      const middleware = requireRoles(["admin"]);
      const req = createMockRequest({
        user: { id: "123", role: "invalid-role" } as any,
      });
      const res = createMockResponse();
      const next = vi.fn();

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("should handle empty allowed roles array", () => {
      const middleware = requireRoles([]);
      const req = createMockRequest({
        user: createMockUser("admin"),
      });
      const res = createMockResponse();
      const next = vi.fn();

      middleware(req, res, next);

      // No roles allowed, so everyone should be denied
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe("ID Manipulation Attack Prevention", () => {
    it("should prevent participant from accessing another participant's metrics by ID", async () => {
      const getOwnerId = vi.fn().mockResolvedValue("victim-user-id");
      const middleware = requireOwnership(getOwnerId, { resourceName: "Metric entry" });

      const req = createMockRequest({
        user: createMockUser("participant", "attacker-user-id"),
        params: { id: "manipulated-metric-id" },
        method: "PUT",
        path: "/api/metrics/manipulated-metric-id",
      });
      const res = createMockResponse();
      const next = vi.fn();

      await middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(mockLogger.logUnauthorizedAccess).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "attacker-user-id",
          resourceId: "victim-user-id",
          reason: "User does not own Metric entry and lacks override privileges",
        })
      );
    });

    it("should prevent coach from accessing non-assigned participant's data", async () => {
      const getOwnerId = vi.fn().mockResolvedValue("unassigned-participant");
      vi.mocked(storage.getUser).mockResolvedValue({
        id: "unassigned-participant",
        coachId: "different-coach-id",
        role: "participant",
        email: "p@test.com",
        name: "Unassigned Participant",
      } as any);

      const middleware = requireOwnership(getOwnerId, {
        allowCoach: true,
        resourceName: "Food entry",
      });

      const req = createMockRequest({
        user: createMockUser("coach", "attacking-coach-id"),
        params: { id: "target-food-entry" },
        method: "DELETE",
        path: "/api/food/target-food-entry",
      });
      const res = createMockResponse();
      const next = vi.fn();

      await middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });
});
