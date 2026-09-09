/**
 * Enforcement Consumer — polls the mother's kill-switch status and
 * exposes the current enforcement state to the interceptor.
 *
 * The `enforce` capability is the local half of the kill-switch loop:
 * the mother decides (WebAuthn-authorized kill actions), the agent
 * enforces locally by pausing inference traffic when the mother reports
 * STOPPED/LOCKED. The interceptor consults `isPaused()` on every request.
 *
 * Endpoint: GET /v1/kill-switch/status (verified live on andlersrv :3000)
 * Auth: x-api-key header matching the mother's KILL_SWITCH_API_KEY
 */

export interface KillSwitchStatus {
  state: string
  lastActivation?: string | null
  lastActivationBy?: string | null
  activeExperiments?: number
  activatedAt?: string | null
  reason?: string | null
  recentTransitions?: unknown[]
  pausedRequestCount?: number
}

export const PAUSED_STATES = new Set(['STOPPED', 'STOPPING', 'LOCKED'])

export class EnforcementConsumer {
  private readonly motherUrl: string
  private readonly apiKey: string
  private readonly pollIntervalMs: number
  private currentState: string | null = null
  private lastStatus: KillSwitchStatus | null = null
  private lastError: Error | null = null
  private running = false

  constructor(config: {
    motherUrl: string
    apiKey: string
    pollIntervalMs?: number
  }) {
    this.motherUrl = config.motherUrl.replace(/\/$/, '')
    this.apiKey = config.apiKey
    this.pollIntervalMs = config.pollIntervalMs ?? 5_000
  }

  /** True when the mother reports a paused state (or we don't know yet — fail closed). */
  isPaused(): boolean {
    if (this.currentState === null) return true // unknown → fail closed
    return PAUSED_STATES.has(this.currentState)
  }

  getState(): string | null {
    return this.currentState
  }

  getLastStatus(): KillSwitchStatus | null {
    return this.lastStatus
  }

  getLastError(): Error | null {
    return this.lastError
  }

  async pollOnce(): Promise<KillSwitchStatus> {
    try {
      const res = await fetch(`${this.motherUrl}/v1/kill-switch/status`, {
        method: 'GET',
        headers: { 'x-api-key': this.apiKey },
        signal: AbortSignal.timeout(10_000),
      })
      if (!res.ok) {
        throw new Error(`Enforcement status failed: ${res.status} ${await res.text()}`)
      }
      const status = await res.json() as KillSwitchStatus
      this.currentState = status.state ?? null
      this.lastStatus = status
      this.lastError = null
      return status
    } catch (err) {
      this.lastError = err instanceof Error ? err : new Error(String(err))
      throw err
    }
  }

  start(onChange?: (state: string, previous: string | null) => void): () => void {
    this.running = true
    const loop = async () => {
      while (this.running) {
        try {
          const previous = this.currentState
          const status = await this.pollOnce()
          if (previous !== this.currentState) {
            onChange?.(this.currentState ?? 'UNKNOWN', previous)
          }
          void status
        } catch (err) {
          this.lastError = err instanceof Error ? err : new Error(String(err))
          // Keep the last known state; isPaused() stays fail-closed on unknown.
        }
        await Bun.sleep(this.pollIntervalMs)
      }
    }
    loop()
    return () => { this.running = false }
  }
}
