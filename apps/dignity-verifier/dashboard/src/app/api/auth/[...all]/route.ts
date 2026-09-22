/**
 * Dignity Verifier Dashboard — Better-Auth route handler
 *
 * Mounts the self-contained Better-Auth server at /api/auth/*.
 * Also enforces the Tailscale identity check as defense-in-depth
 * (nginx already denies non-Tailscale IPs at the edge).
 */

import { toNextJsHandler } from "better-auth/next-js";
import { getAuth, isTailscaleIP, seedSuperAdmin } from "@/lib/auth";

// Seed the super-admin user on first request (idempotent).
// Runs once per process; subsequent calls are no-ops.
let seeded = false;
async function ensureSeeded() {
  if (!seeded) {
    await seedSuperAdmin();
    seeded = true;
  }
}

// Build the Better-Auth instance lazily (avoids Bun-only imports at build).
let handlerPromise: Promise<ReturnType<typeof toNextJsHandler>> | null = null;
async function getHandler() {
  if (!handlerPromise) {
    handlerPromise = (async () => {
      const auth = await getAuth();
      return toNextJsHandler(auth);
    })();
  }
  return handlerPromise;
}

/**
 * Defense-in-depth: reject non-Tailscale clients even if nginx is bypassed.
 * The client IP is read from the proxy headers set by nginx.
 */
function enforceTailscale(
  request: Request,
  handler: (req: Request) => Promise<Response>
): Promise<Response> {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  if (!isTailscaleIP(ip)) {
    return Promise.resolve(
      new Response(
        JSON.stringify({ error: { code: "FORBIDDEN", message: "Tailscale access only" } }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      )
    );
  }

  return handler(request);
}

export async function GET(request: Request) {
  await ensureSeeded();
  const { GET: baseGet } = await getHandler();
  return enforceTailscale(request, baseGet);
}

export async function POST(request: Request) {
  await ensureSeeded();
  const { POST: basePost } = await getHandler();
  return enforceTailscale(request, basePost);
}
