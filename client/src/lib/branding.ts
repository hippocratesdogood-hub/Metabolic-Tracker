/**
 * Client-side branding: defaults from shared/branding.ts overlaid with
 * VITE_BRAND_<FIELD> variables resolved at build time (e.g.
 * VITE_BRAND_CLINICIAN_NAME). Vite only exposes VITE_-prefixed vars, and only
 * static-looking access survives its replacement, so read from the env object
 * it injects rather than through process.env.
 */
import { resolveBranding, type Branding } from '@shared/branding';

const viteEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};

export const branding: Branding = resolveBranding((suffix) => viteEnv[`VITE_BRAND_${suffix}`]);
