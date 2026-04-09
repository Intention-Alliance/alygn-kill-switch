/**
 * OpenTelemetry Distributed Tracing Setup
 * ADR-115: Distributed Tracing
 *
 * Uses OpenTelemetry SDK v0.214+ API.
 */
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { trace } from '@opentelemetry/api';

let sdk: NodeSDK | null = null;

export function initTracing(): void {
  if (sdk) return;

  const jaegerEndpoint = process.env.JAEGER_ENDPOINT || 'http://localhost:14268/api/traces';
  const serviceName = process.env.OTEL_SERVICE_NAME || 'alygn-outreach';
  const serviceVersion = process.env.OTEL_SERVICE_VERSION || '1.0.0';

  sdk = new NodeSDK({
    traceExporter: new JaegerExporter({ endpoint: jaegerEndpoint }),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName,
      [ATTR_SERVICE_VERSION]: serviceVersion,
    }),
  });

  sdk.start();

  process.on('SIGTERM', () => {
    sdk?.shutdown().catch(console.error);
  });
}

/**
 * Returns a tracer for the alygn-outreach service.
 * initTracing() is called lazily on first access.
 */
export function getTracer() {
  if (!sdk) {
    initTracing();
  }
  return trace.getTracer('alygn-outreach');
}

export { NodeSDK, JaegerExporter };
