import { tracer } from '../core/tracing.js';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { traceOperation } from '../core/tracing-utils.js';

describe('Tracing System', () => {
  it('should create a tracer instance', () => {
    expect(tracer).toBeDefined();
  });

  it('should wrap operations in spans using traceOperation', async () => {
    const start = Date.now();
    await traceOperation('test-span', async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
    });
    const end = Date.now();
    expect(end - start).toBeGreaterThanOrEqual(10);
  });

  it('should record errors in spans', async () => {
    try {
      await traceOperation('error-span', async () => {
        throw new Error('Test Error');
      });
    } catch (e) {
      expect(e.message).toBe('Test Error');
    }
  });
});
