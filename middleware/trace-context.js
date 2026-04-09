import { trace, propagation } from '@opentelemetry/api';

/**
 * Middleware to handle trace context propagation
 */
export function traceContextMiddleware(req, res, next) {
  // Extract context from headers
  const context = propagation.extract(propagation.getPropagatorDefault(), req.headers);
  
  // Set the active context for the rest of the request
  const activeContext = trace.setSpanContext(context);
  
  // Add trace ID to response header for debugging
  const activeSpan = trace.getActiveSpan();
  if (activeSpan) {
    const traceId = activeSpan.spanContext().traceId;
    res.setHeader('X-Trace-Id', traceId);
  }
  
  next();
}
