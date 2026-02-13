/**
 * Metabolic Age Calculator
 *
 * Uses a 6-marker scoring system (0-150 points) to determine metabolic age.
 * Formula: Metabolic Age = Calendar Age + (Total Score - 60) / 3
 *
 * Markers:
 * 1. Waist:Height Ratio
 * 2. Fasting Insulin
 * 3. TG:HDL Ratio
 * 4. Fasting Glucose
 * 5. Resting Heart Rate
 * 6. Systolic Blood Pressure
 */

import { z } from "zod";

// --- Types ---

export type InterpretationBand = "Advantage" | "Mild" | "Moderate" | "Advanced" | "Severe";

export interface MarkerScore {
  name: string;
  value: number;
  displayValue: string;
  points: number;
  maxPoints: number;
}

export interface CalculatorResult {
  metabolicAge: number;
  calendarAge: number;
  deltaAge: number;
  totalScore: number;
  interpretationBand: InterpretationBand;
  waistHeightRatio: number;
  tgHdlRatio: number;
  markerScores: MarkerScore[];
}

export interface InputWarning {
  field: string;
  message: string;
}

export interface CalculatorInput {
  calendarAgeYears: number;
  waistValue: number;
  waistUnit: "in" | "cm";
  heightValue: number;
  heightUnit: "in" | "cm";
  fastingInsulin: number;
  triglyceridesValue: number;
  triglyceridesUnit: "mg/dL" | "mmol/L";
  hdlValue: number;
  hdlUnit: "mg/dL" | "mmol/L";
  fastingGlucose: number;
  restingHeartRate: number;
  systolicBP: number;
}

// --- Form Schema ---

export const calculatorFormSchema = z.object({
  calendarAgeYears: z.coerce.number().min(1, "Age is required").max(120, "Please enter a valid age"),
  waistValue: z.coerce.number().positive("Waist measurement is required"),
  waistUnit: z.enum(["in", "cm"]),
  heightValue: z.coerce.number().positive("Height is required"),
  heightUnit: z.enum(["in", "cm"]),
  fastingInsulin: z.coerce.number().positive("Fasting insulin is required"),
  triglyceridesValue: z.coerce.number().positive("Triglycerides is required"),
  triglyceridesUnit: z.enum(["mg/dL", "mmol/L"]),
  hdlValue: z.coerce.number().positive("HDL is required"),
  hdlUnit: z.enum(["mg/dL", "mmol/L"]),
  fastingGlucose: z.coerce.number().positive("Fasting glucose is required"),
  restingHeartRate: z.coerce.number().positive("Resting heart rate is required"),
  systolicBP: z.coerce.number().positive("Systolic blood pressure is required"),
});

export type FormValues = z.infer<typeof calculatorFormSchema>;

// --- Unit Conversions ---

export function convertWaistToInches(value: number, unit: "in" | "cm"): number {
  return unit === "cm" ? value / 2.54 : value;
}

export function convertHeightToInches(value: number, unit: "in" | "cm"): number {
  return unit === "cm" ? value / 2.54 : value;
}

export function convertTriglycerdiesToMgDl(value: number, unit: "mg/dL" | "mmol/L"): number {
  return unit === "mmol/L" ? value * 88.57 : value;
}

export function convertHdlToMgDl(value: number, unit: "mg/dL" | "mmol/L"): number {
  return unit === "mmol/L" ? value * 38.67 : value;
}

// --- Scoring Functions ---

export function scoreWHR(whr: number): number {
  if (whr <= 0.47) return 0;
  if (whr <= 0.50) return 5;
  if (whr <= 0.54) return 10;
  if (whr <= 0.58) return 15;
  return 25;
}

export function scoreInsulin(x: number): number {
  if (x <= 5) return 0;
  if (x <= 8) return 5;
  if (x <= 12) return 10;
  if (x <= 17) return 15;
  return 25;
}

