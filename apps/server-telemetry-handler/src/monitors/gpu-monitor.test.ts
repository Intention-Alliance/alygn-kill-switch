/**
 * GPU Monitor Unit Tests
 *
 * Tests for GpuMonitor:
 *  - nvidia-smi output parsing
 *  - Graceful fallback when nvidia-smi is absent
 *  - Error handling when nvidia-smi fails
 *  - Verification that the service NEVER crashes on GPU absence
 */

import { describe, it, expect } from 'bun:test';
import { GpuMonitor } from './gpu-monitor';

// ─── Mock nvidia-smi output (realistic sample) ─────────────────────

const MOCK_NVIDIA_SMI_OUTPUT_MULTI = [
  'NVIDIA GeForce RTX 4090, 45, 72, 8192, 24564, 180.5',
  'NVIDIA RTX A6000, 38, 15, 4096, 49152, 95.2',
];

const MOCK_NVIDIA_SMI_OUTPUT_SINGLE = [
  'NVIDIA GeForce RTX 4090, 45, 72, 8192, 24564, 180.5',
];

// ─── Subprocess Factory ────────────────────────────────────────────

interface MockStreamResult {
  done: boolean;
  value: Uint8Array | undefined;
}

function createMockReader(data: Uint8Array): ReadableStreamDefaultReader<Uint8Array> {
  let read = false;
  return {
    read(): Promise<MockStreamResult> {
      if (read) return Promise.resolve({ done: true, value: undefined });
      read = true;
      return Promise.resolve({ done: false, value: data });
    },
    cancel(): Promise<void> {
      return Promise.resolve();
    },
    releaseLock(): void {},
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function createMockReadableStream(data: Uint8Array) {
  return {
    getReader: () => createMockReader(data),
  };
}

function mockSubprocessSuccess(stdoutLines: string[]): any {
  const stdoutText = stdoutLines.join('\n');
  const stdoutData = new TextEncoder().encode(stdoutText);
  const stderrData = new TextEncoder().encode('');

  return {
    exitCode: 0,
    killed: false,
    get exited(): Promise<number> { return Promise.resolve(0); },
    kill() { (this as any).killed = true; },
    stdout: createMockReadableStream(stdoutData),
    stderr: createMockReadableStream(stderrData),
  };
}

function mockSubprocessFailure(_exitCode: number, _stderrMessage: string): any {
  const stderrData = new TextEncoder().encode(_stderrMessage);

  return {
    exitCode: _exitCode,
    killed: false,
    get exited(): Promise<number> { return Promise.resolve(_exitCode); },
    kill() {},
    stdout: createMockReadableStream(new TextEncoder().encode('')),
    stderr: createMockReadableStream(stderrData),
  };
}

describe('GpuMonitor', () => {
  describe('name', () => {
    it('should return "gpu" as the monitor name', () => {
      const monitor = new GpuMonitor();
      expect(monitor.name).toBe('gpu');
    });
  });

  describe('collect() — success path', () => {
    it('should parse multi-GPU nvidia-smi output into correct metrics', async () => {
      const mockSpawn = (_cmd: string[], _opts?: any) =>
        mockSubprocessSuccess(MOCK_NVIDIA_SMI_OUTPUT_MULTI);

      const monitor = new GpuMonitor(mockSpawn as any);
      const metrics = await monitor.collect();

      // Per GPU: name (1), temp (1), util (1), mem_used (1), mem_total (1), mem_usage (1), power (1) = 7
      expect(metrics.length).toBeGreaterThanOrEqual(10);

      // GPU 0 temperature
      const gpu0Temp = metrics.find(
        (m: { metricName: string; labels?: Record<string, string> }) =>
          m.metricName === 'temperature' && m.labels?.gpu_index === '0',
      );
      expect(gpu0Temp).toBeDefined();
      expect(gpu0Temp!.metricValue).toBe(45);
      expect(gpu0Temp!.unit).toBe('celsius');

      // GPU 0 utilization
      const gpu0Util = metrics.find(
        (m: { metricName: string; labels?: Record<string, string> }) =>
          m.metricName === 'utilization_percent' && m.labels?.gpu_index === '0',
      );
      expect(gpu0Util).toBeDefined();
      expect(gpu0Util!.metricValue).toBe(72);

      // GPU 1 memory total
      const gpu1MemTotal = metrics.find(
        (m: { metricName: string; labels?: Record<string, string> }) =>
          m.metricName === 'memory_total_bytes' && m.labels?.gpu_index === '1',
      );
      expect(gpu1MemTotal).toBeDefined();
      expect(gpu1MemTotal!.metricValue).toBe(49152 * 1024 * 1024);

      // GPU 0 power
      const gpu0Power = metrics.find(
        (m: { metricName: string; labels?: Record<string, string> }) =>
          m.metricName === 'power_draw' && m.labels?.gpu_index === '0',
      );
      expect(gpu0Power).toBeDefined();
      expect(gpu0Power!.metricValue).toBe(180.5);
    });

    it('should handle single-GPU output', async () => {
      const mockSpawn = (_cmd: string[], _opts?: any) =>
        mockSubprocessSuccess(MOCK_NVIDIA_SMI_OUTPUT_SINGLE);

      const monitor = new GpuMonitor(mockSpawn as any);
      const metrics = await monitor.collect();

      const gpu1 = metrics.find(
        (m: { labels?: Record<string, string> }) => m.labels?.gpu_index === '1',
      );
      expect(gpu1).toBeUndefined();
    });
  });

  describe('collect() — graceful fallback', () => {
    it('should return empty array when nvidia-smi exits non-zero', async () => {
      const mockSpawn = (_cmd: string[], _opts?: any) =>
        mockSubprocessFailure(1, 'NVIDIA driver not loaded');

      const monitor = new GpuMonitor(mockSpawn as any);
      const metrics = await monitor.collect();

      expect(Array.isArray(metrics)).toBe(true);
      expect(metrics.length).toBe(0);
    });

    it('should return empty array when spawn throws ENOENT', async () => {
      const mockSpawn = (_cmd: string[], _opts?: any) => {
        const error = new Error('nvidia-smi: command not found');
        (error as any).code = 'ENOENT';
        throw error;
      };

      const monitor = new GpuMonitor(mockSpawn as any);
      const metrics = await monitor.collect();

      expect(Array.isArray(metrics)).toBe(true);
      expect(metrics.length).toBe(0);
    });

    it('should NEVER throw on unexpected errors', async () => {
      const mockSpawn = (_cmd: string[], _opts?: any) => {
        throw new Error('Something went terribly wrong');
      };

      const monitor = new GpuMonitor(mockSpawn as any);
      const metrics = await monitor.collect();

      expect(Array.isArray(metrics)).toBe(true);
      expect(metrics.length).toBe(0);
    });
  });

  describe('memory usage calculation', () => {
    it('should compute memory_usage_percent correctly', async () => {
      const mockSpawn = (_cmd: string[], _opts?: any) =>
        mockSubprocessSuccess(['Test GPU, 30, 50, 4096, 16384, 120']);

      const monitor = new GpuMonitor(mockSpawn as any);
      const metrics = await monitor.collect();

      const memUsage = metrics.find(
        (m: { metricName: string }) => m.metricName === 'memory_usage_percent',
      );
      expect(memUsage).toBeDefined();
      // 4096 / 16384 = 25%
      expect(memUsage!.metricValue).toBe(25);
    });
  });
});
