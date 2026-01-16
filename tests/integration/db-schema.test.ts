/**
 * Database Schema Integration Tests
 *
 * Validates SQL schema, triggers, and RLS policies
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'bun:test';

// Skip if no Supabase connection
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SKIP_DB_TESTS = !SUPABASE_URL || !SUPABASE_KEY;

describe('Database Schema Validation', () => {
  let supabase: SupabaseClient;

  beforeAll(() => {
    if (!SKIP_DB_TESTS) {
      supabase = createClient(SUPABASE_URL!, SUPABASE_KEY!);
    }
  });

  it.skipIf(SKIP_DB_TESTS)('compliance_audit_log table exists', async () => {
    const { data, error } = await supabase
      .from('compliance_audit_log')
      .select('count')
      .limit(0);

    expect(error).toBeNull();
  });

  it.skipIf(SKIP_DB_TESTS)('can insert audit log entry', async () => {
    const testEvent = {
      dpu_id: 'test-dpu-001',
      redline_violated: null,
      intent_hash: 'a'.repeat(64), // Valid SHA-256 format
      proof_data: { test: true, public_visibility: true },
    };

    const { data, error } = await supabase
      .from('compliance_audit_log')
      .insert(testEvent)
      .select()
      .single();

    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data.dpu_id).toBe('test-dpu-001');
  });

  it.skipIf(SKIP_DB_TESTS)('rejects invalid intent_hash format', async () => {
    const testEvent = {
      dpu_id: 'test-dpu-001',
      intent_hash: 'invalid-hash', // Not 64 hex chars
      proof_data: {},
    };

    const { error } = await supabase
      .from('compliance_audit_log')
      .insert(testEvent);

    expect(error).not.toBeNull();
    expect(error?.message).toContain('chk_intent_hash_format');
  });

  it.skipIf(SKIP_DB_TESTS)('blocks UPDATE operations (immutability)', async () => {
    // First insert a record
    const { data: inserted } = await supabase
      .from('compliance_audit_log')
      .insert({
        dpu_id: 'test-immutability',
        intent_hash: 'b'.repeat(64),
        proof_data: {},
      })
      .select()
      .single();

    // Try to update it
    const { error } = await supabase
      .from('compliance_audit_log')
      .update({ dpu_id: 'modified' })
      .eq('id', inserted!.id);

    expect(error).not.toBeNull();
    expect(error?.message).toContain('UPDATE operation not allowed');
  });

  it.skipIf(SKIP_DB_TESTS)('blocks DELETE operations (immutability)', async () => {
    // First insert a record
    const { data: inserted } = await supabase
      .from('compliance_audit_log')
      .insert({
        dpu_id: 'test-delete',
        intent_hash: 'c'.repeat(64),
        proof_data: {},
      })
      .select()
      .single();

    // Try to delete it
    const { error } = await supabase
      .from('compliance_audit_log')
      .delete()
      .eq('id', inserted!.id);

    expect(error).not.toBeNull();
    expect(error?.message).toContain('DELETE operation not allowed');
  });

  it.skipIf(SKIP_DB_TESTS)('log_enforcement_event RPC works', async () => {
    const { data, error } = await supabase.rpc('log_enforcement_event', {
      p_dpu_id: 'rpc-test-001',
      p_redline_violated: 'policy_test',
      p_proof_data: { zkp_commitment: 'test', public_visibility: true },
    });

    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data[0]?.success).toBe(true);
  });
});

// Standalone test mode
if (SKIP_DB_TESTS) {
  console.log('⚠️ Database tests skipped - set SUPABASE_URL and SUPABASE_SERVICE_KEY to run');
}
