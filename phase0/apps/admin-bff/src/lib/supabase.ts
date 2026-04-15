// Supabase client for audit logging

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || '';

export const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null;

export async function writeAuditLog(entry: {
  model: string;
  method: string;
  endpoint: string;
  promptTokens: number | null;
  completionTokens: number | null;
  clientIp: string;
  clientId: string | null;
  statusCode: number;
  latencyMs: number;
  errorMessage: string | null;
  killSwitchState: string;
  traceId: string | null;
}): Promise<void> {
  if (!supabase) {
    // No Supabase configured — log to console
    console.log('[AUDIT]', JSON.stringify(entry));
    return;
  }

  const { error } = await supabase.from('ollama_audit_log').insert({
    model: entry.model,
    method: entry.method,
    endpoint: entry.endpoint,
    prompt_tokens: entry.promptTokens,
    completion_tokens: entry.completionTokens,
    client_ip: entry.clientIp,
    client_id: entry.clientId,
    status_code: entry.statusCode,
    latency_ms: entry.latencyMs,
    error_message: entry.errorMessage,
    kill_switch_state: entry.killSwitchState,
    trace_id: entry.traceId,
  });

  if (error) {
    console.error('[AUDIT ERROR]', error.message);
  }
}