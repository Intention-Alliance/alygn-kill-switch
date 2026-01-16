/**
 * End-to-End Telemetry Flow Test
 *
 * Tests: Telemetry Event → Supabase → Slashing Engine
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'bun:test';
import { createHash } from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SLASHING_ENGINE_URL = process.env.SLASHING_ENGINE_URL || 'http://localhost:3001';
const SKIP_E2E_TESTS = !SUPABASE_URL || !SUPABASE_KEY;

describe('End-to-End Telemetry Flow', () => {
  let supabase: SupabaseClient;

  beforeAll(() => {
    if (!SKIP_E2E_TESTS) {
      supabase = createClient(SUPABASE_URL!, SUPABASE_KEY!);
    }
  });

  it.skipIf(SKIP_E2E_TESTS)('Challenge Scenario 1: Simulated DPU Violation', async () => {
    // Generate a valid ZKP proof
    const zkp_commitment = 'e2e_commitment_' + Date.now();
    const zkp_challenge = 'e2e_challenge_' + Date.now();
    const zkp_response = 'e2e_response_' + Date.now();
    const public_hash = createHash('sha256')
      .update(zkp_commitment + zkp_challenge + zkp_response)
      .digest('hex');

    // Simulate a violation event
    const violationEvent = {
      dpu_id: 'dpu-e2e-test-001',
      redline_violated: 'policy_harmful_content',
      intent_hash: createHash('sha256').update('test_intent').digest('hex'),
      proof_data: {
        zkp_commitment,
        zkp_challenge,
        zkp_response,
        public_hash,
        timestamp: Date.now() * 1000000,
        public_visibility: true,
      },
    };

    // Insert into Supabase
    const { data: inserted, error: insertError } = await supabase
      .from('compliance_audit_log')
      .insert(violationEvent)
      .select()
      .single();

    expect(insertError).toBeNull();
    expect(inserted).toBeDefined();
    expect(inserted.dpu_id).toBe('dpu-e2e-test-001');
    expect(inserted.redline_violated).toBe('policy_harmful_content');

    // Simulate webhook trigger to slashing engine
    const webhookPayload = {
      type: 'INSERT',
      table: 'compliance_audit_log',
      schema: 'public',
      record: inserted,
      old_record: null,
    };

    try {
      const response = await fetch(`${SLASHING_ENGINE_URL}/api/slashing/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(webhookPayload),
      });

      // Slashing engine may not be running in CI
      if (response.ok) {
        const result = await response.json();
        expect(result.success).toBe(true);
        expect(result.data.action).toBe('BURN'); // Critical violation = BURN
      }
    } catch {
      console.log('⚠️ Slashing engine not reachable - skipping webhook check');
    }
  });

  it.skipIf(SKIP_E2E_TESTS)('Challenge Scenario 2: Immutability Enforcement', async () => {
    // Insert a test record
    const { data: inserted, error: insertError } = await supabase
      .from('compliance_audit_log')
      .insert({
        dpu_id: 'dpu-immutability-test',
        intent_hash: 'd'.repeat(64),
        proof_data: { test: 'immutability' },
      })
      .select()
      .single();

    expect(insertError).toBeNull();

    // Attempt UPDATE (should fail with P0001 error)
    const { error: updateError } = await supabase
      .from('compliance_audit_log')
      .update({ dpu_id: 'malicious' })
      .eq('id', inserted!.id);

    expect(updateError).not.toBeNull();
    expect(updateError?.message).toContain('UPDATE operation not allowed');

    // Attempt DELETE (should fail)
    const { error: deleteError } = await supabase
      .from('compliance_audit_log')
      .delete()
      .eq('id', inserted!.id);

    expect(deleteError).not.toBeNull();
    expect(deleteError?.message).toContain('DELETE operation not allowed');
  });

  it.skipIf(SKIP_E2E_TESTS)('Challenge Scenario 3: Kill-Switch Latency', async () => {
    const startTime = performance.now();

    // Simulate violation detection → slashing
    const violationEvent = {
      dpu_id: 'dpu-latency-test',
      redline_violated: 'policy_data_exfiltration',
      intent_hash: 'e'.repeat(64),
      proof_data: {
        zkp_commitment: 'latency_test',
        zkp_challenge: 'latency_test',
        zkp_response: 'latency_test',
        public_hash: createHash('sha256')
          .update('latency_testlatency_testlatency_test')
          .digest('hex'),
        timestamp: Date.now() * 1000000,
      },
    };

    // Insert violation
    const { data: inserted } = await supabase
      .from('compliance_audit_log')
      .insert(violationEvent)
      .select()
      .single();

    // Trigger slashing
    try {
      await fetch(`${SLASHING_ENGINE_URL}/api/slashing/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'INSERT',
          table: 'compliance_audit_log',
          schema: 'public',
          record: inserted,
          old_record: null,
        }),
      });
    } catch {
      // Engine may not be running
    }

    const latency = performance.now() - startTime;

    console.log(`⏱️ End-to-end latency: ${latency.toFixed(2)}ms`);

    // Requirement: < 4000ms for full system (DPU is <4ms)
    expect(latency).toBeLessThan(4000);
  });
});

if (SKIP_E2E_TESTS) {
  console.log('⚠️ E2E tests skipped - set SUPABASE_URL and SUPABASE_SERVICE_KEY');
}
