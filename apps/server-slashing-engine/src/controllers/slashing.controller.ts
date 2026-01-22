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
			const { violation, dpu_id } = req.body || {};

			// Create the violation in the database first so it shows up in the compliance_audit_log
			const event = await this.slashingService.createViolation({
				redline_violated: violation || "policy_harmful_content",
				dpu_id: dpu_id || "dpu-test-001",
			});

			// Directly process the violation (simulating the webhook trigger)
			const result = await this.slashingService.processViolation(event);

			return res.status(200).json({
				success: true,
				data: {
					event,
					slashing_result: result,
				},
			});
		} catch (error) {
			next(error);
		}
	};
}
