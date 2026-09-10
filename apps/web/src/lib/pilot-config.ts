/**
 * Single source of truth for build-time pilot configuration (Pilot-Ready
 * "PILOT-CLEAN — Cliente com base vazia e login único"). Every place that
 * needs one of these values imports it from here — never reads
 * `process.env.NEXT_PUBLIC_*` directly, so there is exactly one place
 * that knows the env var names and the dev-safe fallbacks.
 *
 * All values are `NEXT_PUBLIC_*` — Next.js inlines them into the client
 * bundle at `next build` time (same mechanism already used by
 * `NEXT_PUBLIC_BUILD_SHA`, see `release-info.ts`). Each is referenced as a
 * static `process.env.NEXT_PUBLIC_X` property access below (never through
 * a loop or computed key) because that static form is what Next.js's
 * build-time inliner requires to replace it.
 *
 * As of Gate FRONTEND-AUTH-01, identity/credentials are no longer this
 * module's responsibility — `pilotUser`/`companyName` were removed once
 * `features/auth/demo-auth.ts` (their only consumer) was deleted in favor
 * of the real Laravel/Sanctum session (`features/auth/auth-provider.tsx`).
 * This module still governs seed-data visibility, unrelated to auth.
 */

function readBooleanEnv(raw: string | undefined, defaultValue: boolean): boolean {
  if (raw === undefined) return defaultValue;
  return raw.trim().toLowerCase() === "true";
}

/**
 * `true` (default, dev-safe): every store's seed/mock data continues to
 * appear, exactly like before this config existed.
 * `false`: no store returns any seed row — only what the browser itself
 * created. Set via `NEXT_PUBLIC_DEMO_DATA_ENABLED=false` for a client
 * build that must start on a completely empty base.
 */
export const demoDataEnabled: boolean = readBooleanEnv(process.env.NEXT_PUBLIC_DEMO_DATA_ENABLED, true);

/**
 * `true` (default, dev-safe): the "Zerar dados de teste" action on the
 * Dados e Backup screen is shown, same as today.
 * `false`: the action is hidden from the UI. The implementation itself
 * is never removed — see PILOT-CLEAN §9, this only controls visibility.
 */
export const pilotResetEnabled: boolean = readBooleanEnv(process.env.NEXT_PUBLIC_PILOT_RESET_ENABLED, true);
