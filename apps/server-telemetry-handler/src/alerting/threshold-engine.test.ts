/**
 * Threshold Engine Unit Tests
 *
 * Tests for ThresholdEngine:
 *  - Warning/critical/emergency severity evaluation
 *  - Emergency → Kill Switch trigger path
 *  - Multiple thresholds per metric (worst severity wins)
 *  - Missing threshold handling
 *  - All configured threshold rules are present
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ThresholdEngine } from './threshold-engine';
import { KillSwitchBridge } from './kill-switch-bridge';
import type { TelemetryConfig } from '../config';
import type { HardwareMetric } from '../types';

// ─── Mock Kill Switch Bridge ───────────────────────────────────────

class MockKillSwitchBridge {
  public triggeredPayloads: Array<{
    reason: string;
    triggerUserId: string;
    targetState: string;
  }> = [];

  public async triggerEmergencyStop(payload: {
    reason: string;
    triggerUserId: string;
    targetState: string;
  }): Promise<void> {
    this.triggeredPayloads.push(payload);
  }
}

// ─── Test Config ──────────────────────────────────────────────────

const TEST_CONFIG: TelemetryConfig = {
  collectionIntervalSeconds: 30,
  criticalCollectionIntervalSeconds: 5,
  batchFlushIntervalSeconds: 10,
  batchMaxSize: 100,
  thresholds: {
    gpu: {
      tempCriticalCelsius: 85,
      tempEmergencyCelsius: 95,
    },
    cpu: {
      tempCriticalCelsius: 80,
    },
    memory: {
      usageCriticalPercent: 90,
    },
    disk: {
      usageCriticalPercent: 95,
    },
  },
  enableKillSwitchTrigger: true,
  logLevel: 'info',
  port: 3002,
  dataDir: './data',
  redisUrls: [],
};

describe('ThresholdEngine', () => {
  let mockBridge: MockKillSwitchBridge;
  let thresholdEngine: ThresholdEngine;

  beforeEach(() => {
    mockBridge = new MockKillSwitchBridge();
    thresholdEngine = new ThresholdEngine(
      TEST_CONFIG,
      mockBridge as unknown as KillSwitchBridge,
    );
  });

  describe('GPU temperature thresholds', () => {
    it('should return no alert when GPU temp is below critical', async () => {
      const metric: HardwareMetric = {
        monitorName: 'gpu',
        metricName: 'temperature',
        metricValue: 70,
        unit: 'celsius',
      };

      const result = await thresholdEngine.evaluate(metric, 'machine-1');

      expect(result.exceeded).toBe(false);
      expect(result.severity).toBeNull();
      expect(result.thresholdValue).toBeNull();
    });

    it('should return critical when GPU temp exceeds 85', async () => {
      const metric: HardwareMetric = {
        monitorName: 'gpu',
        metricName: 'temperature',
        metricValue: 87,
        unit: 'celsius',
      };

      const result = await thresholdEngine.evaluate(metric, 'machine-1');

      expect(result.exceeded).toBe(true);
      expect(result.severity).toBe('critical');
      expect(result.thresholdValue).toBe(85);
    });

    it('should return emergency when GPU temp exceeds 95', async () => {
      const metric: HardwareMetric = {
        monitorName: 'gpu',
        metricName: 'temperature',
        metricValue: 97,
        unit: 'celsius',
      };

      const result = await thresholdEngine.evaluate(metric, 'machine-1');

      expect(result.exceeded).toBe(true);
      expect(result.severity).toBe('emergency');
      expect(result.thresholdValue).toBe(95);
    });
  });

  describe('Emergency → Kill Switch trigger', () => {
    it('should call the kill switch bridge on emergency', async () => {
      const metric: HardwareMetric = {
        monitorName: 'gpu',
        metricName: 'temperature',
        metricValue: 98,
        unit: 'celsius',
      };

      await thresholdEngine.evaluate(metric, 'machine-critical');

      expect(mockBridge.triggeredPayloads.length).toBe(1);
      expect(mockBridge.triggeredPayloads[0].targetState).toBe('STOPPING');
      expect(mockBridge.triggeredPayloads[0].triggerUserId).toBe('telemetry');
      expect(mockBridge.triggeredPayloads[0].reason).toContain('98');
    });

    it('should NOT trigger kill switch for critical-only severity', async () => {
      const metric: HardwareMetric = {
        monitorName: 'gpu',
        metricName: 'temperature',
        metricValue: 88,
        unit: 'celsius',
      };

      await thresholdEngine.evaluate(metric, 'machine-1');

      expect(mockBridge.triggeredPayloads.length).toBe(0);
    });
  });

  describe('CPU temperature', () => {
    it('should return critical when CPU temp exceeds 80°C', async () => {
      const metric: HardwareMetric = {
        monitorName: 'cpu',
        metricName: 'temperature',
        metricValue: 82,
        unit: 'celsius',
      };

      const result = await thresholdEngine.evaluate(metric, 'machine-1');

      expect(result.exceeded).toBe(true);
      expect(result.severity).toBe('critical');
      expect(result.thresholdValue).toBe(80);
    });
  });

  describe('Memory usage', () => {
    it('should return critical when memory exceeds 90%', async () => {
      const metric: HardwareMetric = {
        monitorName: 'memory',
        metricName: 'usage_percent',
        metricValue: 93,
        unit: 'percent',
      };

      const result = await thresholdEngine.evaluate(metric, 'machine-1');

      expect(result.exceeded).toBe(true);
      expect(result.severity).toBe('critical');
      expect(result.thresholdValue).toBe(90);
    });

    it('should not alert for normal memory usage', async () => {
      const metric: HardwareMetric = {
        monitorName: 'memory',
        metricName: 'usage_percent',
        metricValue: 65,
        unit: 'percent',
      };

      const result = await thresholdEngine.evaluate(metric, 'machine-1');

      expect(result.exceeded).toBe(false);
    });
  });

  describe('Disk usage', () => {
    it('should return critical when disk exceeds 95%', async () => {
      const metric: HardwareMetric = {
        monitorName: 'disk',
        metricName: 'usage_percent',
        metricValue: 97,
        unit: 'percent',
        labels: { mount_point: '/data' },
      };

      const result = await thresholdEngine.evaluate(metric, 'machine-1');

      expect(result.exceeded).toBe(true);
      expect(result.severity).toBe('critical');
      expect(result.thresholdValue).toBe(95);
    });
  });

  describe('unmonitored metrics', () => {
    it('should not alert for metrics without thresholds', async () => {
      const metric: HardwareMetric = {
        monitorName: 'network',
        metricName: 'rx_bytes',
        metricValue: 999999999,
        unit: 'bytes',
      };

      const result = await thresholdEngine.evaluate(metric, 'machine-1');

      expect(result.exceeded).toBe(false);
      expect(result.severity).toBeNull();
    });
  });

  describe('getThresholdRules', () => {
    it('should return all configured rules', () => {
      const rules = thresholdEngine.getThresholdRules();

      expect(rules.length).toBeGreaterThan(0);

      const gpuRules = rules.filter(
        (rule: { monitorName: string }) => rule.monitorName === 'gpu',
      );
      expect(gpuRules.length).toBe(2);

      const cpuRules = rules.filter(
        (rule: { monitorName: string }) => rule.monitorName === 'cpu',
      );
      expect(cpuRules.length).toBe(1);

      const memoryRules = rules.filter(
        (rule: { monitorName: string }) => rule.monitorName === 'memory',
      );
      expect(memoryRules.length).toBe(1);

      const diskRules = rules.filter(
        (rule: { monitorName: string }) => rule.monitorName === 'disk',
      );
      expect(diskRules.length).toBe(1);
    });
  });
});
