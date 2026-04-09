/**
 * Tracing unit tests
 * ADR-115: Distributed Tracing
 */
import { describe, it, beforeEach, afterEach, mock, expect } from 'bun:test';
import { traceOperation, traceSync, injectTraceContext, extractTraceContext } from '../src/core/tracing-utils';

// Mock the OpenTelemetry API so tests run without a real SDK
mock.module('@opentelemetry/api', () => {
  const mockSpan = {
    setAttribute: mock(() => {}),
    setStatus: mock(() => {}),
    recordException: mock(() => {}),
    end: mock(() => {}),
    spanContext: () => ({ traceId: '00000000000000000000000000000001', spanId: '0000000000000001' }),
  };

  return {
    SpanStatusCode: { OK: 0, ERROR: 2 },
    context: { active: () => ({}), with: (ctx: unknown, fn: () => void) => fn() },
    propagation: {
      inject: (ctx: unknown, carrier: Record<string, string>) => {
        carrier['traceparent'] = '00-00000000000000000000000000000001-0000000000000001-01';
        return carrier;
      },
      extract: (_ctx: unknown, carrier: Record<string, string>) => carrier,
    },
    trace: {
      getSpan: (_ctx: unknown) => mockSpan,
    },
  };
});

// We also need to mock the tracing module that returns a mock tracer
mock.module('../src/core/tracing', () => {
  const mockSpan = {
    setAttribute: mock(() => {}),
    setStatus: mock(() => {}),
    recordException: mock(() => {}),
    end: mock(() => {}),
    spanContext: () => ({ traceId: '00000000000000000000000000000001', spanId: '0000000000000001' }),
  };

  return {
    initTracing: mock(() => {}),
    getTracer: () => ({
      startActiveSpan: (
        name: string,
        fn: (span: typeof mockSpan) => Promise<unknown>
      ) => fn(mockSpan),
    }),
    NodeSDK: class {},
    JaegerExporter: class {},
    Resource: class {},
  };
});

describe('tracing-utils', () => {
  describe('traceOperation', () => {
    it('should create a span and call operation', async () => {
      const operation = mock(async (span: unknown) => {
        return 'success';
      });

      const result = await traceOperation('test.op', operation, { foo: 'bar' });

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should record exception on error', async () => {
      const error = new Error('test error');
      const operation = mock(async (_span: unknown) => {
        throw error;
      });

      await expect(traceOperation('test.error', operation)).rejects.toThrow('test error');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should accept numeric and boolean attributes', async () => {
      const operation = mock(async (span: unknown) => 'ok');

      await traceOperation(
        'test.attrs',
        operation,
        { count: 42, enabled: true, name: 'test' }
      );

      expect(operation).toHaveBeenCalledTimes(1);
    });
  });

  describe('traceSync', () => {
    it('should wrap sync operations', () => {
      const operation = mock((_span: unknown) => 'sync-result');

      const result = traceSync('test.sync', operation);

      expect(result).toBe('sync-result');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should record exception on sync error', () => {
      const error = new Error('sync error');
      const operation = mock((_span: unknown) => {
        throw error;
      });

      expect(() => traceSync('test.sync-error', operation)).toThrow('sync error');
    });
  });

  describe('injectTraceContext', () => {
    it('should inject traceparent header', () => {
      const carrier: Record<string, string> = {};
      const result = injectTraceContext(carrier);

      expect(result['traceparent']).toBe('00-00000000000000000000000000000001-0000000000000001-01');
    });

    it('should preserve existing headers', () => {
      const carrier = { Authorization: 'Bearer token' };
      const result = injectTraceContext(carrier);

      expect(result['Authorization']).toBe('Bearer token');
      expect(result['traceparent']).toBeDefined();
    });
  });

  describe('extractTraceContext', () => {
    it('should extract from carrier', () => {
      const carrier = { traceparent: '00-abc00000000000000000000000abc01-def0000000000001-01' };
      const result = extractTraceContext(carrier);

      expect(result).toBe(carrier);
    });
  });
});

describe('SpanStatusCode', () => {
  it('should export OK and ERROR codes', async () => {
    // Verify the module exports correctly
    const { SpanStatusCode } = await import('@opentelemetry/api');
    expect(SpanStatusCode.OK).toBe(0);
    expect(SpanStatusCode.ERROR).toBe(2);
  });
});
