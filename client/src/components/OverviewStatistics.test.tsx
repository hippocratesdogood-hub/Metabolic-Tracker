// @vitest-environment jsdom
//
// Regression test for the August 8 dress-rehearsal finding: metric entries
// written without normalizedValue (the row shape produced by the onboarding
// baseline step and MacroCalculatorStep) carry valueJson.value in the user's
// own units. Overview Statistics must display those raw values unconverted —
// previously it ran them through the kg/cm→display conversion, showing a
// 215 lb baseline as "474" and a 36 in waist as "14".
import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen, within } from "@testing-library/react";
import OverviewStatistics from "./OverviewStatistics";

const now = new Date().toISOString();
const earlier = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

const emptyMetrics = { weight: [], bp: [], glucose: [], ketones: [], waist: [] };

const unitLabels = { weight: "lbs", bp: "mmHg", glucose: "mg/dL", ketones: "mmol/L", waist: "in" };

function cardByLabel(label: string) {
  const el = screen.getByText(label).closest("[class*='p-4']");
  expect(el).not.toBeNull();
  return within(el as HTMLElement);
}

describe("OverviewStatistics unit fallback", () => {
  it("shows raw valueJson values unconverted when normalizedValue is null (onboarding baseline shape)", () => {
    render(
      <OverviewStatistics
        metrics={{
          ...emptyMetrics,
          weight: [{ normalizedValue: null, valueJson: { value: 215 }, timestamp: now, type: "WEIGHT" }],
          waist: [{ normalizedValue: null, valueJson: { value: 36 }, timestamp: now, type: "WAIST" }],
        }}
        unitLabels={unitLabels}
        unitsPref="US"
      />
    );
    expect(cardByLabel("Weight").getAllByText("215").length).toBeGreaterThan(0);
    expect(cardByLabel("Waist").getAllByText("36").length).toBeGreaterThan(0);
    // The old bug's outputs must not appear anywhere
    expect(screen.queryByText("474")).toBeNull();
    expect(screen.queryByText("14")).toBeNull();
  });

  it("still converts normalizedValue (kg/cm) to the user's display units", () => {
    render(
      <OverviewStatistics
        metrics={{
          ...emptyMetrics,
          weight: [{ normalizedValue: 97.52, valueJson: { value: 215, unit: "lbs" }, timestamp: now, type: "WEIGHT" }],
          waist: [{ normalizedValue: 91.44, valueJson: { value: 36, unit: "inches" }, timestamp: now, type: "WAIST" }],
        }}
        unitLabels={unitLabels}
        unitsPref="US"
      />
    );
    expect(cardByLabel("Weight").getAllByText("215").length).toBeGreaterThan(0);
    expect(cardByLabel("Waist").getAllByText("36").length).toBeGreaterThan(0);
  });

  it("aggregates mixed normalized and raw-only entries in the same units", () => {
    render(
      <OverviewStatistics
        metrics={{
          ...emptyMetrics,
          weight: [
            // newest first: a modal entry (normalized, 213 lbs) after the raw baseline (215 lbs)
            { normalizedValue: 96.62, valueJson: { value: 213, unit: "lbs" }, timestamp: now, type: "WEIGHT" },
            { normalizedValue: null, valueJson: { value: 215 }, timestamp: earlier, type: "WEIGHT" },
          ],
        }}
        unitLabels={unitLabels}
        unitsPref="US"
      />
    );
    const weight = cardByLabel("Weight");
    expect(weight.getByText("213")).toBeTruthy(); // latest
    expect(weight.getByText("214")).toBeTruthy(); // avg of 213 and 215
    expect(weight.getByText("213-215")).toBeTruthy(); // range
  });

  it("passes Metric-preference values through: raw kg/cm shown as entered, normalized identical", () => {
    render(
      <OverviewStatistics
        metrics={{
          ...emptyMetrics,
          weight: [{ normalizedValue: null, valueJson: { value: 96 }, timestamp: now, type: "WEIGHT" }],
          waist: [{ normalizedValue: 102, valueJson: { value: 102, unit: "cm" }, timestamp: now, type: "WAIST" }],
        }}
        unitLabels={{ ...unitLabels, weight: "kg", waist: "cm" }}
        unitsPref="Metric"
      />
    );
    expect(cardByLabel("Weight").getAllByText("96").length).toBeGreaterThan(0);
    expect(cardByLabel("Waist").getAllByText("102").length).toBeGreaterThan(0);
  });
});
