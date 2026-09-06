/**
 * Branding — the single source of every clinician / practice / product
 * identity string that appears in user-facing copy or AI personas.
 *
 * Today the app is a single practice, so the defaults ARE the brand. This
 * module exists so that a second practice (per-environment deployment, or
 * a future organizations table) is a configuration change, not a search
 * and replace across the codebase: the server overlays BRAND_* env vars
 * (server/branding.ts) and the client overlays VITE_BRAND_* at build time
 * (client/src/lib/branding.ts).
 *
 * Do not add clinician or practice names anywhere else in copy or prompts —
 * add a field here and reference it.
 */
export interface Branding {
  /** Product name shown in the UI chrome and PDF exports. */
  productName: string;
  /** Full clinician name, e.g. "Dr. Chad Larson". */
  clinicianName: string;
  /** Short clinician name used in running copy, e.g. "Dr. Larson". */
  clinicianShortName: string;
  /** Practice / organization name, e.g. "The Adapt Lab". */
  practiceName: string;
  /** Co-brand credit line for a partner-distributed deployment. */
  poweredBy: string;
  /** Default public base URL used when APP_BASE_URL is unset. */
  appBaseUrl: string;
  /** Bootstrap admin created on first migration against an empty database. */
  bootstrapAdminEmail: string;
  bootstrapAdminName: string;
}

export const DEFAULT_BRANDING: Branding = {
  productName: "Metabolic OS",
  clinicianName: "Dr. Chad Larson",
  clinicianShortName: "Dr. Larson",
  practiceName: "The Adapt Lab",
  poweredBy: "Powered by The Adapt Lab",
  appBaseUrl: "https://app.theadaptlab.com",
  bootstrapAdminEmail: "drchad@theadaptlab.com",
  bootstrapAdminName: "Dr. Chad Larson",
};

/** Maps each Branding field to the env-var suffix that overrides it. */
export const BRANDING_ENV_KEYS: Record<keyof Branding, string> = {
  productName: "PRODUCT_NAME",
  clinicianName: "CLINICIAN_NAME",
  clinicianShortName: "CLINICIAN_SHORT_NAME",
  practiceName: "PRACTICE_NAME",
  poweredBy: "POWERED_BY",
  appBaseUrl: "APP_BASE_URL",
  bootstrapAdminEmail: "BOOTSTRAP_ADMIN_EMAIL",
  bootstrapAdminName: "BOOTSTRAP_ADMIN_NAME",
};

/**
 * Overlay non-empty overrides onto the defaults. `read` receives the env
 * suffix (e.g. "CLINICIAN_NAME") and returns the raw value or undefined —
 * the caller decides the prefix (BRAND_ on the server, VITE_BRAND_ on the
 * client) so this stays runtime-agnostic.
 */
export function resolveBranding(read: (envSuffix: string) => string | undefined): Branding {
  const out: Branding = { ...DEFAULT_BRANDING };
  for (const field of Object.keys(BRANDING_ENV_KEYS) as (keyof Branding)[]) {
    const value = read(BRANDING_ENV_KEYS[field]);
    if (value && value.trim()) out[field] = value.trim();
  }
  return out;
}
