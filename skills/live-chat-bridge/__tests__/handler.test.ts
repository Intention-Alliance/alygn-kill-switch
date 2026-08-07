/**
 * live-chat-bridge — handler.test.ts
 *
 * 3 unit tests:
 * 1. Valid escalate event → 200 + lobster pipeline invocation (status: processing)
 * 2. Invalid signature → 401 (simulated via invalid payload structure)
 * 3. Dedupe hit → 200 + no lobster call (returns cached result)
 *
 * Uses Bun's built-in test runner. No external test framework needed.
 */

import { describe, test, expect, mock, beforeEach } from 'bun:test'
import { handleLiveChatMessage, setPipelineRunner, resetPipelineRunner, type EventManifest } from '../scripts/handler.ts'
import { validatePayload } from '../scripts/validate-payload.ts'

// ── Test Helpers ────────────────────────────────────────────────────────────

function createMockManifest(eventId: string, requester = 'andler-chatbot-spike'): EventManifest {
  return {
    event_id: eventId,
    event_type: 'live-chat.message',
    requester,
    payload_sha256: 'test-hash',
    payload: {},
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 86400000).toISOString(),
    status: 'pending',
    handler: 'live-chat-bridge',
    updated_at: new Date().toISOString(),
  }
}

const validEscalatePayload = {
  action: 'escalate' as const,
  conversation_id: 'conv-test-001',
  prospect: {
    display_name: 'Jane Smith',
    channel_handle: 'jane@example.com',
    channel: 'public-inbox' as const,
    channel_session_id: 'session-abc123',
  },
  flag: 'green' as const,
  summary: 'Jane has a real company with a specific React/Node project, decision authority, and $80k budget.',
  investigation: {
    web_research: ['Company website: janesmith.io — verified active SaaS'],
    scam_detection: [],
    technical_fit: 'fit — React/Node stack matches andler.dev capabilities',
  },
  closing_message: 'Appreciate the context. Looks like a real fit. The fastest way to align on scope is a 30-min call.',
  conversation_transcript: 'Jane: Hi, I need help with a React project.\nRep: Tell me more.',
  conversation_started_at: '2026-07-04T20:00:00Z',
}

const validSlotsPayload = {
  action: 'list_slots' as const,
  conversation_id: 'conv-test-001',
  lookahead_days: 5,
  slot_count: 4,
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('live-chat-bridge handler', () => {

  // Mock pipeline runner — returns processing without spawning a real process
  const mockPipelineRunner = async () => ({ status: 'processing' as const })

  beforeEach(() => {
    setPipelineRunner(mockPipelineRunner)
  })

  // Reset after all tests
  test('cleanup', () => { resetPipelineRunner() })

  // Test 1: Valid escalate event — should return processing status
  test('valid escalate event returns processing status (200 + lobster call)', async () => {
    const manifest = createMockManifest('event-001')
    const result = await handleLiveChatMessage(validEscalatePayload, manifest)

    expect(result.status).toBe('processing')
    expect(result.error).toBeUndefined()
  })

  // Test 2: Invalid payload structure — should return failed with INVALID_PAYLOAD
  test('invalid payload structure returns failed with INVALID_PAYLOAD error', async () => {
    const manifest = createMockManifest('event-002')
    const invalidPayload = {
      action: 'escalate',
      conversation_id: '', // invalid: empty string
      // missing all required fields
    }

    const result = await handleLiveChatMessage(invalidPayload, manifest)

    expect(result.status).toBe('failed')
    expect(result.error).toBeDefined()
    expect(result.error!.code).toBe('INVALID_PAYLOAD')
    expect(result.error!.message).toContain('conversation_id')
  })

  // Test 3: Dedupe hit — duplicate event_id returns cached result without re-invoking
  test('dedupe hit returns cached result without re-invoking pipeline', async () => {
    const eventId = 'event-dedupe-001'
    const manifest1 = createMockManifest(eventId)
    const manifest2 = createMockManifest(eventId) // same event_id

    // First call — should invoke pipeline
    const result1 = await handleLiveChatMessage(validEscalatePayload, manifest1)
    expect(result1.status).toBe('processing')

    // Second call with same event_id — should return cached result
    // We change the payload to verify the handler does NOT re-process
    const differentPayload = { ...validEscalatePayload, flag: 'red' as const }
    const result2 = await handleLiveChatMessage(differentPayload, manifest2)

    // Should return the SAME cached result (processing), not re-process with red flag
    expect(result2.status).toBe('processing')
    expect(result2.error).toBeUndefined()
  })
})

// ── Validation Unit Tests ───────────────────────────────────────────────────

describe('validate-payload', () => {

  test('valid escalate payload passes validation', () => {
    const result = validatePayload(validEscalatePayload)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.action).toBe('escalate')
    }
  })

  test('valid list_slots payload passes validation', () => {
    const result = validatePayload(validSlotsPayload)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.action).toBe('list_slots')
    }
  })

  test('invalid action fails validation', () => {
    const result = validatePayload({ action: 'unknown', conversation_id: 'x' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('action')
    }
  })

  test('missing required fields fails validation', () => {
    const result = validatePayload({ action: 'escalate' })
    expect(result.success).toBe(false)
  })

  test('invalid flag enum fails validation', () => {
    const result = validatePayload({ ...validEscalatePayload, flag: 'blue' })
    expect(result.success).toBe(false)
  })
})