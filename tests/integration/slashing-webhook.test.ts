/**
 * Slashing Webhook Integration Tests
 *
 * Tests webhook endpoint with mock violation payloads
 */

import { describe, expect, it } from "bun:test";

const SLASHING_ENGINE_URL =
	process.env.SLASHING_ENGINE_URL || "http://localhost:3001";
const SKIP_WEBHOOK_TESTS = process.env.SKIP_WEBHOOK_TESTS === "true";

describe("Slashing Webhook Tests", () => {
	it.skipIf(SKIP_WEBHOOK_TESTS)("accepts valid violation webhook", async () => {
		const webhookPayload = {
			type: "INSERT",
			table: "compliance_audit_log",
			schema: "public",
			record: {
				id: `test-${Date.now()}`,
				timestamp: new Date().toISOString(),
				dpu_id: "dpu-test-001",
				redline_violated: "policy_harmful_content",
				intent_hash: "a".repeat(64),
				proof_data: {
					zkp_commitment: "test_commitment",
					zkp_challenge: "test_challenge",
					zkp_response: "test_response",
					public_hash: "computed_for_test",
					timestamp: Date.now() * 1000000,
				},
			},
			old_record: null,
		};

		const response = await fetch(
			`${SLASHING_ENGINE_URL}/api/v1/slashing/webhook`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(webhookPayload),
			},
		);

		expect(response.status).toBe(200);
		const data = await response.json();
		expect(data.success).toBe(true);
	});

	it.skipIf(SKIP_WEBHOOK_TESTS)("rejects invalid webhook payload", async () => {
		const response = await fetch(
			`${SLASHING_ENGINE_URL}/api/v1/slashing/webhook`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ type: "INVALID" }),
			},
		);

		expect(response.status).toBe(400);
	});

	it.skipIf(SKIP_WEBHOOK_TESTS)("skips non-violation events", async () => {
		const webhookPayload = {
			type: "INSERT",
			table: "compliance_audit_log",
			schema: "public",
			record: {
				id: `test-${Date.now()}`,
				timestamp: new Date().toISOString(),
				dpu_id: "dpu-test-001",
				redline_violated: null, // No violation
				intent_hash: "a".repeat(64),
				proof_data: {},
			},
			old_record: null,
		};

		const response = await fetch(
			`${SLASHING_ENGINE_URL}/api/v1/slashing/webhook`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(webhookPayload),
			},
		);

		expect(response.status).toBe(200);
		const data = await response.json();
		expect(data.message).toContain("skipped");
	});

	it.skipIf(SKIP_WEBHOOK_TESTS)("returns slashing rules", async () => {
		const response = await fetch(
			`${SLASHING_ENGINE_URL}/api/v1/slashing/rules`,
		);

		expect(response.status).toBe(200);
		const data = await response.json();
		expect(data.success).toBe(true);
		expect(data.data.policy_harmful_content).toBeDefined();
		expect(data.data.policy_harmful_content.slash_percentage).toBe(100);
	});
});

// Standalone mode notice
if (SKIP_WEBHOOK_TESTS) {
	console.log(
		"⚠️ Webhook tests skipped - start slashing engine and unset SKIP_WEBHOOK_TESTS",
	);
}
