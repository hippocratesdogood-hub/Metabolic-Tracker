/**
 * Account-security helpers for user creation/update from untrusted client input.
 *
 * Privilege-escalation guard (B0): any field that grants elevated access must be
 * assigned by the server, never accepted from the request body. A self-service
 * signup or a self-profile-update must not be able to set these.
 */

/** Fields a client must never be able to set on itself. */
export const PRIVILEGE_FIELDS = [
  "role",
  "status",
  "coachId",
  "forcePasswordReset",
] as const;

type Sanitized<T> = Omit<T, (typeof PRIVILEGE_FIELDS)[number]>;

/**
 * Return a shallow copy of `input` with all privilege-bearing fields removed.
 * Use on any payload that originates from a non-admin client before it reaches
 * storage.createUser / storage.updateUser.
 */
export function stripPrivilegeFields<T extends Record<string, any>>(
  input: T
): Sanitized<T> {
  const clone: Record<string, any> = { ...input };
  for (const field of PRIVILEGE_FIELDS) {
    delete clone[field];
  }
  return clone as Sanitized<T>;
}

/**
 * Build the create-user payload for a self-service signup: strip anything the
 * client tried to smuggle in, then force the lowest-privilege role. The returned
 * object always has `role: "participant"` regardless of the input.
 */
export function buildSelfSignupUser<T extends Record<string, any>>(
  input: T
): Sanitized<T> & { role: "participant" } {
  return {
    ...stripPrivilegeFields(input),
    role: "participant",
  };
}
