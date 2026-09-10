/**
 * Flag Client — polls the mother's per-machine merged flag view and
 * exposes typed flag values to the interceptor.
 *
 * Endpoint: GET /v1/machines/:machineId/flags (verified live on andlersrv :3000)
 * Auth: x-api-key header matching the mother's KILL_SWITCH_API_KEY
 *
 * The merged view returns typed values (boolean | number | string) per
 * flag, with machine overrides already resolved. Polled on an interval;
 * on error the last known values are kept — the interceptor falls back
 * to its fixed defaults when a flag is missing.
 */

export interface FlagSnapshot {
  key: string
  value: boolean | number | string | null
  type: string
  overridden: boolean
}

export class FlagClient {
  private readonly motherUrl: string
  private readonly apiKey: string
  private readonly machineId: string
  private readonly pollIntervalMs: number
  private flags = new Map<string, boolean | number | string>()
  private timer: ReturnType<typeof setInterval> | null = null
  private lastError: Error | null = null

  constructor(config: {
    motherUrl: string
    apiKey: string
    machineId: string
    pollIntervalMs?: number
  }) {
    this.motherUrl = config.motherUrl.replace(/\/$/, '')
    this.apiKey = config.apiKey
    this.machineId = config.machineId
    this.pollIntervalMs = config.pollIntervalMs ?? 10_000
  }

  async pollOnce(): Promise<Map<string, boolean | number | string>> {
    const res = await fetch(
      `${this.motherUrl}/v1/machines/${encodeURIComponent(this.machineId)}/flags`,
      { headers: { 'x-api-key': this.apiKey } },
    )
    if (!res.ok) {
      throw new Error(`flags fetch failed: ${res.status} ${res.statusText}`)
    }
    const data = (await res.json()) as { flags?: FlagSnapshot[] }
    const next = new Map<string, boolean | number | string>()
    for (const f of data.flags ?? []) {
      if (f.value !== null && f.value !== undefined) next.set(f.key, f.value)
    }
    this.flags = next
    this.lastError = null
    return next
  }

  getFlag(key: string): boolean | number | string | null {
    return this.flags.get(key) ?? null
  }

  getLastError(): Error | null {
    return this.lastError
  }

  /** Starts the polling loop; returns a stop function. */
  start(
    onChange?: (flags: Map<string, boolean | number | string>) => void,
    onError?: (err: Error) => void,
  ): () => void {
    const poll = () => {
      this.pollOnce()
        .then((map) => onChange?.(map))
        .catch((err) => {
          this.lastError = err
          onError?.(err)
        })
    }
    poll()
    this.timer = setInterval(poll, this.pollIntervalMs)
    return () => {
      if (this.timer) {
        clearInterval(this.timer)
        this.timer = null
      }
    }
  }
}
