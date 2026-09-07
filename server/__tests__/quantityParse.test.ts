/**
 * Leading-quantity parsing for the branded / spell-corrected lookup paths
 * (Sept 2026). Production find: "two Quest bars" logged as 1 bar because the
 * count strip was numerals-only, and the default of 1 carried no signal.
 */
import { describe, it, expect } from "vitest";
import { parseLeadingQuantity } from "../services/quantityParse";
import { contentTokens, containerImplausible, mentionsContainer, CONTAINER_PLAUSIBILITY_MIN_KCAL } from "../services/matchCoverage";

describe("parseLeadingQuantity", () => {
  it("REGRESSION: number words one through twelve parse like numerals", () => {
    expect(parseLeadingQuantity("two Quest bars")).toEqual({ quantity: 2, rest: "Quest bars" });
    expect(parseLeadingQuantity("2 Quest bars")).toEqual({ quantity: 2, rest: "Quest bars" });
    expect(parseLeadingQuantity("one RxBar")).toEqual({ quantity: 1, rest: "RxBar" });
    expect(parseLeadingQuantity("Twelve wings")).toEqual({ quantity: 12, rest: "wings" });
    expect(parseLeadingQuantity("seven almonds").quantity).toBe(7);
  });

  it("articles are an explicit single", () => {
    expect(parseLeadingQuantity("a Quest bar")).toEqual({ quantity: 1, rest: "Quest bar" });
    expect(parseLeadingQuantity("an RxBar")).toEqual({ quantity: 1, rest: "RxBar" });
  });

  it("a couple, half, and dozen", () => {
    expect(parseLeadingQuantity("a couple of RxBars")).toEqual({ quantity: 2, rest: "RxBars" });
    expect(parseLeadingQuantity("couple Quest bars")).toEqual({ quantity: 2, rest: "Quest bars" });
    expect(parseLeadingQuantity("half a Quest bar")).toEqual({ quantity: 0.5, rest: "Quest bar" });
    expect(parseLeadingQuantity("half an avocado")).toEqual({ quantity: 0.5, rest: "avocado" });
    expect(parseLeadingQuantity("a half Quest bar")).toEqual({ quantity: 0.5, rest: "Quest bar" });
    expect(parseLeadingQuantity("a dozen eggs")).toEqual({ quantity: 12, rest: "eggs" });
  });

  it("decimals and fractions", () => {
    expect(parseLeadingQuantity("1.5 Quest bars")).toEqual({ quantity: 1.5, rest: "Quest bars" });
    expect(parseLeadingQuantity("1/2 protein bar")).toEqual({ quantity: 0.5, rest: "protein bar" });
  });

  it("no stated quantity → null, so the caller can flag the assumption", () => {
    expect(parseLeadingQuantity("Quest bars")).toEqual({ quantity: null, rest: "Quest bars" });
    expect(parseLeadingQuantity("Chobani plain greek yogurt").quantity).toBeNull();
    expect(parseLeadingQuantity("")).toEqual({ quantity: null, rest: "" });
  });

  it("measured amounts are not counts", () => {
    // "40 g protein bar" must search verbatim, not scale a bar ×40
    expect(parseLeadingQuantity("40 g protein bar").quantity).toBeNull();
    expect(parseLeadingQuantity("6 oz chicken").quantity).toBeNull();
  });

  it("a quantity word alone is not a food", () => {
    expect(parseLeadingQuantity("two").quantity).toBeNull();
    expect(parseLeadingQuantity("half").quantity).toBeNull();
  });
});

describe("coverage ignores quantity words", () => {
  it("'five Quest bars' has one content token, not two", () => {
    expect(contentTokens("five Quest bars")).toEqual(["quest"]);
    expect(contentTokens("a couple of RxBars")).toEqual(["rxbars"]);
  });
});

describe("container plausibility heuristic", () => {
  it("names the constant so it can be tuned", () => {
    expect(CONTAINER_PLAUSIBILITY_MIN_KCAL).toBe(300);
  });

  it("flags a container line that resolved implausibly low", () => {
    expect(mentionsContainer("a chipotle chicken bowl")).toBe(true);
    expect(containerImplausible("a chipotle chicken bowl", 201)).toBe(true);
  });

  it("does not flag a container line with a plausible total, or a non-container line", () => {
    expect(containerImplausible("a chipotle chicken bowl", 880)).toBe(false);
    expect(containerImplausible("3 oz chicken", 187)).toBe(false);
    expect(mentionsContainer("two eggs and toast")).toBe(false);
  });

  it("DOCUMENTED FALSE POSITIVE: a genuinely light bowl is flagged too — the label is a nudge, not a block", () => {
    expect(containerImplausible("a bowl of berries", 85)).toBe(true);
  });
});
