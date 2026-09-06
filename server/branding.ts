/**
 * Server-side branding: defaults from shared/branding.ts overlaid with
 * BRAND_<FIELD> environment variables (e.g. BRAND_CLINICIAN_NAME). Read once
 * at boot; a change requires a restart, like every other env var.
 */
import { resolveBranding, type Branding } from "@shared/branding";

export const branding: Branding = resolveBranding((suffix) => process.env[`BRAND_${suffix}`]);
