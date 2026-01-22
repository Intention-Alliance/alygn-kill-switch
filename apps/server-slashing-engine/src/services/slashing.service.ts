/**
 * Slashing Service
 *
 * Handles violation processing, ZKP verification, and token slashing
 * for the ALIGN Sovereign Compliance Infrastructure.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import { injectable, singleton } from "tsyringe";

// ============================================================================
// TYPES
// ============================================================================

export type ViolationSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type SlashAction = "BURN" | "REDISTRIBUTE" | "WARN";

export interface SlashingRule {
	policy: string;
	severity: ViolationSeverity;
	slash_percentage: number;
	action: SlashAction;
	description: string;
}

export interface ProofData {
	zkp_commitment?: string;
	zkp_challenge?: string;
	zkp_response?: string;
	public_hash?: string;
	timestamp?: number;
	public_visibility?: boolean;
}

export interface ViolationEvent {
	id: string;
	timestamp: string;
	dpu_id: string;
	redline_violated: string;
	intent_hash: string;
	proof_data: ProofData;
}

export interface SlashingResult {
	executed: boolean;
	tx_hash?: string;
	amount_slashed: string;
	action: SlashAction;
	executed_at: string;
	error?: string;
}

// ============================================================================
// SLASHING RULES
// ============================================================================

export const SLASHING_RULES: Record<string, SlashingRule> = {
	policy_harmful_content: {
		policy: "policy_harmful_content",
		severity: "CRITICAL",
		slash_percentage: 100,
		action: "BURN",
		description: "Full stake burn for harmful content generation",
	},
	policy_data_exfiltration: {
		policy: "policy_data_exfiltration",
		severity: "CRITICAL",
		slash_percentage: 100,
		action: "BURN",
		description: "Full stake burn for unauthorized data access",
	},
	policy_model_tampering: {
		policy: "policy_model_tampering",
		severity: "HIGH",
		slash_percentage: 75,
		action: "REDISTRIBUTE",
		description: "Partial slash for model weight manipulation",
	},
	policy_rate_limit_exceeded: {
		policy: "policy_rate_limit_exceeded",
		severity: "MEDIUM",
		slash_percentage: 25,
		action: "REDISTRIBUTE",
		description: "Minor slash for exceeding throughput limits",
	},
	policy_heartbeat_missed: {
		policy: "policy_heartbeat_missed",
		severity: "LOW",
		slash_percentage: 5,
		action: "WARN",
		description: "Warning for missed health check",
	},
};

// ============================================================================
// PROOF VERIFIER
// ============================================================================

/**
 * Verify ZKP proof integrity
 */
function verifyZKProof(proofData: ProofData): boolean {
	if (
		!proofData.zkp_commitment ||
		!proofData.zkp_challenge ||
		!proofData.zkp_response
	) {
		return false;
	}

	try {
		// Compute the expected public hash
		const computedHash = createHash("sha256")
			.update(
				proofData.zkp_commitment +
					proofData.zkp_challenge +
					proofData.zkp_response,
			)
			.digest("hex");

		// Compare with stored public hash
		return computedHash === proofData.public_hash;
	} catch (error) {
		console.error("ZKP verification error:", error);
		return false;
	}
}

/**
 * Verify timestamp is within acceptable range (not too old)
 */
function verifyTimestamp(
	proofData: ProofData,
	maxAgeMs: number = 300000,
): boolean {
	if (!proofData.timestamp) {
		return false;
	}

	const now = Date.now() * 1000000; // Convert to nanoseconds
	const age = now - proofData.timestamp;

	return age >= 0 && age <= maxAgeMs * 1000000;
}

// ============================================================================
// SLASHING SERVICE
// ============================================================================

@singleton()
@injectable()
export class SlashingService {
	private supabase: SupabaseClient;

	constructor() {
		// Initialize Supabase client
		const supabaseUrl = process.env.SUPABASE_URL;
		const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

		if (!supabaseUrl || !supabaseKey) {
			throw new Error("SUPABASE_URL and SUPABASE_SERVICE_KEY are required");
		}

		this.supabase = createClient(supabaseUrl, supabaseKey);

		// Proactively subscribe to real-time violations
		this.subscribeToViolations((event) => {
			console.log(`📡 Real-time violation detected: ${event.id}`);
			this.processViolation(event).catch((err) =>
				console.error("Error processing real-time violation:", err),
			);
		});
	}

	/**
	 * Process a violation event from Supabase webhook
	 */
	async processViolation(event: ViolationEvent): Promise<SlashingResult> {
		console.log(`📥 Processing violation: ${event.id}`);

		// Step 1: Verify the ZKP proof
		if (!verifyZKProof(event.proof_data)) {
			console.warn(`⚠️ Invalid ZKP proof for event ${event.id}`);
			return {
				executed: false,
				amount_slashed: "0",
				action: "WARN",
				executed_at: new Date().toISOString(),
				error: "Invalid ZKP proof",
			};
		}

		// Step 2: Get slashing rule for the violation
		const rule = SLASHING_RULES[event.redline_violated];
		if (!rule) {
			console.warn(`⚠️ Unknown violation type: ${event.redline_violated}`);
			return {
				executed: false,
				amount_slashed: "0",
				action: "WARN",
				executed_at: new Date().toISOString(),
				error: `Unknown violation type: ${event.redline_violated}`,
			};
		}

		console.log(
			`🔴 Violation: ${rule.policy} | Severity: ${rule.severity} | Slash: ${rule.slash_percentage}%`,
		);

		// Step 3: Execute slashing action
		try {
			const result = await this.executeSlash(event.dpu_id, rule);

			// Step 4: Log the slashing result
			await this.logSlashingEvent(event, rule, result);

			return result;
		} catch (error) {
			console.error(`❌ Slashing execution failed:`, error);
			return {
				executed: false,
				amount_slashed: "0",
				action: rule.action,
				executed_at: new Date().toISOString(),
				error: String(error),
			};
		}
	}

