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

// Future handlers:
// await import('../../some-other-skill/scripts/handler.ts')