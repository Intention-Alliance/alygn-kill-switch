/**
 * meet-notes-bridge — boot.ts
 *
 * Registers the meet-notes.request handler in openclaw-webhook's
 * handler registry. Called via dynamic import in
 * openclaw-webhook/scripts/boot.ts.
 *
 * To enable: add the following line to openclaw-webhook/scripts/boot.ts:
 *   await import('../../meet-notes-bridge/scripts/boot.ts')
 */

import { registerHandler } from '../../openclaw-webhook/scripts/server.ts'
import { handleMeetNotesRequest } from './handler.ts'

registerHandler('meet-notes.request', handleMeetNotesRequest)
