import { describe, it, expect } from "vitest";
import {
  stripPrivilegeFields,
  buildSelfSignupUser,
  PRIVILEGE_FIELDS,
} from "./accountSecurity";

describe("accountSecurity — privilege-escalation guard (B0)", () => {
  describe("buildSelfSignupUser", () => {
    it("forces role to participant even when the client sends role: admin", () => {
      const result = buildSelfSignupUser({
        email: "attacker@example.com",
        name: "Attacker",
        passwordHash: "hashed",
        role: "admin",
      });
      expect(result.role).toBe("participant");
    });

    it("forces role to participant when the client sends role: coach", () => {
      const result = buildSelfSignupUser({
        email: "x@example.com",
        name: "X",
        passwordHash: "h",
        role: "coach",
      });
      expect(result.role).toBe("participant");
    });

    it("assigns role: participant when no role is supplied", () => {
      const result = buildSelfSignupUser({
        email: "x@example.com",
        name: "X",
        passwordHash: "h",
      });
      expect(result.role).toBe("participant");
    });

    it("strips every privilege field the client tries to smuggle in", () => {
      const result = buildSelfSignupUser({
        email: "x@example.com",
        name: "X",
        passwordHash: "h",
        role: "admin",
        status: "active",
        coachId: "some-coach-id",
        forcePasswordReset: false,
      }) as Record<string, any>;

      expect(result.status).toBeUndefined();
      expect(result.coachId).toBeUndefined();
      expect(result.forcePasswordReset).toBeUndefined();
      // role is not stripped-then-absent; it is stripped then re-set to participant
      expect(result.role).toBe("participant");
    });

    it("preserves legitimate non-privilege fields", () => {
      const result = buildSelfSignupUser({
        email: "x@example.com",
        name: "Jane",
        passwordHash: "h",
        phone: "555-1234",
        timezone: "America/New_York",
        role: "admin",
      }) as Record<string, any>;

      expect(result.email).toBe("x@example.com");
      expect(result.name).toBe("Jane");
      expect(result.phone).toBe("555-1234");
      expect(result.timezone).toBe("America/New_York");
    });

    it("does not mutate the caller's input object", () => {
      const input = {
        email: "x@example.com",
        name: "X",
        passwordHash: "h",
        role: "admin",
      };
      buildSelfSignupUser(input);
      expect(input.role).toBe("admin"); // original untouched
    });
  });

  describe("stripPrivilegeFields", () => {
    it("removes all known privilege fields", () => {
      const stripped = stripPrivilegeFields({
        name: "X",
        role: "admin",
        status: "active",
        coachId: "c1",
        forcePasswordReset: true,
      }) as Record<string, any>;

      for (const field of PRIVILEGE_FIELDS) {
        expect(stripped[field]).toBeUndefined();
      }
      expect(stripped.name).toBe("X");
    });

    it("is a no-op for payloads without privilege fields", () => {
      const stripped = stripPrivilegeFields({ name: "X", phone: "5" });
      expect(stripped).toEqual({ name: "X", phone: "5" });
    });
  });
});
