/**
 * Telemetry Handler — Configuration
 *
 * Loads configuration from environment variables with sensible defaults.
 * All values can be overridden via env vars for Docker/k8s deployments.
 */

export interface TelemetryConfig {
  collectionIntervalSeconds: number;
  criticalCollectionIntervalSeconds: number;
  batchFlushIntervalSeconds: number;
  batchMaxSize: number;
  thresholds: {
    gpu: {
      tempCriticalCelsius: number;
      tempEmergencyCelsius: number;
    };
    cpu: {
      tempCriticalCelsius: number;
    };
    memory: {
      usageCriticalPercent: number;
    };
    disk: {
      usageCriticalPercent: number;
    };
  };
  enableKillSwitchTrigger: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  port: number;
  dataDir: string;
  redisUrls: string[];
}

/**
 * Parse the telemetry configuration from environment variables.
 * All values have safe defaults suitable for development.
 */
export function loadTelemetryConfig(env: typeof process.env = process.env): TelemetryConfig {
  const redisUrlsRaw = env.REDIS_URLS || env.REDIS_URL || 'redis://localhost:6379';
  const redisUrls = redisUrlsRaw.split(',').map((url) => url.trim()).filter(Boolean);

  return {
    collectionIntervalSeconds: parseInt(
      env.TELEMETRY_COLLECTION_INTERVAL_SECONDS || '30',
      10,
    ),
    criticalCollectionIntervalSeconds: parseInt(
      env.TELEMETRY_CRITICAL_INTERVAL_SECONDS || '5',
      10,
    ),
    batchFlushIntervalSeconds: parseInt(
      env.TELEMETRY_BATCH_FLUSH_INTERVAL_SECONDS || '10',
      10,
    ),
    batchMaxSize: parseInt(
      env.TELEMETRY_BATCH_MAX_SIZE || '100',
      10,
    ),
    thresholds: {
      gpu: {
        tempCriticalCelsius: parseFloat(
          env.GPU_TEMP_CRITICAL_CELSIUS || '85',
        ),
        tempEmergencyCelsius: parseFloat(
          env.GPU_TEMP_EMERGENCY_CELSIUS || '95',
        ),
      },
      cpu: {
        tempCriticalCelsius: parseFloat(
          env.CPU_TEMP_CRITICAL_CELSIUS || '80',
        ),
      },
      memory: {
        usageCriticalPercent: parseFloat(
          env.MEMORY_USAGE_CRITICAL_PERCENT || '90',
        ),
      },
      disk: {
        usageCriticalPercent: parseFloat(
          env.DISK_USAGE_CRITICAL_PERCENT || '95',
        ),
      },
    },
    enableKillSwitchTrigger: env.TELEMETRY_ENABLE_KILL_SWITCH_TRIGGER !== 'false',
    logLevel: (env.TELEMETRY_LOG_LEVEL || 'info') as TelemetryConfig['logLevel'],
    port: parseInt(env.TELEMETRY_PORT || '3002', 10),
    dataDir: env.DATA_DIR || './data',
    redisUrls,
  };
}
