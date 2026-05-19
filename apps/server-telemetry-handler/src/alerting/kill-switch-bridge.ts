/**
 * Kill Switch Bridge
 *
 * Abstraction layer between the telemetry threshold engine and the Kill Switch service.
 * Prevents telemetry from directly depending on Kill Switch internals.
 *
 * On emergency threshold breach:
 *  1. Logs the trigger event
 *  2. Calls the kill switch callback to transition state
 *  3. Publishes an alert via Redis pubsub (for WebSocket broadcast)
 *
 * Constructor Injection: receives Kill Switch transition callback and Redis pool.
 */

import type { KillSwitchTriggerPayload } from '../types';

/**
 * Callback signature for the kill switch state transition.
 * Called when a telemetry emergency requires system-wide state change.
 */
export type KillSwitchTransitionCallback = (
  newState: string,
  metadata: {
    reason: string;
    userId: string;
    metadata?: Record<string, unknown>;
  },
) => Promise<unknown>;

/**
 * Callback signature for Redis publish (optional, for WebSocket broadcast).
 */
export type RedisPublishCallback = (
  channel: string,
  message: string,
) => Promise<void>;

/**
 * KillSwitchBridge — mediates between telemetry alerts and the Kill Switch.
 *
 * Decouples the telemetry handler from KillSwitchService internals.
 * Receives only callbacks, not the full service.
 */
export class KillSwitchBridge {
  constructor(
    private readonly killSwitchTransition: KillSwitchTransitionCallback,
    private readonly redisPublish: RedisPublishCallback | null,
    private readonly isEnabled: boolean = true,
  ) {}

  /**
   * Trigger an emergency stop via the Kill Switch.
   *
   * @param payload — details of the emergency event
   */
  public async triggerEmergencyStop(payload: KillSwitchTriggerPayload): Promise<void> {
    if (!this.isEnabled) {
      console.warn(
        '[kill-switch-bridge] Emergency stop trigger disabled — event ignored:',
        payload.reason,
      );
      return;
    }

    console.error(
      `[kill-switch-bridge] EMERGENCY: Triggering Kill Switch stop — ${payload.reason}`,
    );

    // Call the kill switch transition
    await this.killSwitchTransition('STOPPING', {
      reason: payload.reason,
      userId: payload.triggerUserId,
      metadata: {
        source: 'telemetry',
        machineId: payload.machineId,
        monitorName: payload.monitorName,
        metricName: payload.metricName,
        actualValue: payload.actualValue,
        thresholdValue: payload.thresholdValue,
      },
    });

    // Publish alert via Redis pubsub for WebSocket broadcast
    if (this.redisPublish) {
      try {
        await this.redisPublish(
          'bcp:telemetry:emergency',
          JSON.stringify({
            type: 'telemetry-emergency',
            timestamp: new Date().toISOString(),
            payload,
          }),
        );
      } catch (error: unknown) {
        console.error(
          '[kill-switch-bridge] Redis publish failed:',
          (error as Error).message,
        );
      }
    }

    console.log('[kill-switch-bridge] Emergency stop triggered successfully');
  }
}