export function scoreTgHdl(r: number): number {
  if (r < 1) return 0;
  if (r < 2) return 5;
  if (r < 3) return 10;
  if (r < 4) return 15;
  return 25;
}

export function scoreGlucose(g: number): number {
  if (g <= 85) return 0;
  if (g <= 92) return 5;
  if (g <= 99) return 10;
  if (g <= 108) return 15;
  return 25;
}

export function scoreRHR(hr: number): number {
  if (hr <= 58) return 0;
  if (hr <= 65) return 5;
  if (hr <= 72) return 10;
  if (hr <= 80) return 15;
  return 25;
}

export function scoreSBP(s: number): number {
  if (s < 118) return 0;
  if (s <= 124) return 5;
  if (s <= 132) return 10;
  if (s <= 140) return 15;
  return 25;
}

// --- Interpretation ---

export function getInterpretationBand(score: number): InterpretationBand {
  if (score <= 35) return "Advantage";
  if (score <= 65) return "Mild";
  if (score <= 95) return "Moderate";
  if (score <= 120) return "Advanced";
  return "Severe";
}

// --- Main Calculation ---

export function calculateMetabolicAge(input: CalculatorInput): CalculatorResult {
  const waistIn = convertWaistToInches(input.waistValue, input.waistUnit);
  const heightIn = convertHeightToInches(input.heightValue, input.heightUnit);
  const trigMg = convertTriglycerdiesToMgDl(input.triglyceridesValue, input.triglyceridesUnit);
  const hdlMg = convertHdlToMgDl(input.hdlValue, input.hdlUnit);

  const whr = waistIn / heightIn;
  const tgHdl = trigMg / hdlMg;

  const whrPoints = scoreWHR(whr);
  const insulinPoints = scoreInsulin(input.fastingInsulin);
  const tgHdlPoints = scoreTgHdl(tgHdl);
  const glucosePoints = scoreGlucose(input.fastingGlucose);
  const rhrPoints = scoreRHR(input.restingHeartRate);
  const sbpPoints = scoreSBP(input.systolicBP);

  const totalScore = whrPoints + insulinPoints + tgHdlPoints + glucosePoints + rhrPoints + sbpPoints;
  const metabolicAge = input.calendarAgeYears + (totalScore - 60) / 3;
  const deltaAge = metabolicAge - input.calendarAgeYears;
  const interpretationBand = getInterpretationBand(totalScore);

  const markerScores: MarkerScore[] = [
    { name: "Waist:Height Ratio", value: whr, displayValue: whr.toFixed(2), points: whrPoints, maxPoints: 25 },
    { name: "Fasting Insulin", value: input.fastingInsulin, displayValue: `${input.fastingInsulin.toFixed(1)} µIU/mL`, points: insulinPoints, maxPoints: 25 },
    { name: "TG:HDL Ratio", value: tgHdl, displayValue: tgHdl.toFixed(2), points: tgHdlPoints, maxPoints: 25 },
    { name: "Fasting Glucose", value: input.fastingGlucose, displayValue: `${input.fastingGlucose.toFixed(0)} mg/dL`, points: glucosePoints, maxPoints: 25 },
    { name: "Resting Heart Rate", value: input.restingHeartRate, displayValue: `${input.restingHeartRate.toFixed(0)} bpm`, points: rhrPoints, maxPoints: 25 },
    { name: "Systolic BP", value: input.systolicBP, displayValue: `${input.systolicBP.toFixed(0)} mmHg`, points: sbpPoints, maxPoints: 25 },
  ];

  return {
    metabolicAge: Math.round(metabolicAge * 10) / 10,
    calendarAge: input.calendarAgeYears,
    deltaAge: Math.round(deltaAge * 10) / 10,
    totalScore: Math.round(totalScore),
    interpretationBand,
    waistHeightRatio: Math.round(whr * 100) / 100,
    tgHdlRatio: Math.round(tgHdl * 100) / 100,
    markerScores,
  };
}

// --- Input Warnings ---

