/**
 * Dignity Verifier Dashboard — Auth guard
 *
 * Requires an authenticated Better-Auth session for protected API routes.
 * Teaching actions trigger expensive local model runs, so every POST and
 * /api/runs* route is super-admin-only. Returns a 401 JSON response when the
 * caller has no valid session.
 */

import { NextResponse } from "next/server";
import { getAuth } from "./auth";

/**
 * Resolve the authenticated session for a request, or null when unauthenticated.
 */
export async function getSessionUser(request: Request) {
  const auth = await getAuth();
  const session = await auth.api.getSession({
    headers: request.headers,
  });
  return session?.user ?? null;
}

/**
 * Guard a route handler. Returns the user when authenticated, or a 401
 * NextResponse when not. Callers should return the response directly when
 * it is a NextResponse.
 */
export async function requireAuth(
  request: Request,
): Promise<{ user: { id: string; email: string } } | NextResponse> {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required",
        },
      },
      { status: 401 },
    );
  }
  return { user: { id: user.id, email: user.email ?? "" } };
}
