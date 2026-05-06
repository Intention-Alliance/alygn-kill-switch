/**
 * Trace Context Propagation Middleware
 * ADR-115: Distributed Tracing
 * 
 * Express/Fastify compatible middleware that:
 * 1. Extracts trace context from incoming headers
 * 2. Propagates X-Trace-ID in responses
 * 3. Propagates X-Chaos-Experiment-ID if present
 * 4. Adds trace context to all outgoing requests
 */

import { context, propagation, trace } from '@opentelemetry/api';
import { getTraceHeaders, extractTraceContext } from './tracing-sdk.mjs';

// ─── Express Middleware ─────────────────────────────────────────────

/**
 * Express middleware for trace context propagation
 * Usage: app.use(traceContextMiddleware())
 */
export function traceContextMiddleware() {
  return (req, res, next) => {
    // Extract trace context from incoming request
    const extractedCtx = extractTraceContext(req.headers);
    
    // Run the rest of the request in the extracted context
    context.with(extractedCtx, () => {
      const span = trace.getActiveSpan();
      
      // Add request attributes to current span
      if (span) {
        span.setAttribute('http.method', req.method);
        span.setAttribute('http.url', req.originalUrl || req.url);
        span.setAttribute('http.user_agent', req.get('user-agent') || 'unknown');
        
        // Propagate chaos experiment ID if present
        const chaosExpId = req.headers['x-chaos-experiment-id'];
        if (chaosExpId) {
          span.setAttribute('chaos.experiment_id', chaosExpId);
        }
        
        // Propagate feature flag context if present
        const flagCtx = req.headers['x-feature-flag-context'];
        if (flagCtx) {
          span.setAttribute('feature_flag.context', flagCtx);
        }
      }
      
      // Set X-Trace-ID in response
      const traceHeaders = getTraceHeaders();
      if (traceHeaders.traceparent) {
        res.setHeader('X-Trace-ID', traceHeaders.traceparent);
      }
      
      // Propagate chaos experiment ID in response
      if (req.headers['x-chaos-experiment-id']) {
        res.setHeader('X-Chaos-Experiment-ID', req.headers['x-chaos-experiment-id']);
      }
      
      next();
    });
  };
}

// ─── Fastify Middleware ─────────────────────────────────────────────

/**
 * Fastify plugin for trace context propagation
 * Usage: fastify.register(traceContextPlugin)
 */
export const traceContextPlugin = {
  name: 'trace-context-propagation',
  version: '1.0.0',
  
  hook(fastify) {
    fastify.addHook('onRequest', async (request, reply) => {
      const extractedCtx = extractTraceContext(request.headers);
      
      // Store context for downstream use
      request.traceContext = extractedCtx;
      
      const span = trace.getActiveSpan();
      if (span) {
        span.setAttribute('http.method', request.method);
        span.setAttribute('http.url', request.url);
        
        const chaosExpId = request.headers['x-chaos-experiment-id'];
        if (chaosExpId) {
          span.setAttribute('chaos.experiment_id', chaosExpId);
        }
      }
    });
    
    fastify.addHook('onSend', async (request, reply) => {
      const traceHeaders = getTraceHeaders();
      if (traceHeaders.traceparent) {
        reply.header('X-Trace-ID', traceHeaders.traceparent);
      }
      
      if (request.headers['x-chaos-experiment-id']) {
        reply.header('X-Chaos-Experiment-ID', request.headers['x-chaos-experiment-id']);
      }
    });
  },
};

// ─── Elysia Middleware (Bun) ────────────────────────────────────────

/**
 * Elysia middleware for trace context propagation
 * Usage: app.use(traceContextElysia)
 */
export const traceContextElysia = {
  name: 'trace-context-propagation',
  beforeHandle({ request, set }) {
    const extractedCtx = extractTraceContext(Object.fromEntries(
      request.headers.entries ? request.headers.entries() : []
    ));
    
    const span = trace.getActiveSpan();
    if (span) {
      span.setAttribute('http.method', request.method);
      span.setAttribute('http.url', new URL(request.url).pathname);
    }
  },
  afterHandle({ request, set }) {
    const traceHeaders = getTraceHeaders();
    if (traceHeaders.traceparent) {
      set.headers['X-Trace-ID'] = traceHeaders.traceparent;
    }
    
    if (request.headers.get('x-chaos-experiment-id')) {
      set.headers['X-Chaos-Experiment-ID'] = request.headers.get('x-chaos-experiment-id');
    }
  },
};

export default traceContextMiddleware;