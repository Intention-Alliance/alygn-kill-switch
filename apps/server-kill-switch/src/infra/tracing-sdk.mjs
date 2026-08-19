/**
 * OpenTelemetry SDK Integration for Node.js Services
 * ADR-115: Distributed Tracing
 * 
 * Usage:
 *   // At the VERY TOP of your entry file (before other imports):
 *   import './tracing-sdk.mjs';
 *   
 *   // Then use the tracer anywhere:
 *   import { tracer, recordSpan } from './tracing-sdk.mjs';
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import apiPkg from '@opentelemetry/api';
const { trace, context, propagation } = apiPkg;

// ─── Configuration ─────────────────────────────────────────────────

const OTEL_EXPORTER_URL = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4317';
const SERVICE_NAME = process.env.OTEL_SERVICE_NAME || 'phase0-service';
const SERVICE_VERSION = process.env.OTEL_SERVICE_VERSION || '0.1.0';

// ─── SDK Initialization ────────────────────────────────────────────

const traceExporter = new OTLPTraceExporter({
  url: OTEL_EXPORTER_URL,
});

const resource = resourceFromAttributes({
  [SEMRESATTRS_SERVICE_NAME]: SERVICE_NAME,
  [SEMRESATTRS_SERVICE_VERSION]: SERVICE_VERSION,
});

const sdk = new NodeSDK({
  resource,
  traceExporter,
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-http': { enabled: true },
      '@opentelemetry/instrumentation-express': { enabled: true },
      '@opentelemetry/instrumentation-redis-4': { enabled: true },
      '@opentelemetry/instrumentation-bunyan': { enabled: true },
      '@opentelemetry/instrumentation-net': { enabled: false },
    }),
  ],
});

// Start the SDK (SDK sets up default propagator automatically)
sdk.start();

// Graceful shutdown
process.on('SIGTERM', async () => {
  await sdk.shutdown();
});

// ─── Exported Helpers ──────────────────────────────────────────────

/** Get a tracer for creating spans */
export const tracer = trace.getTracer(SERVICE_NAME, SERVICE_VERSION);

/**
 * Record a span with automatic error handling
 * @param {string} name - Span name
 * @param {Object} attrs - Span attributes
 * @param {Function} fn - Async function to execute within the span
 */
export async function recordSpan(name, attrs, fn) {
  return tracer.startActiveSpan(name, { attributes: attrs }, async (span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: 1 }); // OK
      return result;
    } catch (err) {
      span.setStatus({ code: 2, message: err.message }); // ERROR
      span.recordException(err);
      throw err;
    } finally {
      span.end();
    }
  });
}

/** Get current trace ID from context */
export function getCurrentTraceId() {
  const span = trace.getSpan(context.active());
  return span ? span.spanContext().traceId : null;
}

/** Get current span ID from context */
export function getCurrentSpanId() {
  const span = trace.getSpan(context.active());
  return span ? span.spanContext().spanId : null;
}

/** Inject trace context into headers for outbound HTTP calls */
export function injectTraceContext(headers = {}) {
  propagation.inject(context.active(), headers);
  return headers;
}

/** Extract trace context from incoming headers */
export function extractTraceContext(headers) {
  return propagation.extract(context.active(), headers);
}
