/**
 * Nutritionix de-identification guardrail (food-analysis v1.2, §8.1)
 *
 * The Nutritionix-primary analysis path is BAA-independent ONLY because the
 * request is de-identified — just the food string, no patient identifiers.
 * These tests lock that posture so a future change can't silently start
 * leaking a user id (e.g. an x-remote-user-id header) to a vendor without a BAA.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { nutritionLookup } from "../services/nutritionLookup";

const NIX_URL = "https://trackapi.nutritionix.com/v2/natural/nutrients";

describe("Nutritionix de-identification guardrail", () => {
  const realFetch = global.fetch;
  let lastCall: { url: string; init: any } | null = null;

  beforeEach(() => {
    process.env.NUTRITIONIX_APP_ID = "test-app-id";
    process.env.NUTRITIONIX_APP_KEY = "test-app-key";
    lastCall = null;
    global.fetch = vi.fn(async (url: any, init: any) => {
      lastCall = { url: String(url), init };
      return new Response(
        JSON.stringify({
          foods: [
            {
              food_name: "egg",
              serving_qty: 2,
              serving_unit: "large",
              nf_calories: 140,
              nf_protein: 12,
              nf_total_fat: 10,
              nf_total_carbohydrate: 1,
              nf_dietary_fiber: 0,
              brand_name: null,
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as any;
  });

  afterEach(() => {
    global.fetch = realFetch;
  });

  it("sends only the food string + API credentials (no user-identifying header)", async () => {
    const query = "guardrail-eggs-and-toast";
    const items = await nutritionLookup.analyzeNaturalText(query);

    expect(items).not.toBeNull();
    expect(lastCall).not.toBeNull();
    expect(lastCall!.url).toBe(NIX_URL);

    const headerKeys = Object.keys(lastCall!.init.headers).map((k) => k.toLowerCase()).sort();
    expect(headerKeys).toEqual(["content-type", "x-app-id", "x-app-key"]);
    expect(headerKeys).not.toContain("x-remote-user-id");

    const body = JSON.parse(lastCall!.init.body);
    expect(Object.keys(body)).toEqual(["query"]);
    expect(body.query).toBe(query);
  });

  it("serialized request carries no common patient-identifier keys", async () => {
    await nutritionLookup.analyzeNaturalText("guardrail-grilled-chicken");

    const serialized = JSON.stringify(lastCall!.init).toLowerCase();
    for (const forbidden of [
      "userid",
      "user_id",
      "x-remote-user-id",
      "patientid",
      "mrn",
      "email",
      "dateofbirth",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("returns null without calling the network when keys are unset", async () => {
    delete process.env.NUTRITIONIX_APP_ID;
    delete process.env.NUTRITIONIX_APP_KEY;

    const result = await nutritionLookup.analyzeNaturalText("guardrail-no-keys");
    expect(result).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
