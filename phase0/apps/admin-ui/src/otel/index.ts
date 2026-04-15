import { WebTracerProvider, BatchSpanProcessor } from '@opentelemetry/sdk-trace-web';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';
import { ZoneContextManager } from '@opentelemetry/context-zone';
import { trace, diag, DiagConsoleLogger, DiagLogLevel, type Attributes } from '@opentelemetry/api';
import { initHTTPInterceptors } from './http-interceptor';

const COLLECTOR_URL = '/v1/traces';

interface TelemetryConfig {
  serviceName?: string;
  serviceVersion?: string;
  collectorUrl?: string;
  sampleRate?: number;
  errorSampleRate?: number;
}

let initialized = false;

/**
 * Initialize OpenTelemetry Browser SDK.
 * - 100% sampling for errors
 * - 10% sampling for normal traffic
 * - Auto-instrumentation for fetch, XHR, document load, user interaction
 * - HTTP interceptor for trace context propagation
 */
export function initTelemetry(config: TelemetryConfig = {}): void {
  if (initialized) return;
  initialized = true;

  const {
    serviceName = 'admin-ui',
    serviceVersion = '1.0.0',
    collectorUrl = COLLECTOR_URL,
    sampleRate = 0.1,
    errorSampleRate = 1.0,
  } = config;

  // Enable diagnostic logging in development
  if (import.meta.env.DEV) {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);
  }

  // Create resource identifying this service
  const resource = Resource.default().merge(
    new Resource({
      [ATTR_SERVICE_NAME]: serviceName,
      [ATTR_SERVICE_VERSION]: serviceVersion,
      'deployment.environment': import.meta.env.MODE,
    }),
  );

  // Create OTLP HTTP exporter
  const exporter = new OTLPTraceExporter({
    url: collectorUrl,
  });

  // Custom sampler: 100% for errors, configured rate for everything else
  const sampler = {
    shouldSample: (_ctx: unknown, _traceId: string, spanName: string, _spanKind: number, attributes: Attributes, _links: unknown[]) => {
      // Check if this is an error span
      const isError = attributes?.['error'] === true || 
                       String(spanName).includes('error') ||
                       String(spanName).includes('failed');
      
      const rate = isError ? errorSampleRate : sampleRate;
      
      // Simple probability sampling
      const decision = Math.random() < rate ? 1 : 0; // RECORD_AND_SAMPLE vs NOT_RECORD
      
      return {
        decision,
        attributes: {
          'sampling.rate': rate,
        },
      };
    },
    toString: () => `AdminUISampler(error=${errorSampleRate},normal=${sampleRate})`,
  };

  // Create provider with batch processor
  const provider = new WebTracerProvider({
    resource,
    sampler,
    spanProcessors: [
      new BatchSpanProcessor(exporter, {
        maxQueueSize: 100,
        maxExportBatchSize: 20,
        scheduledDelayMillis: 5000,
        exportTimeoutMillis: 30000,
      }),
    ],
  });

  // Register with Zone context manager for async support
  provider.register({
    contextManager: new ZoneContextManager(),
  });

  // Set as global tracer provider
  trace.setGlobalTracerProvider(provider);

  // Initialize HTTP interceptors for trace header propagation
  initHTTPInterceptors({
    baseUrl: '/v1',
    loginRedirectPath: '/login',
  });

  diag.info('OpenTelemetry initialized', { serviceName, sampleRate, errorSampleRate });
}

/** Get the global tracer for creating custom spans */
export function getTracer(name: string = 'admin-ui') {
  return trace.getTracer(name);
}

/** Create a span wrapping an async operation */
export async function withSpan<T>(
  spanName: string,
  fn: () => Promise<T>,
  attributes?: Attributes,
): Promise<T> {
  const tracer = getTracer();
  return tracer.startActiveSpan(spanName, { attributes }, async (span) => {
    try {
      const result = await fn();
      span.setStatus({ code: 1 }); // OK
      return result;
    } catch (err) {
      span.setStatus({ code: 2, message: err instanceof Error ? err.message : 'Unknown error' }); // ERROR
      span.recordException(err instanceof Error ? err : new Error(String(err)));
      throw err;
    } finally {
      span.end();
    }
  });
}

/** Create a span wrapping a sync operation */
export function withSpanSync<T>(
  spanName: string,
  fn: () => T,
  attributes?: Attributes,
): T {
  const tracer = getTracer();
  return tracer.startActiveSpan(spanName, { attributes }, (span) => {
    try {
      const result = fn();
      span.setStatus({ code: 1 });
      return result;
    } catch (err) {
      span.setStatus({ code: 2, message: err instanceof Error ? err.message : 'Unknown error' });
      span.recordException(err instanceof Error ? err : new Error(String(err)));
      throw err;
    } finally {
      span.end();
    }
  });
}

export { initialized };