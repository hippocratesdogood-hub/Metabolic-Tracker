/**
 * Biomarker-gated prompt rule evaluation + personalization tests.
 *
 * Unit-level: mocks the biomarker fetcher so these tests don't need a DB.
 * Storage-layer behavior (SQL maxAgeDays filter, latest-per-biomarker
 * index seek) is exercised via end-to-end dev testing rather than mocked
 * here — Drizzle query shapes don't benefit much from unit mocking.
 */

import { describe, it, expect } from "vitest";
import { PromptEngine, type UserContext, type ConditionConfig } from "../services/promptEngine";
import { scoreBiomarker, type BiomarkerScore } from "../services/scoring";
import type { Biomarker } from "@shared/schema";

// ----- fixtures ------------------------------------------------------

const baseBiomarkerFields = {
  createdAt: new Date(),
  updatedAt: new Date(),
  sortOrder: 0,
  isActive: true,
  description: null,
  patientExplanation: null,
  abbreviation: null,
  isDerived: false,
  derivationFormula: null,
};

const hsCrp: Biomarker = {
  ...baseBiomarkerFields,
  id: "bio-crp",
  slug: "hs_crp",
  name: "High-Sensitivity CRP",
  abbreviation: "hs-CRP",
  unit: "mg/L",
  category: "inflammation",
  flagDirection: "high_bad",
  standardLow: null,
  standardHigh: 3.0,
  optimalLow: null,
  optimalHigh: 1.0,
  criticalLow: null,
  criticalHigh: 10.0,
  clinicalNote: null,
};

const homaIr: Biomarker = {
  ...baseBiomarkerFields,
  id: "bio-homa",
  slug: "homa_ir",
  name: "HOMA-IR",
  abbreviation: "HOMA-IR",
  unit: "ratio",
  category: "derived",
  flagDirection: "high_bad",
  standardLow: null,
  standardHigh: 2.5,
  optimalLow: null,
  optimalHigh: 1.5,
  criticalLow: null,
  criticalHigh: 5.0,
  isDerived: true,
  derivationFormula: "(fasting_insulin * fasting_glucose) / 405",
  clinicalNote: null,
};

const mockContext: UserContext = {
  id: "user-1",
  name: "Test Patient",
  email: "patient@dev.local",
  timezone: "America/Los_Angeles",
  lastLogDate: new Date(),
  daysSinceLastLog: 0,
  metrics: {
    glucose: { latest: null, average7Day: null, highDays: 0 },
    bp: { latest: null, elevatedDays: 0 },
    weight: { latest: null, change30Day: null },
    ketones: { latest: null },
  },
  targets: null,
};

/**
 * Build a fetcher that returns a canned map of slug → score. Tracks how
 * many times each slug is requested so tests can assert on cache behavior.
 */
function makeFetcher(scores: Record<string, BiomarkerScore | null>) {
  const calls: Array<{ slug: string; maxAgeDays: number }> = [];
  const fetcher = async (slug: string, maxAgeDays: number) => {
    calls.push({ slug, maxAgeDays });
    return scores[slug] ?? null;
  };
  return { fetcher, calls };
}

// ----- evaluator tests ----------------------------------------------

describe("evaluateBiomarkerCondition", () => {
  const engine = new PromptEngine();

  it("matches by severity when the patient's biomarker has that severity", async () => {
    const score = scoreBiomarker(5.0, hsCrp); // abnormal
    const { fetcher } = makeFetcher({ hs_crp: score });
    const conditions: ConditionConfig = {
      biomarkerSlug: "hs_crp",
      biomarkerSeverity: "abnormal",
    };
    const matched = await engine.evaluateBiomarkerCondition(conditions, fetcher);
    expect(matched).toBe(true);
  });

  it("does not match when severity differs", async () => {
    const score = scoreBiomarker(0.6, hsCrp); // optimal
    const { fetcher } = makeFetcher({ hs_crp: score });
    const matched = await engine.evaluateBiomarkerCondition(
      { biomarkerSlug: "hs_crp", biomarkerSeverity: "abnormal" },
      fetcher
    );
    expect(matched).toBe(false);
  });

  it("matches by numeric operator + value when severity is not set", async () => {
    const score = scoreBiomarker(1.8, hsCrp); // borderline, raw value 1.8
    const { fetcher } = makeFetcher({ hs_crp: score });
    const matched = await engine.evaluateBiomarkerCondition(
      { biomarkerSlug: "hs_crp", operator: "gt", value: 1.0 },
      fetcher
    );
    expect(matched).toBe(true);
  });

  it("returns false when the biomarker has no recent lab result", async () => {
    const { fetcher } = makeFetcher({}); // no scores — lab missing or too old
    const matched = await engine.evaluateBiomarkerCondition(
      { biomarkerSlug: "hs_crp", biomarkerSeverity: "abnormal" },
      fetcher
    );
    expect(matched).toBe(false);
  });

  it("returns false when rule is misconfigured (no severity, no operator+value)", async () => {
    const score = scoreBiomarker(5.0, hsCrp);
    const { fetcher } = makeFetcher({ hs_crp: score });
    const matched = await engine.evaluateBiomarkerCondition(
      { biomarkerSlug: "hs_crp" }, // missing severity AND operator/value
      fetcher
    );
    expect(matched).toBe(false);
  });

  it("defaults to 180-day max age when not specified", async () => {
    const { fetcher, calls } = makeFetcher({});
    await engine.evaluateBiomarkerCondition(
      { biomarkerSlug: "hs_crp", biomarkerSeverity: "abnormal" },
      fetcher
    );
    expect(calls).toEqual([{ slug: "hs_crp", maxAgeDays: 180 }]);
  });

  it("passes through custom maxAgeDays to the fetcher", async () => {
    const { fetcher, calls } = makeFetcher({});
    await engine.evaluateBiomarkerCondition(
      { biomarkerSlug: "hs_crp", biomarkerSeverity: "abnormal", maxAgeDays: 30 },
      fetcher
    );
    expect(calls).toEqual([{ slug: "hs_crp", maxAgeDays: 30 }]);
  });
});

