// Ollama Proxy + Audit Logging
// POST /api/ollama/[...path] → Ollama API
// Checks kill switch state before forwarding
// Logs every request to Supabase audit table

import { NextRequest, NextResponse } from 'next/server';
import { writeAuditLog } from '@/lib/supabase';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const KILL_SWITCH_API = process.env.KILL_SWITCH_API_URL || 'http://127.0.0.1:3000';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const startTime = Date.now();
  const ollamaPath = '/' + path.join('/');

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const clientIp =
    request.headers.get('x-real-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown';

  // ─── Check kill switch state ──────────────────────────────────
  let killSwitchState = 'ARMED';
  try {
    const ksRes = await fetch(`${KILL_SWITCH_API}/v1/kill-switch/status`);
    const ksData = await ksRes.json();
    killSwitchState = ksData.state || 'ARMED';

    if (killSwitchState === 'STOPPED' || killSwitchState === 'LOCKED') {
      // Log the blocked attempt
      await writeAuditLog({
        model: body.model || 'unknown',
        method: 'POST',
        endpoint: ollamaPath,
        promptTokens: body.options?.num_predict || null,
        completionTokens: null,
        clientIp,
        clientId: null,
        statusCode: 503,
        latencyMs: Date.now() - startTime,
        errorMessage: `Blocked — kill switch is ${killSwitchState}`,
        killSwitchState,
        traceId: null,
      });

      return NextResponse.json(
        { error: 'Ollama access disabled', reason: `Kill switch is ${killSwitchState}` },
        { status: 503 }
      );
    }
  } catch {
    // Kill switch unreachable — allow request but note it
    killSwitchState = 'UNKNOWN';
  }

  // ─── Forward to Ollama ───────────────────────────────────────
  let statusCode = 200;
  let errorMessage: string | null = null;
  let responseData: any;

  try {
    const res = await fetch(`${OLLAMA_URL}${ollamaPath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    statusCode = res.status;

    if (!res.ok) {
      errorMessage = await res.text();
      responseData = { error: errorMessage };
    } else {
      responseData = await res.json();
    }
  } catch (err) {
    statusCode = 502;
    errorMessage = err instanceof Error ? err.message : 'Ollama unreachable';
    responseData = { error: errorMessage };
  }

  // ─── Audit log (fire and forget) ─────────────────────────────
  const latencyMs = Date.now() - startTime;
  writeAuditLog({
    model: body.model || 'unknown',
    method: 'POST',
    endpoint: ollamaPath,
    promptTokens: body.options?.num_predict || null,
    completionTokens: responseData?.eval_count || responseData?.prompt_eval_count || null,
    clientIp,
    clientId: null,
    statusCode,
    latencyMs,
    errorMessage,
    killSwitchState,
    traceId: null,
  }).catch(() => { /* don't block response */ });

  return NextResponse.json(responseData, { status: statusCode });
}

// GET requests to Ollama (e.g., /api/tags for model list)
// Also check kill switch state — authenticated users only
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const ollamaPath = '/' + path.join('/');
  const clientIp = request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

  // Check kill switch state for GET requests too
  let killSwitchState = 'ARMED';
  try {
    const ksRes = await fetch(`${KILL_SWITCH_API}/v1/kill-switch/status`);
    const ksData = await ksRes.json();
    killSwitchState = ksData.state || 'ARMED';
    if (killSwitchState === 'STOPPED' || killSwitchState === 'LOCKED') {
      return NextResponse.json(
        { error: 'Ollama access disabled', reason: `Kill switch is ${killSwitchState}` },
        { status: 503 }
      );
    }
  } catch {
    // Kill switch unreachable — allow request
    killSwitchState = 'UNKNOWN';
  }

  try {
    const res = await fetch(`${OLLAMA_URL}${ollamaPath}`);
    const data = await res.json();

    // Audit log for GET requests too
    writeAuditLog({
      model: 'unknown',
      method: 'GET',
      endpoint: ollamaPath,
      promptTokens: null,
      completionTokens: null,
      clientIp,
      clientId: null,
      statusCode: res.status,
      latencyMs: 0,
      errorMessage: null,
      killSwitchState,
      traceId: null,
    }).catch(() => {});

    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Ollama unreachable' }, { status: 502 });
  }
}