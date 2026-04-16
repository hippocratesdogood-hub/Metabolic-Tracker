/**
 * Biomarker scoring engine.
 *
 * Translates a raw lab value + biomarker reference row into a structured
 * score covering flag direction, severity, distance from optimal, and a
 * plain-English clinical summary suitable for injection into an AI
 * interpretation prompt.
 *
 * Pure functions — no DB, no side effects. Input is a number + a Biomarker
 * row; output is a BiomarkerScore.
 */

import type { Biomarker } from "@shared/schema";

export type FlagType = "none" | "high" | "low";

// Severity mirrors clinical urgency:
//   optimal    — within Dr. Larson's tighter range (the goal state)
//   borderline — within standard range but outside optimal (room to improve)
//   abnormal   — outside standard range (action needed)
//   critical   — beyond critical thresholds (urgent)
export type FlagSeverity = "optimal" | "borderline" | "abnormal" | "critical";

export interface BiomarkerScore {
  biomarkerId: string;
  slug: string;
  name: string;
  value: number;
  unit: string;
  flag: FlagType;
  severity: FlagSeverity;
  isWithinOptimal: boolean;
  isWithinStandard: boolean;
  // Distance to the nearest optimal boundary in the relevant direction.
  // Negative = safely inside optimal. Positive = outside (distance out).
  // null = no relevant boundary exists for this direction.
  deltaFromOptimal: number | null;
  deltaFromStandard: number | null;
  label: string;      // e.g. "Optimal", "Borderline High", "Critical Low"
  labelShort: string; // e.g. "Optimal", "High", "Critical"
  // For UI gauge display: value as % of optimal midpoint. 100 = midpoint.
  percentOfOptimalMidpoint: number | null;
  // Plain-English framing for AI prompt injection.
  clinicalSummary: string;
}

export function scoreBiomarker(value: number, biomarker: Biomarker): BiomarkerScore {
  const {
    id, slug, name, unit, flagDirection,
    standardLow, standardHigh, optimalLow, optimalHigh,
    criticalLow, criticalHigh, clinicalNote,
  } = biomarker;

  const isCriticalHigh = criticalHigh != null && value > criticalHigh;
  const isCriticalLow = criticalLow != null && value < criticalLow;

  const aboveStandard = standardHigh != null && value > standardHigh;
  const belowStandard = standardLow != null && value < standardLow;
  const isWithinStandard = !aboveStandard && !belowStandard;

  const aboveOptimal = optimalHigh != null && value > optimalHigh;
  const belowOptimal = optimalLow != null && value < optimalLow;
  const isWithinOptimal = !aboveOptimal && !belowOptimal;

  let flag: FlagType = "none";
  switch (flagDirection) {
    case "high_bad":
      if (aboveOptimal || aboveStandard) flag = "high";
      break;
    case "low_bad":
    case "high_good":
      // both treat "low" as the concerning direction
      if (belowOptimal || belowStandard) flag = "low";
      break;
    case "both_bad":
    default:
      if (aboveOptimal || aboveStandard) flag = "high";
      else if (belowOptimal || belowStandard) flag = "low";
      break;
  }

  let severity: FlagSeverity;
  if (isCriticalHigh || isCriticalLow) severity = "critical";
  else if (!isWithinStandard) severity = "abnormal";
  else if (!isWithinOptimal) severity = "borderline";
  else severity = "optimal";

  let deltaFromOptimal: number | null = null;
  let deltaFromStandard: number | null = null;
  if (flag === "high") {
    if (optimalHigh != null) deltaFromOptimal = value - optimalHigh;
    if (standardHigh != null) deltaFromStandard = value - standardHigh;
  } else if (flag === "low") {
    if (optimalLow != null) deltaFromOptimal = optimalLow - value;
    if (standardLow != null) deltaFromStandard = standardLow - value;
  } else if (optimalHigh != null && optimalLow != null) {
    // Inside optimal — negative delta = buffer distance to nearest boundary
    deltaFromOptimal = -Math.min(optimalHigh - value, value - optimalLow);
  }

  let percentOfOptimalMidpoint: number | null = null;
  if (optimalLow != null && optimalHigh != null) {
    const midpoint = (optimalLow + optimalHigh) / 2;
    percentOfOptimalMidpoint = midpoint !== 0 ? Math.round((value / midpoint) * 100) : null;
  } else if (optimalHigh != null && flagDirection === "high_bad") {
    // No lower bound — use half of optimalHigh as midpoint reference
    percentOfOptimalMidpoint = Math.round((value / (optimalHigh / 2)) * 100);
  }

  const label = buildLabel(flag, severity);
  const labelShort = buildLabelShort(flag, severity);
  const clinicalSummary = buildClinicalSummary({
    name, value, unit, flag, severity, label, deltaFromOptimal,
    optimalHigh, optimalLow, clinicalNote,
  });

  return {
    biomarkerId: id, slug, name, value, unit,
    flag, severity,
    isWithinOptimal, isWithinStandard,
    deltaFromOptimal, deltaFromStandard,
    label, labelShort,
    percentOfOptimalMidpoint,
    clinicalSummary,
  };
}

