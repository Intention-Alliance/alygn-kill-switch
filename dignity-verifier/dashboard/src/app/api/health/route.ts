/**
 * Dignity Verifier Dashboard — health check
 * Used by the Docker healthcheck (http://127.0.0.1:3000/health).
 */

import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    status: "ok",
    service: "dignity-verifier-dashboard",
    time: new Date().toISOString(),
  });
}
