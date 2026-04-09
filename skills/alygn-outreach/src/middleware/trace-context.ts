/**
 * Trace Context Middleware
 * Extracts and propagates W3C Trace Context via HTTP headers.
 * ADR-115: Distributed Tracing
 *
 * For CLI pipelines this is a no-op, but the same propagation
 * helpers (injectTraceContext / extractTraceContext) can be used
 * when the pipeline makes outbound HTTP calls.
 */
import { propagation, context, trace } from '@opentelemetry/api';
import { getTracer } from '../core/tracing.js';

export interface TraceContextRequest {
  headers?: Record<string, string>;
  [key: string]: unknown;
}

export interface TraceContextResponse {
  setHeader(name: string, value: string): void;
  getHeader(name: string): string | undefined;
}

/**
 * Express-style middleware for HTTP servers.
 * Attaches X-Trace-Id and X-Trace-Parent to responses.
 */
export function traceContextMiddleware(
  req: TraceContextRequest,
  res: TraceContextResponse,
  next: (err?: Error) => void
): void {
  // Extract incoming trace context from headers
  const headers = req.headers || {};
  const parentContext = propagation.extract(context.active(), headers);

  // Attach current span to the request for downstream handlers
  const currentSpan = trace.getSpan(parentContext);
  if (currentSpan) {
    const spanContext = currentSpan.spanContext();
    // Human-readable trace ID header
    res.setHeader('X-Trace-Id', spanContext.traceId);
    // W3C traceparent header
    res.setHeader('X-Trace-Parent', `00-${spanContext.traceId}-${spanContext.spanId}-01`);
  }

  next();
}

/**
 * Add trace context to outbound HTTP headers.
 * Call this before making outgoing HTTP requests so downstream
 * services can continue the trace.
 *
 * The carrier object is mutated in-place (W3C Trace Context convention).
 */
export function addTraceHeaders(
  headers: Record<string, string> = {}
): Record<string, string> {
  propagation.inject(context.active(), headers);
  return headers;
}
