import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allows testing the dev server from other devices on the same LAN
  // (e.g. a phone) via this machine's local network IP instead of
  // localhost. Without this, Next.js blocks cross-origin requests to
  // dev-only assets/HMR with a 403, which breaks client-side interactivity
  // (clicks/selects silently doing nothing) while the initial HTML still
  // loads fine — see https://nextjs.org/docs/app/api-reference/config/next-config-js/allowedDevOrigins
  allowedDevOrigins: ["192.168.1.*"],
  // Only consulted by `next build`/`next start` — `next dev` ignores it
  // entirely, so local development is unaffected. Emits `.next/standalone`,
  // a self-contained server with only the node_modules it actually traced
  // as used, which `Dockerfile.prod` (PILOT-04A) copies into a lean,
  // non-root runner image with no pnpm/toolchain at all.
  output: "standalone",
};

export default nextConfig;
