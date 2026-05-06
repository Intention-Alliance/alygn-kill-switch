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
              "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; object-src 'none'; media-src 'self'; frame-src 'none';",
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
            value:
              "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          {
            key: "X-DNS-Prefetch-Control",
            value: "off",
          },
        ],
      },
    ];
  },

  // ─── API Proxy Rewrites ──────────────────────────────────────
  // All /api/* paths are proxied to the kill-switch backend,
  // masking the internal backend URL from the client.
  async rewrites() {
    const backendUrl =
      process.env.KILL_SWITCH_BACKEND_URL || "http://localhost:3000";

    return [
      {
        source: "/api/auth/:path*",
        destination: `${backendUrl}/v1/auth/:path*`,
      },
      {
        source: "/api/kill-switch/:path*",
        destination: `${backendUrl}/v1/kill-switch/:path*`,
      },
      {
        source: "/api/flags/:path*",
        destination: `${backendUrl}/v1/flags/:path*`,
      },
      {
        source: "/api/admin/:path*",
        destination: `${backendUrl}/admin/:path*`,
      },
      // Health and metrics endpoints
      {
        source: "/api/health",
        destination: `${backendUrl}/v1/kill-switch/health`,
      },
      {
        source: "/api/metrics",
        destination: `${backendUrl}/metrics`,
      },
    ];
  },

  // ─── Server External Packages ────────────────────────────────
  serverExternalPackages: ["better-auth", "@packages/db-schema"],

  // ─── Image Optimization ─────────────────────────────────────
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },

  // ─── Experimental Features ──────────────────────────────────
  cacheComponents: true,
};

export default nextConfig;
