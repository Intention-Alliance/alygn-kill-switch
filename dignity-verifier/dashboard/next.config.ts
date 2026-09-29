import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ─── Security Headers ────────────────────────────────────────
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' wss://andlersrv.tail62d797.ts.net:8443; font-src 'self'; object-src 'none'; media-src 'self'; frame-src 'none';",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          {
            key: "X-DNS-Prefetch-Control",
            value: "off",
          },
        ],
      },
    ];
  },

  // ─── Server External Packages ────────────────────────────────
  serverExternalPackages: ["better-auth", "drizzle-orm"],

  // ─── Standalone Output for Production Deployment ───────────
  output: "standalone",
};

export default nextConfig;
