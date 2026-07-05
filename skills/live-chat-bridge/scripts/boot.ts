/**
 * live-chat-bridge — boot.ts
 *
 * Registers the live-chat.message handler in openclaw-webhook's
 * handler registry. Called via dynamic import in
 * openclaw-webhook/scripts/boot.ts.
 *
 * To enable: add the following line to openclaw-webhook/scripts/boot.ts:
 *   await import('../../live-chat-bridge/scripts/boot.ts')
 */

import { registerHandler } from '../../openclaw-webhook/scripts/server.ts'
import { handleLiveChatMessage } from './handler.ts'

registerHandler('live-chat.message', handleLiveChatMessage)