/**
 * openclaw-webhook — boot.ts
 *
 * Entry point that starts the webhook server AND loads handler modules
 * so they register themselves via registerHandler() at module-load time.
 *
 * OpenClaw cron should start this file, NOT server.ts directly:
 *   bun run ~/.openclaw/workspace/skills/openclaw-webhook/scripts/boot.ts
 *
 * To add a new handler, add its dynamic import below. Each handler
 * module is responsible for calling registerHandler() on import.
 */

// Start the server (importing server.ts starts Bun.serve at module load)
import './server.ts'

// Register handler modules — each calls registerHandler() on import
await import('../../andler-blog-pipeline/scripts/handler.ts')

await import('../../openclaw-api-handler/scripts/handler.ts')

// Phase 4 — Webhooks plugin (card 43046320, 2026-08-06, Rokthar)
// live-chat: andler-landing site chat widget → Wobblus task flow
await import('../../live-chat-bridge/scripts/boot.ts')
// meet-notes: Google Meet → Wobblus bridge (Phase 4 stub; Phase 5 fills it in)
await import('../../meet-notes-bridge/scripts/boot.ts')