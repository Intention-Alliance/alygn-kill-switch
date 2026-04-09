/**
 * Tracing utility helpers
 * ADR-115: Distributed Tracing
 */
import { SpanStatusCode, type Span, type Tracer, context, propagation } from '@opentelemetry/api';
import { getTracer } from './tracing.js';

export type { Span, Tracer };

/**
 * Wrap an async operation in a named span with attributes and error handling.
 *
 * @param name          - Span name (e.g. 'vc.discover', 'municipal.research')
 * @param operation     - The async work to trace
 * @param attributes    - Additional span attributes
 */
export async function traceOperation<T>(
  name: string,
  operation: (span: Span) => Promise<T>,
  attributes: Record<string, string | number | boolean> = {}
): Promise<T> {
  const tracer = getTracer();

  return tracer.startActiveSpan(name, async (span) => {
    for (const [key, value] of Object.entries(attributes)) {
      span.setAttribute(key, value);
    }

    try {
      const result = await operation(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      if (error instanceof Error) {
        span.recordException(error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      } else {
        span.recordException(new Error(String(error)));
        span.setStatus({ code: SpanStatusCode.ERROR, message: String(error) });
      }
      throw error;
    } finally {
      span.end();
    }
  });
}

/**
 * Wrap a synchronous operation in a named span.
 */
export function traceSync<T>(
  name: string,
  operation: (span: Span) => T,
  attributes: Record<string, string | number | boolean> = {}
): T {
  const tracer = getTracer();

  return tracer.startActiveSpan(name, (span) => {
    for (const [key, value] of Object.entries(attributes)) {
      span.setAttribute(key, value);
    }

    try {
      const result = operation(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      if (error instanceof Error) {
        span.recordException(error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      } else {
        span.recordException(new Error(String(error)));
        span.setStatus({ code: SpanStatusCode.ERROR, message: String(error) });
      }
      throw error;
    } finally {
      span.end();
    }
  });
}

/**
 * Inject trace context into a carrier object (e.g. HTTP headers or message props).
 */
export function injectTraceContext(carrier: Record<string, string>): Record<string, string> {
  propagation.inject(context.active(), carrier);
  return carrier;
}

/**
 * Extract trace context from a carrier object.
 */
export function extractTraceContext(carrier: Record<string, string>) {
  return propagation.extract(context.active(), carrier);
}

export { SpanStatusCode, context, propagation };
