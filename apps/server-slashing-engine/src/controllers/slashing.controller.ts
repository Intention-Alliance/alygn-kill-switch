import {
  SLASHING_RULES,
  SlashingService,
  type ViolationEvent,
} from "@/services/slashing.service";
import type { NextFunction, Request, Response } from "express";
import { inject, injectable } from "tsyringe";

interface WebhookPayload {
	type: "INSERT" | "UPDATE" | "DELETE";
	table: string;
	schema: string;
	record: ViolationEvent;
	old_record: ViolationEvent | null;
}

@injectable()
export class SlashingController {
	constructor(@inject(SlashingService) private slashingService: SlashingService) {}

	public processWebhook = async (
		req: Request,
		res: Response,
		next: NextFunction,
	) => {
		try {
			const payload = req.body as WebhookPayload;

			// Validate webhook payload
			if (!payload || payload.type !== "INSERT") {
				return res.status(400).json({
					success: false,
					error: "Invalid webhook payload",
				});
			}

			// Ensure it's a violation event
			if (!payload.record.redline_violated) {
				return res.status(200).json({
					success: true,
					message: "Non-violation event, skipped",
				});
			}

			// Process the violation
			const result = await this.slashingService.processViolation(
				payload.record,
			);

			return res.status(200).json({
				success: true,
				data: result,
			});
		} catch (error) {
			next(error);
		}
	};

	public getRecentViolations = async (
		req: Request,
		res: Response,
		next: NextFunction,
	) => {
		try {
			const limit = parseInt(req.query.limit as string, 10) || 10;
			const violations = await this.slashingService.getRecentViolations(limit);

			return res.status(200).json({
				success: true,
				data: violations,
			});
		} catch (error) {
			next(error);
		}
	};

	public getSlashingRules = async (_req: Request, res: Response) => {
		return res.status(200).json({
			success: true,
			data: SLASHING_RULES,
		});
	};

	public testViolation = async (
		req: Request,
		res: Response,
		next: NextFunction,
	) => {
		if (process.env.NODE_ENV === "production") {
			return res.status(403).json({
				success: false,
				error: "Test endpoint disabled in production",
			});
		}

		try {
			const testEvent: ViolationEvent = {
				id: `test-${Date.now()}`,
				timestamp: new Date().toISOString(),
				dpu_id: "dpu-test-001",
				redline_violated: req.body.violation || "policy_harmful_content",
				intent_hash:
					"a1b2c3d4e5f6789012345678901234567890123456789012345678901234abcd",
				proof_data: {
					zkp_commitment: "test_commitment",
					zkp_challenge: "test_challenge",
					zkp_response: "test_response",
					public_hash: "computed_hash_placeholder",
					timestamp: Date.now() * 1000000,
					public_visibility: true,
				},
			};

			const result = await this.slashingService.processViolation(testEvent);

			return res.status(200).json({
				success: true,
				data: result,
			});
		} catch (error) {
			next(error);
		}
	};
}
