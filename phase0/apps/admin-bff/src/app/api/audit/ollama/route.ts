// Audit log query endpoint
// GET /api/audit/ollama → Returns recent Ollama audit entries

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);
  const model = searchParams.get('model');
  const offset = parseInt(searchParams.get('offset') || '0');

  if (!supabase) {
    return NextResponse.json({
      entries: [],
      message: 'Supabase not configured — audit logging is console-only',
    });
  }

  let query = supabase
    .from('ollama_audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (model) {
    query = query.eq('model', model);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ entries: data, count: data?.length || 0 });
}