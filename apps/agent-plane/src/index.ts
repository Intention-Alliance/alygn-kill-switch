/**
 * Agent Plane entry point — starts the heartbeat loop, the enforcement
 * consumer, and the Ollama interceptor. Reads configuration from
 * environment variables (see .env.example).
 */

import { HeartbeatClient } from './heartbeat'
import { collectFingerprint } from './integrity'
import { OllamaInterceptor } from './interceptor'
import { EnforcementConsumer } from './enforcement'
import { AgentStateStore } from './state'

const MOTHER_URL = process.env.ALYGN_MOTHER_URL ?? 'http://localhost:3000'
const API_KEY = process.env.ALYGN_AGENT_API_KEY ?? ''
const MACHINE_ID = process.env.ALYGN_MACHINE_ID ?? 'machine-local-001'
const MACHINE_NAME = process.env.ALYGN_MACHINE_NAME ?? 'local-machine'
const HOSTNAME = process.env.ALYGN_MACHINE_HOSTNAME ?? 'localhost'
const HEARTBEAT_MS = parseInt(process.env.ALYGN_HEARTBEAT_INTERVAL_MS ?? '30000')
const OLLAMA_URL = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434'
const INTERCEPT_PORT = parseInt(process.env.OLLAMA_INTERCEPT_PORT ?? '11435')
const ENFORCE_POLL_MS = parseInt(process.env.ALYGN_ENFORCE_POLL_INTERVAL_MS ?? '5000')
const STATE_DB_PATH = process.env.ALYGN_STATE_DB ?? './data/agent-state.sqlite'
const LOG_LEVEL = process.env.LOG_LEVEL ?? 'info'

function log(level: string, msg: string) {
  const levels = ['debug', 'info', 'warn', 'error']
  if (levels.indexOf(level) >= levels.indexOf(LOG_LEVEL)) {
    console.log(`[${new Date().toISOString()}] [agent-plane] [${level}] ${msg}`)
  }
}

async function main() {
  if (!API_KEY) {
    console.error('[agent-plane] ALYGN_AGENT_API_KEY is required. See .env.example')
    process.exit(1)
  }

  log('info', `Starting agent plane — machine: ${MACHINE_ID} (${MACHINE_NAME})`)
  log('info', `Mother machine: ${MOTHER_URL}`)

  // Local state (SQLite WAL) — survives restarts
  const state = new AgentStateStore(STATE_DB_PATH)
  const previousState = state.getKillSwitchState()
  if (previousState) {
    log('info', `Previous kill-switch state from local store: ${previousState}`)
  }

  // Collect initial fingerprint
  const fingerprint = await collectFingerprint()
  state.setFingerprint(fingerprint)
  log('info', `Hardware fingerprint: ${fingerprint.cpuModel} · ${fingerprint.cpuCores} cores · ${fingerprint.memoryMb}MB · ${fingerprint.osRelease} · ${fingerprint.macs.length} MACs`)

  // Enforcement consumer — polls the mother's kill-switch status
  const enforcement = new EnforcementConsumer({
    motherUrl: MOTHER_URL,
    apiKey: API_KEY,
    pollIntervalMs: ENFORCE_POLL_MS,
  })
  const stopEnforcement = enforcement.start((newState, previous) => {
    log('warn', `Kill-switch state changed: ${previous ?? 'unknown'} → ${newState}`)
    state.setKillSwitchState(newState)
  })
  log('info', `Enforcement consumer polling ${MOTHER_URL}/v1/kill-switch/status every ${ENFORCE_POLL_MS}ms (fail-closed until first poll)`)

  // Start heartbeat loop
  const client = new HeartbeatClient({
    motherUrl: MOTHER_URL,
    apiKey: API_KEY,
    machineId: MACHINE_ID,
    hostname: HOSTNAME,
    intervalMs: HEARTBEAT_MS,
  })

  const stopHeartbeat = client.startLoop(
    (response) => {
      state.setLastHeartbeat(response)
      log('info', `Heartbeat acknowledged: state=${response.state} drift=${response.drift ? 'DETECTED' : 'none'} registered=${response.agentRegistered}`)
    },
    (err) => {
      log('warn', `Heartbeat failed: ${err.message}`)
    },
  )

  // Start Ollama interceptor (listens on the intercept port, forwards to real Ollama)
  try {
    const interceptor = new OllamaInterceptor({
      ollamaUrl: OLLAMA_URL,
      listenPort: INTERCEPT_PORT,
      scoreThreshold: 0.7,
      isPaused: () => enforcement.isPaused(),
    })
    await interceptor.start((req, result) => {
      log('info', `Intercepted: ${req.method} ${req.path} → score=${result.score.toFixed(2)} action=${result.action}`)
    })
    log('info', `Ollama interceptor listening on :${INTERCEPT_PORT} → forwarding to ${OLLAMA_URL}`)
  } catch (err) {
    log('warn', `Ollama interceptor failed to start: ${err instanceof Error ? err.message : err}`)
    log('warn', 'Heartbeat will continue without interception')
  }

  // Graceful shutdown
  process.on('SIGINT', () => {
    log('info', 'Shutting down agent plane')
    stopHeartbeat()
    stopEnforcement()
    state.close()
    process.exit(0)
  })

  log('info', 'Agent plane running. Press Ctrl+C to stop.')
}

main()
