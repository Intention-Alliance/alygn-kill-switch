import { trace, SpanStatusCode } from '@opentelemetry/api';
import { tracer } from './tracing.js';

/**
 * Wraps a function in an OpenTelemetry span
 * @param {string} name - Name of the operation
 * @param {Function} fn - The function to execute
 * @param {Object} attributes - Additional attributes for the span
 */
export async function traceOperation(name, fn, attributes = {}) {
  return await tracer.startActiveSpan(name, async (span) => {
    try {
      if (attributes) {
        span.setAllAttributes(attributes);
      }
      const result = await fn();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message,
      });
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  });
}

/**
 * Traces an incoming HTTP request
 * @param {Object} req - The request object
 */
export function traceRequest(req) {
  const span = trace.getActiveSpan();
  if (span) {
    span.setAttribute('http.method', req.method);
    span.setAttribute('http.url', req.url);
    span.setAttribute('http.user_agent', req.headers['user-agent']);
  }
}
