import packageJson from "../../package.json";

/**
 * Single source of truth for "what is the client actually running"
 * (Pilot-Ready "PILOT-03 — Identificação de Release") — every place
 * that needs to show version/build (today: `UserMenu`) imports this,
 * never reads `process.env.NEXT_PUBLIC_BUILD_SHA` or the package
 * version directly.
 *
 * `version` comes straight from `apps/web/package.json` — never a
 * second hardcoded copy that could drift from it.
 *
 * `build` is the short git SHA the app was built from, injected via
 * `NEXT_PUBLIC_BUILD_SHA` at *build* time (Next.js inlines
 * `NEXT_PUBLIC_*` vars into the client bundle during `next build` —
 * setting this only at container `start` time has no effect; see the
 * PILOT-03 report for the Docker build-arg wiring this requires).
 * When that variable isn't set (`pnpm dev`, or a `next build` that
 * forgot to pass it), `build` falls back to the literal `"local"` —
 * never an invented SHA.
 */
export type ReleaseChannel = "Piloto";

export interface ReleaseInfo {
  channel: ReleaseChannel;
  version: string;
  build: string;
}

function shortBuildSha(sha: string | undefined): string {
  const trimmed = sha?.trim();
  return trimmed ? trimmed.slice(0, 7) : "local";
}

export const releaseInfo: ReleaseInfo = {
  channel: "Piloto",
  version: packageJson.version,
  build: shortBuildSha(process.env.NEXT_PUBLIC_BUILD_SHA),
};
