import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  executeParticipantToolCall,
  participantAssistantTools,
  PARTICIPANT_SYSTEM_PROMPT,
  type AssistantStorage,
} from "./participantAssistant";

/**
 * B1 scoping tests — the security contract for the participant AI partner.
 *
 * The core guarantee: no matter what a participant (or the model on their
 * behalf) puts in tool args, every storage read is performed with the
 * authenticated caller's own user id. Participant A can never elicit
 * participant B's data by id manipulation or by asking.
 */

const ATTACKER = "attacker-user-id";
const VICTIM = "victim-user-id";

function makeStorage(): AssistantStorage & {
  getMetricEntries: ReturnType<typeof vi.fn>;
  getFoodEntries: ReturnType<typeof vi.fn>;
  getMacroTarget: ReturnType<typeof vi.fn>;
  getUser: ReturnType<typeof vi.fn>;
} {
  return {
    getMetricEntries: vi.fn().mockResolvedValue([]),
    getFoodEntries: vi.fn().mockResolvedValue([]),
    getMacroTarget: vi.fn().mockResolvedValue(undefined),
    getUser: vi.fn().mockResolvedValue({ id: ATTACKER, programStartDate: null, timezone: "UTC" }),
  };
}

describe("participantAssistant — B1 self-scoping security", () => {
  let storage: ReturnType<typeof makeStorage>;
  beforeEach(() => {
    storage = makeStorage();
  });

  it("get_my_metrics always queries the caller's id, ignoring an injected participantId", async () => {
    await executeParticipantToolCall(
      "get_my_metrics",
      { participantId: VICTIM, userId: VICTIM, metricType: "WEIGHT" },
      { userId: ATTACKER, storage }
    );
    expect(storage.getMetricEntries).toHaveBeenCalledTimes(1);
    expect(storage.getMetricEntries.mock.calls[0][0]).toBe(ATTACKER);
    expect(storage.getMetricEntries.mock.calls[0][0]).not.toBe(VICTIM);
  });

  it("get_my_food always queries the caller's id, ignoring injected id args", async () => {
    await executeParticipantToolCall(
      "get_my_food",
      { participantId: VICTIM, userId: VICTIM, id: VICTIM },
      { userId: ATTACKER, storage }
    );
    expect(storage.getFoodEntries.mock.calls[0][0]).toBe(ATTACKER);
  });

  it("get_my_targets always queries the caller's id", async () => {
    await executeParticipantToolCall(
      "get_my_targets",
      { participantId: VICTIM, userId: VICTIM },
      { userId: ATTACKER, storage }
    );
    expect(storage.getMacroTarget).toHaveBeenCalledWith(ATTACKER);
  });

  it("get_my_profile always queries the caller's id", async () => {
    await executeParticipantToolCall(
      "get_my_profile",
      { participantId: VICTIM, userId: VICTIM },
      { userId: ATTACKER, storage }
    );
    expect(storage.getUser).toHaveBeenCalledWith(ATTACKER);
  });

  it("no tool ever receives the victim id in any storage call, across all tools", async () => {
    for (const tool of participantAssistantTools) {
      await executeParticipantToolCall(
        tool.name,
        { participantId: VICTIM, userId: VICTIM, id: VICTIM, targetUserId: VICTIM },
        { userId: ATTACKER, storage }
      );
    }
    const allCalls = [
      ...storage.getMetricEntries.mock.calls,
      ...storage.getFoodEntries.mock.calls,
      ...storage.getMacroTarget.mock.calls,
      ...storage.getUser.mock.calls,
    ];
    for (const call of allCalls) {
      expect(call[0]).toBe(ATTACKER);
      expect(call).not.toContain(VICTIM);
    }
  });

  it("tools expose NO participantId/userId parameter in their schemas (no id surface)", () => {
    for (const tool of participantAssistantTools) {
      const props = (tool.input_schema as any).properties ?? {};
      expect(props.participantId).toBeUndefined();
      expect(props.userId).toBeUndefined();
      expect(props.id).toBeUndefined();
    }
  });

  it("does not expose a search_participants tool (cannot enumerate others)", () => {
    const names = participantAssistantTools.map((t) => t.name);
    expect(names).not.toContain("search_participants");
  });

  it("unknown tools return an error, not another user's data", async () => {
    const result = await executeParticipantToolCall(
      "get_participant_metrics", // the admin tool name — must not exist here
      { participantId: VICTIM },
      { userId: ATTACKER, storage }
    );
    expect(result).toEqual({ error: expect.stringContaining("Unknown tool") });
    expect(storage.getMetricEntries).not.toHaveBeenCalled();
  });
});

describe("participantAssistant — B2 persona invariants", () => {
  it("positions as a wellness partner, not a clinical/medical provider", () => {
    expect(PARTICIPANT_SYSTEM_PROMPT).toMatch(/Optimization Partner/i);
    expect(PARTICIPANT_SYSTEM_PROMPT).toMatch(/NOT a medical provider/i);
  });

  it("contains explicit medication + hard-boundary guardrails", () => {
    expect(PARTICIPANT_SYSTEM_PROMPT).toMatch(/Never advise on medication/i);
    expect(PARTICIPANT_SYSTEM_PROMPT).toMatch(/dosing, titration/i);
    expect(PARTICIPANT_SYSTEM_PROMPT).toMatch(/prescribing provider/i);
    expect(PARTICIPANT_SYSTEM_PROMPT).toMatch(/hypothetically|role-play|across multiple messages/i);
  });
});
