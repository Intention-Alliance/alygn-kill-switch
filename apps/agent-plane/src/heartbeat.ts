/**
 * Agent heartbeat — registers this machine with the mother machine
 * and maintains liveness via a 30-second loop with exponential backoff.
 *
 * Endpoint: POST /v1/discovery/heartbeat (verified live on andlersrv)
 * Auth: x-api-key header matching the mother's KILL_SWITCH_API_KEY
 */

export interface HeartbeatPayload {
  machineId: string
  hostname: string
  agentId: string
  agentName: string
  agentVersion: string
  capabilities: string[]
  fingerprint?: Record<string, unknown>
}

export interface HeartbeatResponse {
  acknowledged: boolean
  machineId: string
  signature?: { algorithm: string; hash: string; signedAt: string }
  drift?: unknown
  state?: string
  agentRegistered?: boolean
}

export interface HeartbeatClientConfig {
  motherUrl: string
  apiKey: string
  machineId: string
  hostname?: string
  intervalMs?: number
  /** Initial retry delay in ms (doubles per failure, capped at maxRetryDelayMs). Default 1_000. */
  initialRetryDelayMs?: number
  /** Cap for exponential backoff in ms. Default 60_000. */
  maxRetryDelayMs?: number
}

export class HeartbeatClient {
  private readonly motherUrl: string
  private readonly apiKey: string
  private readonly machineId: string
  private readonly hostname: string
  private readonly agentId: string
  private readonly intervalMs: number
  private readonly initialRetryDelayMs: number
  private readonly maxRetryDelayMs: number

  constructor(config: HeartbeatClientConfig) {
    this.motherUrl = config.motherUrl.replace(/\/$/, '')
    this.apiKey = config.apiKey
    this.machineId = config.machineId
    this.hostname = config.hostname ?? 'localhost'
    this.agentId = `agent-${config.machineId}`
    this.intervalMs = config.intervalMs ?? 30_000
    this.initialRetryDelayMs = config.initialRetryDelayMs ?? 1_000
    this.maxRetryDelayMs = config.maxRetryDelayMs ?? 60_000
  }

  async send(fingerprint?: Record<string, unknown>): Promise<HeartbeatResponse> {
    const payload: HeartbeatPayload = {
      machineId: this.machineId,
      hostname: this.hostname,
      agentId: this.agentId,
      agentName: 'alygn-agent',
      agentVersion: '0.1.0',
      capabilities: ['intercept', 'score', 'enforce', 'integrity'],
      fingerprint,
    }

    const res = await fetch(`${this.motherUrl}/v1/discovery/heartbeat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    })

    if (!res.ok) {
      throw new Error(`Heartbeat failed: ${res.status} ${await res.text()}`)
    }
    return await res.json() as HeartbeatResponse
  }

  /**
   * Start the liveness loop. On failure, retries with exponential backoff
   * (initialRetryDelayMs doubling up to maxRetryDelayMs) instead of
   * sleeping the full interval — so a transient mother outage recovers
   * quickly and a sustained one doesn't hammer the network.
   */
  startLoop(onHeartbeat?: (response: HeartbeatResponse) => void, onError?: (err: Error) => void): () => void {
    let running = true
    let retryDelay = this.initialRetryDelayMs

    const loop = async () => {
      while (running) {
        try {
          const response = await this.send()
          retryDelay = this.initialRetryDelayMs // success resets backoff
          onHeartbeat?.(response)
          await Bun.sleep(this.intervalMs)
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err))
          onError?.(error)
          await Bun.sleep(retryDelay)
          retryDelay = Math.min(retryDelay * 2, this.maxRetryDelayMs)
        }
      }
    }

    loop()
    return () => { running = false }
  }
}
