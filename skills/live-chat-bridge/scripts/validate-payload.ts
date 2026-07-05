/**
 * live-chat-bridge — validate-payload.ts
 *
 * Zod schemas for inbound live-chat.message payloads.
 * Discriminated union on the `action` field: "escalate" | "list_slots".
 *
 * Usage:
 *   import { validatePayload, EscalateSchema, SlotsSchema } from './validate-payload'
 *   const result = validatePayload(payload)
 *   if (result.success) { result.data.action === "escalate" | "list_slots" }
 */

import { z } from 'zod'

// ── Escalate Payload Schema ────────────────────────────────────────────────

export const EscalateSchema = z.object({
  action: z.literal('escalate'),
  conversation_id: z.string().min(1),
  prospect: z.object({
    display_name: z.string().min(1),
    channel_handle: z.string().min(1),
    channel: z.enum(['telegram-widget', 'discord-dm', 'public-inbox']),
    channel_session_id: z.string().min(1),
  }),
  flag: z.enum(['green', 'yellow', 'red']),
  summary: z.string().min(1),
  investigation: z.object({
    web_research: z.array(z.string()),
    scam_detection: z.array(z.string()),
    technical_fit: z.string().min(1),
  }),
  closing_message: z.string().min(1),
  conversation_transcript: z.string().min(1),
  conversation_started_at: z.string().min(1),
})

export type EscalatePayload = z.infer<typeof EscalateSchema>

// ── Slots Payload Schema ───────────────────────────────────────────────────

export const SlotsSchema = z.object({
  action: z.literal('list_slots'),
  conversation_id: z.string().min(1),
  lookahead_days: z.number().int().min(1).max(30).default(5),
  slot_count: z.number().int().min(1).max(10).default(4),
})

export type SlotsPayload = z.infer<typeof SlotsSchema>

// ── Discriminated Union ────────────────────────────────────────────────────

export const LiveChatPayloadSchema = z.discriminatedUnion('action', [
  EscalateSchema,
  SlotsSchema,
])

export type LiveChatPayload = z.infer<typeof LiveChatPayloadSchema>

// ── Validation Function ─────────────────────────────────────────────────────

export type ValidationResult =
  | { success: true; data: LiveChatPayload }
  | { success: false; error: string }

export function validatePayload(payload: unknown): ValidationResult {
  const result = LiveChatPayloadSchema.safeParse(payload)
  if (result.success) {
    return { success: true, data: result.data }
  }
  const errorMessages = result.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ')
  return { success: false, error: errorMessages }
}