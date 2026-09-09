/**
 * Single source of truth for build-time pilot configuration (Pilot-Ready
 * "PILOT-CLEAN — Cliente com base vazia e login único"). Every place that
 * needs one of these values imports it from here — never reads
 * `process.env.NEXT_PUBLIC_*` directly, so there is exactly one place
 * that knows the env var names and the dev-safe fallbacks.
 *
 * All values are `NEXT_PUBLIC_*` because this app has no backend yet —
 * Next.js inlines them into the client bundle at `next build` time (same
 * mechanism already used by `NEXT_PUBLIC_BUILD_SHA`, see `release-info.ts`).
 * Each is referenced as a static `process.env.NEXT_PUBLIC_X` property
 * access below (never through a loop or computed key) because that static
 * form is what Next.js's build-time inliner requires to replace it.
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

/**
 * Display name for the client's company, shown next to the session
 * identity (UserMenu) — never a hardcoded client name in a component.
 * "ObraFácil" itself is the product name and is never replaced by this.
 */
export const companyName: string = process.env.NEXT_PUBLIC_COMPANY_NAME?.trim() || "ObraFácil Demo";

/**
 * The pilot's single login. This authentication is entirely client-side
 * (see `features/auth/demo-auth.ts`) — there is no backend, no hash, no
 * token. `NEXT_PUBLIC_*` values are inlined into the browser bundle and
 * are trivially inspectable there; this is an ACCEPTED, TEMPORARY
 * limitation for this controlled pilot, not real security. It exists
 * only to let one client have one login for one quick test — never treat
 * this password as a secret, and never build real security on top of it.
 */
const pilotUserName = process.env.NEXT_PUBLIC_PILOT_USER_NAME?.trim() || "Administrador";

export const pilotUser = {
  name: pilotUserName,
  /** First token of `name` — the Dashboard greeting ("Olá, {firstName}")
   * derives from this instead of a separate hardcoded identity mock. */
  firstName: pilotUserName.split(/\s+/)[0] ?? pilotUserName,
  email: process.env.NEXT_PUBLIC_PILOT_USER_EMAIL?.trim() || "admin@admin.com",
  password: process.env.NEXT_PUBLIC_PILOT_USER_PASSWORD || "admin@123",
};
