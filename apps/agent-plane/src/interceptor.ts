/**
 * Ollama interception adapter — intercepts LLM requests to the local
 * Ollama instance, scores them, and forwards or blocks per threshold.
 *
 * The agent acts as a reverse proxy: Ollama listens on a different port
 * (default 11435) and the agent listens on the original port (11434).
 */

export interface InterceptedRequest {
  method: string
  path: string
  body: unknown
  headers: Record<string, string>
  timestamp: string
}

export interface ScoringResult {
  score: number
  action: 'forward' | 'block' | 'escalate'
  reasons: string[]
}

export class OllamaInterceptor {
  private ollamaUrl: string
  private listenPort: number
  private scoreThreshold: number

  constructor(config: { ollamaUrl?: string; listenPort?: number; scoreThreshold?: number }) {
    self.ollamaUrl = config.ollamaUrl ?? 'http://localhost:11435'
    this.listenPort = config.listenPort ?? 11434
    this.scoreThreshold = config.scoreThreshold ?? 0.7
  }

  async start(onRequest?: (req: InterceptedRequest, result: ScoringResult) => void): Promise<void> {
    const self = this
    Bun.serve({
      port: this.listenPort,
      async fetch(req) {
        const url = new URL(req.url)
        const body = req.method === 'POST' ? await req.json().catch(() => null) : null

        const intercepted: InterceptedRequest = {
          method: req.method,
          path: url.pathname,
          body,
          headers: Object.fromEntries(req.headers.entries()),
          timestamp: new Date().toISOString(),
        }

        // Score the request (basic keyword + pattern scoring for now)
        const scoring = scoreRequest(intercepted)

        onRequest?.(intercepted, scoring)

        if (scoring.action === 'forward') {
          // Forward to the real Ollama
          const upstream = await fetch(`${self.ollamaUrl}${url.pathname}`, {
            method: req.method,
            headers: { 'Content-Type': 'application/json' },
            body: body ? JSON.stringify(body) : undefined,
          })
          return new Response(upstream.body, {
            status: upstream.status,
            headers: upstream.headers,
          })
        }

        // Block
        return Response.json(
          { error: 'Blocked by Alygn Kill Switch', score: scoring.score, reasons: scoring.reasons },
          { status: 403 },
        )
      }
    })
  }
}

function scoreRequest(req: InterceptedRequest): ScoringResult {
  let score = 0
  const reasons: string[] = []
  const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt : ''
  const model = typeof req.body?.model === 'string' ? req.body.model : ''

  // Keyword scoring (basic — the full semantic engine is Phase 2.5)
  const harmfulPatterns = [
    /delete all|drop table|rm -rf/i,
    /credential|password|secret.*key/i,
    /bypass|escalate.*privilege|exploit/i,
  ]
  for (const pattern of harmfulPatterns) {
    if (pattern.test(prompt)) {
      score += 0.4
      reasons.push(`harmful pattern: ${pattern.source}`)
    }
  }

  // Model allowlist check (empty model = suspicious)
  if (!model) {
    score += 0.2
    reasons.push('no model specified')
  }

  const action = score >= 0.7 ? 'block' : score >= 0.4 ? 'escalate' : 'forward'
  return { score, action, reasons }
}