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
              "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws://localhost:3000; font-src 'self'; object-src 'none'; media-src 'self'; frame-src 'none';",
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
    // The backend URL is baked into the build output at build time. In local
    // dev the backend runs on the host (localhost), but in the production
    // Docker deployment the kill-switch runs in network_mode: host (binds
    // 127.0.0.1:3000 on the host) and is NOT on align-network, so the
    // web-regulator reaches it via the Docker host gateway. Defaulting to
    // "localhost" in a production build silently breaks every /api/* proxy
    // (the container would call itself), which manifests as auth failures and
    // 500s. Use the host gateway as the production default unless
    // KILL_SWITCH_BACKEND_URL is explicitly set.
    const backendUrl =
      process.env.KILL_SWITCH_BACKEND_URL ||
      (process.env.NODE_ENV === "production"
        ? "http://host.docker.internal:3000"
        : "http://localhost:3000");

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
        destination: `${backendUrl}/api/admin/:path*`,
      },
      {
        source: "/api/machines/:path*",
        destination: `${backendUrl}/v1/machines/:path*`,
      },
      {
        source: "/api/settings/:path*",
        destination: `${backendUrl}/v1/settings/:path*`,
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

  // ─── Standalone Output for Production Deployment ───────────
  // Creates a standalone server bundle for deployment to /var/www/admin
  output: 'standalone',
};

export default nextConfig;