export function scorePanelResults(
  results: Array<{ value: number; biomarker: Biomarker }>
): BiomarkerScore[] {
  return results.map(({ value, biomarker }) => scoreBiomarker(value, biomarker));
}

export interface PanelSummary {
  criticalFindings: BiomarkerScore[];
  abnormalFindings: BiomarkerScore[];
  borderlineFindings: BiomarkerScore[];
  optimalFindings: BiomarkerScore[];
  promptText: string;
}

/**
 * Group a set of scored results by severity and produce a text block
 * suitable for dropping into an LLM interpretation system prompt.
 */
export function summarizePanelForPrompt(scores: BiomarkerScore[]): PanelSummary {
  const criticalFindings = scores.filter((s) => s.severity === "critical");
  const abnormalFindings = scores.filter((s) => s.severity === "abnormal");
  const borderlineFindings = scores.filter((s) => s.severity === "borderline");
  const optimalFindings = scores.filter((s) => s.severity === "optimal");

  const lines: string[] = ["=== LAB RESULTS WITH CLINICAL SCORING ===", ""];

  if (criticalFindings.length > 0) {
    lines.push("CRITICAL (immediate attention):");
    criticalFindings.forEach((s) => lines.push(`  - ${s.clinicalSummary}`));
    lines.push("");
  }
  if (abnormalFindings.length > 0) {
    lines.push("ABNORMAL (outside standard range):");
    abnormalFindings.forEach((s) => lines.push(`  - ${s.clinicalSummary}`));
    lines.push("");
  }
  if (borderlineFindings.length > 0) {
    lines.push("BORDERLINE (within standard, outside optimal):");
    borderlineFindings.forEach((s) => lines.push(`  - ${s.clinicalSummary}`));
    lines.push("");
  }
  if (optimalFindings.length > 0) {
    lines.push("OPTIMAL (within Dr. Larson's target range):");
    optimalFindings.forEach((s) => lines.push(`  - ${s.name}: ${s.value} ${s.unit}`));
    lines.push("");
  }

  lines.push("=== END LAB RESULTS ===");

  return {
    criticalFindings,
    abnormalFindings,
    borderlineFindings,
    optimalFindings,
    promptText: lines.join("\n"),
  };
}

export interface DerivedInputs {
  fastingInsulin?: number; // μIU/mL
  fastingGlucose?: number; // mg/dL
  triglycerides?: number;  // mg/dL
  hdl?: number;            // mg/dL
}

export interface DerivedValues {
  homaIr?: number;     // (insulin × glucose) / 405
  tgHdlRatio?: number; // triglycerides / HDL
}

export function calculateDerivedValues(inputs: DerivedInputs): DerivedValues {
  const derived: DerivedValues = {};
  if (inputs.fastingInsulin != null && inputs.fastingGlucose != null) {
    derived.homaIr = parseFloat(
      ((inputs.fastingInsulin * inputs.fastingGlucose) / 405).toFixed(2)
    );
  }
  if (inputs.triglycerides != null && inputs.hdl != null && inputs.hdl > 0) {
    derived.tgHdlRatio = parseFloat((inputs.triglycerides / inputs.hdl).toFixed(2));
  }
  return derived;
}

// ----- helpers ------------------------------------------------------

function buildLabel(flag: FlagType, severity: FlagSeverity): string {
  if (severity === "optimal") return "Optimal";
  const direction = flag === "high" ? "High" : flag === "low" ? "Low" : "";
  switch (severity) {
    case "borderline": return direction ? `Borderline ${direction}` : "Borderline";
    case "abnormal":   return direction || "Abnormal";
    case "critical":   return direction ? `Critical ${direction}` : "Critical";
  }
}

function buildLabelShort(flag: FlagType, severity: FlagSeverity): string {
  if (severity === "optimal") return "Optimal";
  if (severity === "critical") return "Critical";
  return flag === "high" ? "High" : flag === "low" ? "Low" : "Abnormal";
}

interface ClinicalSummaryArgs {
  name: string;
  value: number;
  unit: string;
  flag: FlagType;
  severity: FlagSeverity;
  label: string;
  deltaFromOptimal: number | null;
  optimalHigh: number | null;
  optimalLow: number | null;
  clinicalNote: string | null;
}

function buildClinicalSummary(args: ClinicalSummaryArgs): string {
  const { name, value, unit, flag, severity, label, deltaFromOptimal, optimalHigh, optimalLow, clinicalNote } = args;
  let summary = `${name}: ${value} ${unit} [${label}]`;
  if (severity !== "optimal" && deltaFromOptimal != null && deltaFromOptimal > 0) {
    const boundary = flag === "high" ? optimalHigh : optimalLow;
    if (boundary != null) {
      summary += ` — ${deltaFromOptimal.toFixed(1)} ${unit} ${flag === "high" ? "above" : "below"} optimal ceiling of ${boundary} ${unit}`;
    }
  }
  if (clinicalNote) {
    summary += ` | Note: ${clinicalNote}`;
  }
  return summary;
}
