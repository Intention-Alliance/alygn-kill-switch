/**
 * AlertChannel — Interface for multi-channel alert dispatch
 *
 * Each channel is independently usable and must not block other channels
 * on failure. All operations are async.
 */

export interface AlertPayload {
  severity: 'info' | 'warning' | 'critical';
  service: string;
  message: string;
  details?: Record<string, unknown>;
  timestamp: number;
}

export interface ChannelResult {
  sent: boolean;
  channel: string;
  error?: string;
}

export interface AlertChannel {
  readonly name: string;
  send(alert: AlertPayload): Promise<ChannelResult>;
}