export function getInputWarnings(input: Partial<CalculatorInput>): InputWarning[] {
  const warnings: InputWarning[] = [];

  if (input.waistValue && input.waistUnit && input.heightValue && input.heightUnit) {
    const waistIn = convertWaistToInches(input.waistValue, input.waistUnit);
    const heightIn = convertHeightToInches(input.heightValue, input.heightUnit);
    const whr = waistIn / heightIn;
    if (whr < 0.30 || whr > 0.90) {
      warnings.push({ field: "waist", message: "Waist:Height ratio appears unusual (outside 0.30-0.90)" });
    }
  }

  if (input.triglyceridesValue && input.triglyceridesUnit && input.hdlValue && input.hdlUnit) {
    const trigMg = convertTriglycerdiesToMgDl(input.triglyceridesValue, input.triglyceridesUnit);
    const hdlMg = convertHdlToMgDl(input.hdlValue, input.hdlUnit);
    const tgHdl = trigMg / hdlMg;
    if (tgHdl < 0.2 || tgHdl > 15) {
      warnings.push({ field: "triglycerides", message: "TG:HDL ratio appears unusual (outside 0.2-15)" });
    }
  }

  if (input.fastingInsulin !== undefined && (input.fastingInsulin < 1 || input.fastingInsulin > 40)) {
    warnings.push({ field: "fastingInsulin", message: "Insulin value appears unusual (outside 1-40 µIU/mL)" });
  }

  if (input.fastingGlucose !== undefined && (input.fastingGlucose < 70 || input.fastingGlucose > 140)) {
    warnings.push({ field: "fastingGlucose", message: "Glucose value appears unusual (outside 70-140 mg/dL)" });
  }

  if (input.restingHeartRate !== undefined && (input.restingHeartRate < 35 || input.restingHeartRate > 180)) {
    warnings.push({ field: "restingHeartRate", message: "Heart rate appears unusual (outside 35-180 bpm)" });
  }

  if (input.systolicBP !== undefined && (input.systolicBP < 90 || input.systolicBP > 220)) {
    warnings.push({ field: "systolicBP", message: "Blood pressure appears unusual (outside 90-220 mmHg)" });
  }

  return warnings;
}

// --- Educational Content ---

export const markerEducation: Record<string, { description: string; improvement: string }> = {
  "Waist:Height Ratio": {
    description: "Measures body fat distribution. A ratio under 0.50 indicates healthy central adiposity.",
    improvement: "Reduce visceral fat through regular exercise, especially HIIT, and a diet low in processed foods and added sugars.",
  },
  "Fasting Insulin": {
    description: "Indicates how efficiently your body uses insulin. Lower levels suggest better insulin sensitivity.",
    improvement: "Reduce refined carbs and sugars, increase fiber, exercise regularly, and consider intermittent fasting.",
  },
  "TG:HDL Ratio": {
    description: "A powerful predictor of cardiovascular risk and insulin resistance. Lower ratios indicate better metabolic health.",
    improvement: "Reduce sugar and refined carbs, increase omega-3s (fish oil, walnuts), exercise, and limit alcohol.",
  },
  "Fasting Glucose": {
    description: "Blood sugar level after fasting. Elevated levels may indicate pre-diabetes or metabolic dysfunction.",
    improvement: "Limit sugary foods, eat more fiber and protein, walk after meals, manage stress, and get 7-9 hours of sleep.",
  },
  "Resting Heart Rate": {
    description: "Reflects cardiovascular fitness. Athletes often have rates below 50 bpm, while higher rates suggest room for improvement.",
    improvement: "Regular aerobic exercise, stress reduction techniques, adequate hydration, and avoiding stimulants.",
  },
  "Systolic BP": {
    description: "The pressure when your heart beats. Elevated levels increase risk of heart disease and stroke.",
    improvement: "Reduce sodium, exercise 150+ min/week, maintain healthy weight, limit alcohol, and practice stress management.",
  },
};
