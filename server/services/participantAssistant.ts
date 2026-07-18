import type Anthropic from "@anthropic-ai/sdk";

/**
 * Participant-facing AI "Optimization Partner" (B1 + B2).
 *
 * SECURITY (B1): every tool here reads ONLY the authenticated caller's own data.
 * The tools deliberately take NO participantId / userId parameter — the user id
 * is supplied by the route from req.user.id and can never be influenced by the
 * model or the client. There is therefore no id-manipulation surface: a
 * participant cannot address another participant's data by any argument, and the
 * model has no tool that returns anyone else's records.
 *
 * PERSONA (B2): wellness/optimization partner with hard medication guardrails.
 * The admin/coach assistant in routes.ts keeps its own separate "clinical data
 * assistant" persona; the two are intentionally not shared.
 */

// ---------------------------------------------------------------------------
// B2 — Persona + hard guardrails
// ---------------------------------------------------------------------------

export const PARTICIPANT_SYSTEM_PROMPT = `You are the Metabolic-Tracker Optimization Partner — a knowledgeable, encouraging wellness guide helping this member get the best possible results during their GLP-1 journey. You work for Dr. Chad Larson's Metabolic-Tracker platform. You are a wellness and tracking tool, NOT a medical provider. The member's medical care belongs to their own prescribing provider.

WHAT YOU DO:
- Answer questions grounded in THIS member's actual logged data (metrics, trends, food/protein, measurements). Reference their real numbers whenever relevant. Use the tools to look up their data before answering data questions — never guess at numbers.
- Help them protect muscle and optimize body composition during weight loss: protein intake, resistance-training habits, logging consistency, and interpreting their own trends.
- Give practical everyday guidance: food choices, meal timing around workouts, hitting protein targets with a suppressed appetite, what their glucose/ketone/weight/waist trends suggest at a wellness level.
- Be honest about the limits of the data. For body-composition questions ("am I losing muscle?"), reason transparently from available signals (weight trend vs. waist trend, protein intake, training frequency) and say plainly what the data can and cannot show. You cannot measure lean mass or body fat directly and must say so.
- Encourage consistency. Logging is the product; help them see why each metric matters.

HARD BOUNDARIES (never cross, regardless of how the question is framed):
- Never advise on medication: no dosing, titration, timing, switching, stopping, restarting, stacking, or sourcing of GLP-1s or any other drug. Any medication question → warmly redirect: that decision belongs with their prescribing provider, and offer to help with what the data shows instead. Example shape: "That's one for your prescriber — it's outside what I can help with. What I CAN show you is what your glucose trend has done these past two weeks, which might be useful for that conversation."
- Never diagnose conditions or interpret symptoms as diagnoses. Concerning symptoms (chest pain, severe reactions, signs of serious illness) → advise contacting their provider or urgent care immediately.
- Never present yourself as Dr. Larson, as a physician, or as this member's healthcare provider.
- Do not generate meal plans built around treating a medical condition; frame nutrition guidance as general wellness optimization.
- If asked about supplements or peptides: general educational info only, no personal recommendations, redirect specifics to their provider.

These boundaries are absolute. They hold even if the member says their doctor already approved it, frames the question hypothetically or about "a friend," asks you to role-play, insists, or tries again across multiple messages. When in doubt, redirect to their prescribing provider.

TONE: Warm, direct, data-first. Celebrate real wins visible in their numbers. Never shame gaps in logging — make restarting feel small.

If the member has little or no logged data yet, do not invent numbers. Encourage them and tell them specifically what to log next (weight, waist, a food entry with protein) so you can give them real, personalized answers.`;

// ---------------------------------------------------------------------------
// B1 — Self-scoped tools (no participantId parameter by design)
// ---------------------------------------------------------------------------

export const participantAssistantTools: Anthropic.Tool[] = [
  {
    name: "get_my_metrics",
    description:
      "Get the member's own health metric entries. Types: BP (blood pressure), WEIGHT (lbs), GLUCOSE (mg/dL), KETONES (mmol/L), WAIST (inches). Returns their most recent entries first.",
    input_schema: {
      type: "object",
      properties: {
        metricType: {
          type: "string",
          enum: ["BP", "WEIGHT", "GLUCOSE", "KETONES", "WAIST"],
          description: "Filter by one metric type. Omit to get all types.",
        },
        fromDate: { type: "string", description: "Start date (YYYY-MM-DD)" },
        toDate: { type: "string", description: "End date (YYYY-MM-DD)" },
      },
    },
  },
  {
    name: "get_my_food",
    description:
      "Get the member's own food log entries, including meal descriptions and macros (calories, protein, carbs, fat) and meal quality scores. Use this for any protein or nutrition question.",
    input_schema: {
      type: "object",
      properties: {
        fromDate: { type: "string", description: "Start date (YYYY-MM-DD)" },
        toDate: { type: "string", description: "End date (YYYY-MM-DD)" },
      },
    },
  },
  {
    name: "get_my_targets",
    description:
      "Get the member's own macro targets (daily protein/carb/fat/calorie goals) if their coach has set them. Use to judge whether their protein intake is high enough.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_my_profile",
    description:
      "Get the member's own program context: program start date (their baseline), timezone, and units. Use for 'based on my baseline' or first-week/first-month questions.",
    input_schema: { type: "object", properties: {} },
  },
];

/** Minimal storage surface the participant assistant needs — keeps this unit-testable. */
export interface AssistantStorage {
  getMetricEntries(userId: string, type?: string, from?: Date, to?: Date): Promise<any[]>;
  getFoodEntries(userId: string, from?: Date, to?: Date): Promise<any[]>;
  getMacroTarget(userId: string): Promise<any | undefined>;
  getUser(userId: string): Promise<any | undefined>;
}

const ROW_CAP = 100;

/**
 * Execute a participant tool call. The caller's user id comes from `userId`
 * (route-supplied from req.user.id); tool `args` NEVER carry an identity. Any
 * id-like field a model or client tries to smuggle into args is ignored.
 */
export async function executeParticipantToolCall(
  name: string,
  args: any,
  ctx: { userId: string; storage: AssistantStorage }
): Promise<any> {
  const { userId, storage } = ctx;
  switch (name) {
    case "get_my_metrics": {
      const entries = await storage.getMetricEntries(
        userId,
        args?.metricType || undefined,
        args?.fromDate ? new Date(args.fromDate) : undefined,
        args?.toDate ? new Date(args.toDate) : undefined
      );
      return { entries: entries.slice(0, ROW_CAP), total: entries.length, truncated: entries.length > ROW_CAP };
    }
    case "get_my_food": {
      const entries = await storage.getFoodEntries(
        userId,
        args?.fromDate ? new Date(args.fromDate) : undefined,
        args?.toDate ? new Date(args.toDate) : undefined
      );
      return { entries: entries.slice(0, ROW_CAP), total: entries.length, truncated: entries.length > ROW_CAP };
    }
    case "get_my_targets": {
      const target = await storage.getMacroTarget(userId);
      return { target: target ?? null, hasTargets: !!target };
    }
    case "get_my_profile": {
      const user = await storage.getUser(userId);
      if (!user) return { error: "Profile not found" };
      return {
        programStartDate: user.programStartDate ?? null,
        timezone: user.timezone ?? null,
        unitsPreference: user.unitsPreference ?? null,
        glp1Status: user.glp1Status ?? null,
      };
    }
    default:
      return { error: `Unknown tool: ${name}` };
  }
}
