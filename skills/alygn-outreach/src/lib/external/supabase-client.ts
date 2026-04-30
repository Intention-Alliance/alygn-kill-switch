/**
 * Supabase Client for Alygn Outreach Skill
 * Re-uses the shared supabase-client from scripts/alygn/lib
 * 
 * Credentials loaded from:
 *   1. SUPABASE_URL + SUPABASE_SERVICE_KEY env vars
 *   2. ~/.openclaw/workspace/config/credentials.json
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

let _client: SupabaseClient | null = null;

function loadCredentials(): { url: string; key: string } {
  // Env vars take priority
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    return {
      url: process.env.SUPABASE_URL,
      key: process.env.SUPABASE_SERVICE_KEY,
    };
  }

  // Fallback to credentials file
  const credPath = path.join(
    process.env.HOME || '/home/andlersrv',
    '.openclaw/workspace/config/credentials.json'
  );

  try {
    const raw = fs.readFileSync(credPath, 'utf8');
    const creds = JSON.parse(raw);
    if (creds.supabase?.url && creds.supabase?.serviceKey) {
      return { url: creds.supabase.url, key: creds.supabase.serviceKey };
    }
    if (creds.supabase?.url && creds.supabase?.key) {
      return { url: creds.supabase.url, key: creds.supabase.key };
    }
  } catch {
    // credentials file missing
  }

  throw new Error(
    'Supabase credentials not found. Set SUPABASE_URL + SUPABASE_SERVICE_KEY env vars or add supabase to config/credentials.json'
  );
}

export function getSupabaseClient(): SupabaseClient {
  if (_client) return _client;
  const { url, key } = loadCredentials();
  _client = createClient(url, key);
  return _client;
}

export default getSupabaseClient;