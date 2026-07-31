// @vitest-environment jsdom
//
// Regression test for the July 28 Recent Meals failure mode: a parent food
// entry with no macros and no child items (the exact row shape produced by
// the onboarding first-meal fallback in Onboarding.tsx) must still render
// as a card in the Recent Meals list, showing '--' in place of a quality
// score rather than disappearing.
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { fallbackEntries } = vi.hoisted(() => {
  const now = new Date().toISOString();
  return {
    fallbackEntries: [
      // Shape the server produces for a fallback save: POST /api/food stamps
      // aiOutputJson with null score fields when no macros were submitted.
      {
        id: "fallback-null-score",
        userId: "user-1",
        parentMealId: null,
        inputType: "text",
        mealType: "Breakfast",
        rawText: "eggs and toast",
        timestamp: now,
        eatenAt: now,
        aiOutputJson: { qualityScore: null, scoreBreakdown: null },
        userCorrectionsJson: null,
        tags: null,
      },
      // Belt-and-braces variant: aiOutputJson entirely absent.
      {
        id: "fallback-no-aioutput",
        userId: "user-1",
        parentMealId: null,
        inputType: "text",
        mealType: "Lunch",
        rawText: "leftover chili",
        timestamp: now,
        eatenAt: now,
        aiOutputJson: null,
        userCorrectionsJson: null,
        tags: null,
      },
    ],
  };
});

vi.mock("@/lib/api", () => ({
  api: {
    getFoodEntries: vi.fn(async () => fallbackEntries),
    getMacroProgress: vi.fn(async () => null),
    getFavorites: vi.fn(async () => []),
    getFoodStreak: vi.fn(async () => null),
  },
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { id: "user-1", email: "test@example.com", aiConsentGiven: true },
    refreshUser: vi.fn(),
  }),
}));
vi.mock("@/hooks/use-ai-available", () => ({ useAiAvailable: () => true }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));
// Modals pull in heavy browser-only dependencies (camera/barcode); none are
// open in this test, so stub them out.
vi.mock("@/components/BarcodeScannerModal", () => ({ default: () => null }));
vi.mock("@/components/RecipeBuilderModal", () => ({ default: () => null }));
vi.mock("@/components/ManualMacroEntryModal", () => ({ default: () => null }));
vi.mock("@/components/FoodEditModal", () => ({ default: () => null }));

import FoodLog from "./FoodLog";

function renderFoodLog() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <FoodLog />
    </QueryClientProvider>
  );
}

describe("Recent Meals — macro-less parent entries (onboarding fallback shape)", () => {
  it("renders a card for a parent entry with null score fields and no child items", async () => {
    renderFoodLog();

    const card = await screen.findByTestId("card-food-fallback-null-score");
    expect(within(card).getByText("eggs and toast")).toBeTruthy();
    // No quality score → the score tile shows the '--' placeholder.
    expect(within(card).getByText("--")).toBeTruthy();
  });

  it("renders a card even when aiOutputJson is entirely absent", async () => {
    renderFoodLog();

    const card = await screen.findByTestId("card-food-fallback-no-aioutput");
    expect(within(card).getByText("leftover chili")).toBeTruthy();
    expect(within(card).getByText("--")).toBeTruthy();
  });

  it("does not show the empty state when only macro-less entries exist", async () => {
    renderFoodLog();

    await screen.findByTestId("card-food-fallback-null-score");
    expect(screen.queryByText(/No meals logged yet/i)).toBeNull();
  });
});
