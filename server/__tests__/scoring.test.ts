/**
 * Scoring engine tests
 *
 * Each block exercises a realistic biomarker fixture against scoreBiomarker()
 * plus the panel summary + derived-value helpers.
 */

import { describe, it, expect } from "vitest";
import {
  scoreBiomarker,
  calculateDerivedValues,
  summarizePanelForPrompt,
  type BiomarkerScore,
} from "../services/scoring";
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

const fastingInsulin: Biomarker = {
  ...baseBiomarkerFields,
  id: "bio-insulin",
  slug: "fasting_insulin",
  name: "Fasting Insulin",
  unit: "μIU/mL",
  category: "metabolic",
  flagDirection: "high_bad",
  standardLow: 2,
  standardHigh: 25,
  optimalLow: 2,
  optimalHigh: 7,
  criticalLow: null,
  criticalHigh: 30,
  clinicalNote: "Optimal ceiling is <7 μIU/mL.",
};

const tgHdlRatio: Biomarker = {
  ...baseBiomarkerFields,
  id: "bio-tg-hdl",
  slug: "tg_hdl_ratio",
  name: "TG/HDL Ratio",
  abbreviation: "TG/HDL",
  unit: "ratio",
  category: "derived",
  flagDirection: "high_bad",
  standardLow: null,
  standardHigh: 3.5,
  optimalLow: null,
  optimalHigh: 1.5,
  criticalLow: null,
  criticalHigh: 5.0,
  isDerived: true,
  derivationFormula: "triglycerides / hdl_cholesterol",
  clinicalNote: "Primary clinical decision marker.",
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

const vitaminD: Biomarker = {
  ...baseBiomarkerFields,
  id: "bio-vitd",
  slug: "vitamin_d",
  name: "Vitamin D (25-OH)",
  abbreviation: "25(OH)D",
  unit: "ng/mL",
  category: "nutrients",
  flagDirection: "both_bad",
  standardLow: 30,
  standardHigh: 100,
  optimalLow: 50,
  optimalHigh: 80,
  criticalLow: 20,
  criticalHigh: 150,
  clinicalNote: null,
};

// ----- tests ---------------------------------------------------------

describe("scoreBiomarker — high_bad direction (Fasting Insulin)", () => {
  it("value inside optimal is flagged optimal, not high", () => {
    const s = scoreBiomarker(5, fastingInsulin);
    expect(s.severity).toBe("optimal");
    expect(s.flag).toBe("none");
    expect(s.isWithinOptimal).toBe(true);
    expect(s.isWithinStandard).toBe(true);
    expect(s.deltaFromOptimal).toBeLessThan(0);
  });

  it("value above optimal but below standard is borderline", () => {
    const s = scoreBiomarker(12, fastingInsulin);
    expect(s.severity).toBe("borderline");
    expect(s.flag).toBe("high");
    expect(s.deltaFromOptimal).toBe(5); // 12 - 7
    expect(s.label).toBe("Borderline High");
  });

  it("value near standard ceiling is still borderline until standard is crossed", () => {
    const stillBorderline = scoreBiomarker(20, fastingInsulin);
    expect(stillBorderline.severity).toBe("borderline");
    const abnormal = scoreBiomarker(28, fastingInsulin);
    expect(abnormal.severity).toBe("abnormal");
    expect(abnormal.deltaFromStandard).toBe(3); // 28 - 25
  });

  it("value above critical threshold becomes critical", () => {
    const s = scoreBiomarker(35, fastingInsulin);
    expect(s.severity).toBe("critical");
    expect(s.label).toBe("Critical High");
  });
});

describe("scoreBiomarker — high_bad with no lower bound (TG/HDL)", () => {
  it("scores below optimal ceiling as optimal", () => {
    const s = scoreBiomarker(1.2, tgHdlRatio);
    expect(s.severity).toBe("optimal");
    expect(s.flag).toBe("none");
  });

  it("scores in borderline range", () => {
    const s = scoreBiomarker(2.8, tgHdlRatio);
    expect(s.severity).toBe("borderline");
    expect(s.deltaFromOptimal).toBeCloseTo(1.3, 2);
  });

  it("scores above standard as abnormal", () => {
    const s = scoreBiomarker(4.2, tgHdlRatio);
    expect(s.severity).toBe("abnormal");
  });

  it("scores above critical as critical", () => {
    const s = scoreBiomarker(5.5, tgHdlRatio);
    expect(s.severity).toBe("critical");
  });
});

describe("scoreBiomarker — high_bad with no lower bound (hs-CRP)", () => {
  it("0.6 mg/L is optimal", () => {
    expect(scoreBiomarker(0.6, hsCrp).severity).toBe("optimal");
  });

  it("1.8 mg/L is borderline with delta to optimal ceiling", () => {
    const s = scoreBiomarker(1.8, hsCrp);
    expect(s.severity).toBe("borderline");
    expect(s.deltaFromOptimal).toBeCloseTo(0.8, 2);
  });

  it("5.0 mg/L is abnormal", () => {
    expect(scoreBiomarker(5.0, hsCrp).severity).toBe("abnormal");
  });
});

describe("scoreBiomarker — both_bad direction (Vitamin D)", () => {
  it("mid-optimal is flagged optimal with no direction", () => {
    const s = scoreBiomarker(65, vitaminD);
    expect(s.severity).toBe("optimal");
    expect(s.flag).toBe("none");
  });

  it("below optimal but above standard is borderline low", () => {
    const s = scoreBiomarker(38, vitaminD);
    expect(s.severity).toBe("borderline");
    expect(s.flag).toBe("low");
  });

  it("below standard is abnormal low", () => {
    expect(scoreBiomarker(25, vitaminD).severity).toBe("abnormal");
  });

  it("below critical is critical low", () => {
    const s = scoreBiomarker(18, vitaminD);
    expect(s.severity).toBe("critical");
    expect(s.label).toBe("Critical Low");
  });
});

describe("calculateDerivedValues", () => {
  it("computes HOMA-IR from insulin × glucose / 405", () => {
    const { homaIr } = calculateDerivedValues({ fastingInsulin: 8, fastingGlucose: 92 });
    // 8 * 92 / 405 = 1.817...
    expect(homaIr).toBeCloseTo(1.82, 2);
  });

  it("computes TG/HDL ratio", () => {
    const { tgHdlRatio: ratio } = calculateDerivedValues({ triglycerides: 120, hdl: 55 });
    expect(ratio).toBeCloseTo(2.18, 2);
  });

  it("returns undefined fields when inputs are missing", () => {
    const partial = calculateDerivedValues({ fastingGlucose: 85 });
    expect(partial.homaIr).toBeUndefined();
    expect(partial.tgHdlRatio).toBeUndefined();
  });

  it("avoids divide-by-zero on HDL", () => {
    const { tgHdlRatio: ratio } = calculateDerivedValues({ triglycerides: 100, hdl: 0 });
    expect(ratio).toBeUndefined();
  });
});

describe("summarizePanelForPrompt", () => {
  it("groups scores by severity and produces a readable text block", () => {
    const scores: BiomarkerScore[] = [
      scoreBiomarker(5, fastingInsulin),   // optimal
      scoreBiomarker(2.8, tgHdlRatio),     // borderline
      scoreBiomarker(5.0, hsCrp),          // abnormal
      scoreBiomarker(18, vitaminD),         // critical
    ];

    const summary = summarizePanelForPrompt(scores);

    expect(summary.criticalFindings).toHaveLength(1);
    expect(summary.abnormalFindings).toHaveLength(1);
    expect(summary.borderlineFindings).toHaveLength(1);
    expect(summary.optimalFindings).toHaveLength(1);
    expect(summary.promptText).toContain("CRITICAL");
    expect(summary.promptText).toContain("OPTIMAL");
    expect(summary.promptText).toContain("Vitamin D");
  });
});
