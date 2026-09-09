/**
 * Agent heartbeat — registers this machine with the mother machine
 * and maintains liveness via a 30-second loop.
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

export class HeartbeatClient {
  private motherUrl: string
  private apiKey: string
  private machineId: string
  private hostname: string
  private agentId: string
  private intervalMs: number

  constructor(config: {
    motherUrl: string
    apiKey: string
    machineId: string
    hostname?: string
    intervalMs?: number
  }) {
    this.motherUrl = config.motherUrl.replace(/\/$/, '')
    this.apiKey = config.apiKey
    this.machineId = config.machineId
    this.hostname = config.hostname ?? 'localhost'
    this.agentId = `agent-${config.machineId}`
    this.intervalMs = config.intervalMs ?? 30_000
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

  startLoop(onHeartbeat?: (response: HeartbeatResponse) => void, onError?: (err: Error) => void): () => void {
    let running = true

    const loop = async () => {
      while (running) {
        try {
          const response = await this.send()
          onHeartbeat?.(response)
        } catch (err) {
          onError?.(err instanceof Error ? err : new Error(String(err)))
        }
        await Bun.sleep(this.intervalMs)
      }
    }

    loop()
    return () => { running = false }
  }
}