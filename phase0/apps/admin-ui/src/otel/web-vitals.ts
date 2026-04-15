import { SpanStatusCode } from '@opentelemetry/api';
import { getTracer } from './index';

type MetricName = 'FCP' | 'LCP' | 'CLS' | 'FID' | 'INP' | 'TTFB';

interface VitalMetric {
  name: MetricName;
  value: number;
  rating: string;
  navigationType?: string;
  delta: number;
  entries: PerformanceEntry[];
}

interface WebVitalsConfig {
  sampleRate?: number;
  reportToConsole?: boolean;
}

const DEFAULT_CONFIG: WebVitalsConfig = {
  sampleRate: 1.0, // 100% for performance metrics
  reportToConsole: import.meta.env.DEV,
};

let vitalsInitialized = false;

function createVitalSpan(metric: VitalMetric): void {
  const tracer = getTracer('web-vitals');
  const span = tracer.startSpan(`web_vitals.${metric.name.toLowerCase()}`, {
    attributes: {
      'metric.name': metric.name,
      'metric.value': metric.value,
      'metric.rating': metric.rating,
      'metric.delta': metric.delta,
      'page.url': window.location.href,
      'page.path': window.location.pathname,
      ...(metric.navigationType && { 'metric.navigation_type': metric.navigationType }),
    },
  });

  span.setStatus({ code: SpanStatusCode.OK });
  span.end();
}

function handleMetric(metric: VitalMetric, config: WebVitalsConfig): void {
  // Apply sampling
  if (Math.random() > (config.sampleRate ?? 1.0)) return;

  createVitalSpan(metric);

  if (config.reportToConsole) {
    console.log(`[WebVitals] ${metric.name}: ${metric.value.toFixed(2)} (${metric.rating})`);
  }
}

/**
 * Initialize Web Vitals monitoring.
 * Captures FCP, LCP, CLS, FID, INP, TTFB and reports as OTel spans.
 * 100% sample rate by default since these are lightweight metrics.
 */
export function initWebVitals(config: WebVitalsConfig = {}): void {
  if (vitalsInitialized) return;
  vitalsInitialized = true;

  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  // Dynamic import of web-vitals library
  import('web-vitals').then((webVitals) => {
    webVitals.onFCP((metric) => handleMetric(metric as unknown as VitalMetric, mergedConfig));
    webVitals.onLCP((metric) => handleMetric(metric as unknown as VitalMetric, mergedConfig));
    webVitals.onCLS((metric) => handleMetric(metric as unknown as VitalMetric, mergedConfig));
    webVitals.onFID((metric) => handleMetric(metric as unknown as VitalMetric, mergedConfig));
    webVitals.onINP((metric) => handleMetric(metric as unknown as VitalMetric, mergedConfig));
    webVitals.onTTFB((metric) => handleMetric(metric as unknown as VitalMetric, mergedConfig));
  }).catch((err) => {
    console.warn('[WebVitals] Failed to initialize:', err);
  });
}

/**
 * Manually report a custom performance metric.
 */
export function reportCustomMetric(name: string, value: number, attributes?: Record<string, string>): void {
  const tracer = getTracer('web-vitals');
  tracer.startActiveSpan(`web_vitals.custom.${name}`, {
    attributes: {
      'metric.name': name,
      'metric.value': value,
      'page.url': window.location.href,
      'page.path': window.location.pathname,
      ...attributes,
    },
  }, (_span) => {
    _span.setStatus({ code: SpanStatusCode.OK });
    _span.end();
  });
}

export type { VitalMetric, WebVitalsConfig, MetricName };