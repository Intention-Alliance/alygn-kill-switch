/**
 * OpenTelemetry Tracing — Frontend Instrumentation
 *
 * Minimal tracing setup for the web-regulator frontend.
 * Traces page views, API calls, and errors.
 *
 * Note: For full OTel collector integration, configure the
 * OTEL_EXPORTER_OTLP_ENDPOINT in your environment.
 */

// ─── Configuration ──────────────────────────────────────────────────

interface OtelConfig {
  enabled: boolean;
  serviceName: string;
  sampleRate: number;
}

const config: OtelConfig = {
  enabled: process.env.NEXT_PUBLIC_OTEL_ENABLED === "true",
  serviceName: "alygn-web-regulator",
  sampleRate: 1.0,
};

// ─── Event Types ─────────────────────────────────────────────────────

export type TraceEvent =
  | { type: "page_view"; path: string; timestamp: number }
  | { type: "api_call"; method: string; path: string; status: number; durationMs: number }
  | { type: "error"; message: string; stack?: string; component?: string };

const eventBuffer: TraceEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

// ─── Public API ──────────────────────────────────────────────────────

export function tracePageView(path: string): void {
  if (!config.enabled) return;
  emit({ type: "page_view", path, timestamp: Date.now() });
}

export function traceApiCall(
  method: string,
  path: string,
  status: number,
  durationMs: number,
): void {
  if (!config.enabled) return;
  emit({ type: "api_call", method, path, status, durationMs });
}

export function traceError(
  message: string,
  stack?: string,
  component?: string,
): void {
  if (!config.enabled) return;
  emit({ type: "error", message, stack, component });
}

// ─── Internals ────────────────────────────────────────────────────────

function emit(event: TraceEvent): void {
  // Add frontend service info
  const enriched = {
    ...event,
    service: config.serviceName,
    environment: process.env.NODE_ENV ?? "development",
  };

  eventBuffer.push(event);

  // Log to console in development
  if (process.env.NODE_ENV === "development") {
    console.debug("[otel:frontend]", enriched);
  }

  // Flush periodically
  if (!flushTimer) {
    flushTimer = setTimeout(flush, 5_000);
  }
}

async function flush(): Promise<void> {
  flushTimer = null;

  if (eventBuffer.length === 0) return;

  const events = eventBuffer.splice(0, eventBuffer.length);

  const endpoint =
    process.env.NEXT_PUBLIC_OTEL_COLLECTOR_URL || "/api/metrics";

  try {
    await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service: config.serviceName,
        events,
        timestamp: Date.now(),
      }),
      // Fire-and-forget — don't block on trace export
      keepalive: true,
    });
  } catch {
    // Silently fail — tracing is best-effort
  }
}

// Ensure flush on page unload
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    flush();
  });
}
