/**
 * AI-unavailable 503 contract — acceptance tests.
 *
 * Mirrors the project's testing convention (cf. dayView.test.ts): exercises
 * the pure contract directly rather than spinning up Express. Guards the
 * spec's wire shape (D1) and the patient-facing "no dev terms" criterion
 * (§7) at the contract boundary, where both food-analysis endpoints share it.
 */

import { describe, it, expect } from "vitest";
import {
  AI_UNAVAILABLE_CODE,
  aiUnavailableBody,
  type AiUnavailableBody,
} from "./aiUnavailable";

describe("aiUnavailableBody()", () => {
  it("matches the D1 wire shape exactly", () => {
    expect(aiUnavailableBody()).toEqual({
      code: "AI_UNAVAILABLE",
      message: "Automatic meal analysis is temporarily unavailable.",
      fallbacks: ["favorite", "barcode", "manual"],
    });
  });

  it("uses the shared code constant the client branches on", () => {
    expect(aiUnavailableBody().code).toBe(AI_UNAVAILABLE_CODE);
    expect(AI_UNAVAILABLE_CODE).toBe("AI_UNAVAILABLE");
  });

  it("returns a fresh object each call (no shared mutable state)", () => {
    const a = aiUnavailableBody();
    const b = aiUnavailableBody();
    expect(a).not.toBe(b);
    expect(a.fallbacks).not.toBe(b.fallbacks);
    a.fallbacks.push("manual");
    expect(b.fallbacks).toEqual(["favorite", "barcode", "manual"]);
  });

  it("offers exactly the three non-AI logging paths", () => {
    expect(new Set(aiUnavailableBody().fallbacks)).toEqual(
      new Set<AiUnavailableBody["fallbacks"][number]>([
        "favorite",
        "barcode",
        "manual",
      ]),
    );
  });

  it("leaks no vendor / env / dev terms in any string field", () => {
    const body = aiUnavailableBody();
    const haystack = JSON.stringify(body).toLowerCase();
    for (const forbidden of [
      ".env",
      "anthropic",
      "anthropic_api_key",
      "openai",
      "api key",
      "claude",
      "503",
    ]) {
      expect(haystack).not.toContain(forbidden);
    }
  });
});