// ----- rule-level routing tests -------------------------------------

describe("evaluateRule — biomarker gating", () => {
  const engine = new PromptEngine();

  it("schedule trigger + biomarker gate fires only when both match", async () => {
    const abnormalScore = scoreBiomarker(5.0, hsCrp);
    const { fetcher } = makeFetcher({ hs_crp: abnormalScore });

    // Rule: every hour, if hs-CRP is abnormal (schedule with no filters
    // matches every tick; biomarker gate should decide)
    const rule = {
      id: "r1",
      key: "crp_alert",
      promptId: "p1",
      triggerType: "schedule" as const,
      scheduleJson: {}, // empty schedule → every hour tick
      conditionsJson: {
        biomarkerSlug: "hs_crp",
        biomarkerSeverity: "abnormal",
      } as ConditionConfig,
      cooldownHours: 24,
      priority: 10,
      active: true,
    };

    const matched = await engine.evaluateRule(rule, mockContext, fetcher);
    expect(matched).toBe(true);
  });

  it("schedule trigger with biomarker gate returns false when severity does not match", async () => {
    const optimalScore = scoreBiomarker(0.5, hsCrp);
    const { fetcher } = makeFetcher({ hs_crp: optimalScore });

    const rule = {
      id: "r2",
      key: "crp_alert",
      promptId: "p1",
      triggerType: "schedule" as const,
      scheduleJson: {},
      conditionsJson: {
        biomarkerSlug: "hs_crp",
        biomarkerSeverity: "abnormal",
      } as ConditionConfig,
      cooldownHours: 24,
      priority: 10,
      active: true,
    };

    expect(await engine.evaluateRule(rule, mockContext, fetcher)).toBe(false);
  });

  it("event trigger keyed on biomarker (no metricType) passes trigger gate, then biomarker gate decides", async () => {
    const abnormalScore = scoreBiomarker(4.0, homaIr);
    const { fetcher } = makeFetcher({ homa_ir: abnormalScore });

    const rule = {
      id: "r3",
      key: "homa_alert",
      promptId: "p2",
      triggerType: "event" as const,
      scheduleJson: null,
      conditionsJson: {
        biomarkerSlug: "homa_ir",
        biomarkerSeverity: "abnormal",
      } as ConditionConfig,
      cooldownHours: 24,
      priority: 10,
      active: true,
    };

    expect(await engine.evaluateRule(rule, mockContext, fetcher)).toBe(true);
  });
});

// ----- personalization tests ----------------------------------------

describe("personalizeMessage — biomarker tokens", () => {
  const engine = new PromptEngine();

  it("substitutes value, label, severity, and unit tokens", () => {
    const score = scoreBiomarker(5.0, hsCrp); // abnormal, "High" label
    const scores = new Map([["hs_crp", score]]);

    const template =
      "Your hs-CRP is {{biomarker.hs_crp.value}} {{biomarker.hs_crp.unit}} " +
      "({{biomarker.hs_crp.label}}, severity: {{biomarker.hs_crp.severity}}).";

    const rendered = engine.personalizeMessage(template, mockContext, scores);

    expect(rendered).toContain("5 mg/L");
    expect(rendered).toContain("High");
    expect(rendered).toContain("abnormal");
    // No unreplaced tokens left
    expect(rendered).not.toMatch(/\{\{biomarker\./);
  });

  it("leaves other biomarker tokens for missing slugs to be cleaned up as '--'", () => {
    const score = scoreBiomarker(5.0, hsCrp);
    const scores = new Map([["hs_crp", score]]);
    const template =
      "CRP: {{biomarker.hs_crp.value}}, HOMA: {{biomarker.homa_ir.value}}";

    const rendered = engine.personalizeMessage(template, mockContext, scores);

    expect(rendered).toContain("CRP: 5");
    // homa_ir wasn't fetched — fallback token cleanup replaces with '--'
    expect(rendered).toContain("HOMA: --");
  });

  it("works when no biomarker map is provided", () => {
    // Existing non-biomarker templates must still work
    const rendered = engine.personalizeMessage("Hi {{name}}", mockContext);
    expect(rendered).toBe("Hi Test Patient");
  });
});