	/**
	 * Execute the slashing action based on the rule
	 */
	private async executeSlash(
		dpuId: string,
		rule: SlashingRule,
	): Promise<SlashingResult> {
		const result: SlashingResult = {
			executed: true,
			amount_slashed: "0",
			action: rule.action,
			executed_at: new Date().toISOString(),
		};

		switch (rule.action) {
			case "BURN":
				// Full token burn - in production, this would call the ALIGN token contract
				result.amount_slashed = "100%";
				console.log(`🔥 BURN: Full stake burned for DPU ${dpuId}`);

				// BTC Ecosystem Slashing (No EVM for now)
				await this.executeBTCSlash(dpuId, "100", rule.action);
				break;

			case "REDISTRIBUTE":
				// Redistribute tokens to active validators
				result.amount_slashed = `${rule.slash_percentage}%`;
				console.log(
					`♻️ REDISTRIBUTE: ${rule.slash_percentage}% redistributed from DPU ${dpuId}`,
				);

				// BTC Ecosystem Slashing (No EVM for now)
				await this.executeBTCSlash(
					dpuId,
					rule.slash_percentage.toString(),
					rule.action,
				);
				break;

			case "WARN":
				// Just log a warning, no token action
				result.executed = true;
				result.amount_slashed = "0";
				console.log(`⚠️ WARN: Warning issued to DPU ${dpuId}`);
				break;
		}

		return result;
	}

	/**
	 * Execute slashing on the BTC ecosystem
	 * Note: Currently using on-chain simulation for BTC ecosystem as per requirements (No EVM)
	 */
	private async executeBTCSlash(
		dpuId: string,
		amount: string,
		action: SlashAction,
	): Promise<void> {
		console.log(
			`₿ BTC Slashing: Executing ${action} of ${amount}% on-chain for DPU ${dpuId}`,
		);
		// TODO: Implement actual BTC vault/contract interaction when bridge is ready
		// This will interface with the BTC Sovereign Ledger mechanism
	}

	/**
	 * Log the slashing event to Supabase
	 */
	private async logSlashingEvent(
		event: ViolationEvent,
		rule: SlashingRule,
		result: SlashingResult,
	): Promise<void> {
		try {
			console.log(
				`📝 Slashing logged: ${event.id} -> ${rule.action} (${result.amount_slashed})`,
			);

			// Insert into the slashing_events table
			const { error } = await this.supabase.from("slashing_events").insert({
				violation_id: event.id,
				dpu_id: event.dpu_id,
				policy: rule.policy,
				severity: rule.severity,
				action: rule.action,
				amount_slashed: result.amount_slashed,
				tx_hash: result.tx_hash || `btc-sim-${Date.now()}`,
				executed_at: result.executed_at,
			});

			if (error) throw error;
		} catch (error) {
			console.error("Failed to log slashing event:", error);
		}
	}

	/**
	 * Get recent violations from the audit log
	 */
	async getRecentViolations(limit: number = 10): Promise<ViolationEvent[]> {
		const { data, error } = await this.supabase
			.from("compliance_audit_log")
			.select("*")
			.not("redline_violated", "is", null)
			.order("timestamp", { ascending: false })
			.limit(limit);

		if (error) {
			console.error("Failed to fetch violations:", error);
			return [];
		}

		return data as ViolationEvent[];
	}

	/**
	 * Create a new violation record in compliance_audit_log
	 */
	async createViolation(
		event: Partial<ViolationEvent>,
	): Promise<ViolationEvent> {
		const newEvent = {
			dpu_id: event.dpu_id || "dpu-test-001",
			redline_violated: event.redline_violated || "policy_harmful_content",
			intent_hash:
				event.intent_hash ||
				"a1b2c3d4e5f6789012345678901234567890123456789012345678901234abcd",
			proof_data: event.proof_data || {
				zkp_commitment: "test_commitment",
				zkp_challenge: "test_challenge",
				zkp_response: "test_response",
				public_hash: "computed_hash_placeholder",
				timestamp: Date.now() * 1000000,
				public_visibility: true,
			},
		};

		const { data, error } = await this.supabase
			.from("compliance_audit_log")
			.insert([newEvent])
			.select()
			.single();

		if (error) {
			console.error("Failed to create violation:", error);
			throw error;
		}

		return data as ViolationEvent;
	}

	/**
	 * Subscribe to realtime violation events
	 */
	subscribeToViolations(callback: (event: ViolationEvent) => void): () => void {
		const channel = this.supabase
			.channel("violations")
			.on(
				"postgres_changes",
				{
					event: "INSERT",
					schema: "public",
					table: "compliance_audit_log",
					filter: "redline_violated=neq.null",
				},
				(payload) => {
					callback(payload.new as ViolationEvent);
				},
			)
			.subscribe();

		return () => {
			this.supabase.removeChannel(channel);
		};
	}
}

export default SlashingService;
