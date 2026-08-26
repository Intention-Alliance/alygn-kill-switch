/**
 * Dignity Verifier Dashboard — Better-Auth route handler
 *
 * Mounts the self-contained Better-Auth server at /api/auth/*.
 * Also enforces the Tailscale identity check as defense-in-depth
 * (nginx already denies non-Tailscale IPs at the edge).
 */

import { toNextJsHandler } from "better-auth/next-js";
import { auth, isTailscaleIP, seedSuperAdmin } from "@/lib/auth";

// Seed the super-admin user on first request (idempotent).
// Runs once per process; subsequent calls are no-ops.
let seeded = false;
async function ensureSeeded() {
  if (!seeded) {
    await seedSuperAdmin();
    seeded = true;
  }
}

export const { GET, POST } = toNextJsHandler(auth);

// Wrap handlers to enforce Tailscale identity + seed super-admin.
const originalGet = GET;
const originalPost = POST;

export async function GETHandler(request: Request) {
  await ensureSeeded();
  return enforceTailscale(request, originalGet);
}

export async function POSTHandler(request: Request) {
  await ensureSeeded();
  return enforceTailscale(request, originalPost);
}

async function enforceTailscale(request: Request, handler: (req: Request) => Promise<Response>) {
  // Defense-in-depth: reject non-Tailscale clients even if nginx is bypassed.
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  if (!isTailscaleIP(ip)) {
    return new Response(
      JSON.stringify({ error: { code: "FORBIDDEN", message: "Tailscale access only" } }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  return handler(request);
}
