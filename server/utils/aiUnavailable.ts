// Structured 503 contract returned by the AI meal-analysis endpoints
// (`/api/food/analyze`, `/api/food/analyze-image`) when the Anthropic
// client is not configured (no signed BAA → ANTHROPIC_API_KEY unset in
// prod) or otherwise unavailable.
//
// The client branches on `code` to render patient-appropriate copy and
// surface the non-AI logging paths (favorites, barcode, manual entry).
// Intentionally free of vendor names, env var names, and `.env`
// references — this body is patient-facing once it reaches the client.
//
// Pure and dependency-free so it can be unit-tested without importing
// routes.ts (which pulls in the DB / Anthropic SDK as a side effect).

export const AI_UNAVAILABLE_CODE = "AI_UNAVAILABLE" as const;

export type AiUnavailableFallback = "favorite" | "barcode" | "manual";

export interface AiUnavailableBody {
  code: typeof AI_UNAVAILABLE_CODE;
  message: string;
  fallbacks: AiUnavailableFallback[];
}

/**
 * The structured body for a 503 when AI meal analysis is unavailable.
 * Returns a fresh object each call so a handler can never mutate shared
 * state. `fallbacks` lists the non-AI paths the client can offer.
 */
export function aiUnavailableBody(): AiUnavailableBody {
  return {
    code: AI_UNAVAILABLE_CODE,
    message: "Automatic meal analysis is temporarily unavailable.",
    fallbacks: ["favorite", "barcode", "manual"],
  };
}
