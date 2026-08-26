import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allows testing the dev server from other devices on the same LAN
  // (e.g. a phone) via this machine's local network IP instead of
  // localhost. Without this, Next.js blocks cross-origin requests to
  // dev-only assets/HMR with a 403, which breaks client-side interactivity
  // (clicks/selects silently doing nothing) while the initial HTML still
  // loads fine — see https://nextjs.org/docs/app/api-reference/config/next-config-js/allowedDevOrigins
  allowedDevOrigins: ["192.168.1.*"],
};

export default nextConfig;
