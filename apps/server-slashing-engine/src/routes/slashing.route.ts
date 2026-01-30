import { SlashingController } from "@/controllers/slashing.controller";
import type { Routes } from "@interfaces/routes.interface";
import { Router } from "express";
import { inject, injectable } from "tsyringe";

/**
 * Slashing Webhook Route
 *
 * Receives violation webhooks from Supabase and triggers slashing
 */
@injectable()
export class SlashingRoute implements Routes {
	public router: Router = Router();
	public path = "/slashing";

	constructor(@inject(SlashingController) private slashingController: SlashingController) {
		this.initializeRoutes();
	}

	private initializeRoutes() {
		/**
		 * GET /api/slashing
		 *
		 * Base endpoint for slashing information
		 */
		this.router.get(this.path, (_req, res) => {
			res.json({
				status: "OK",
				message: "ALYGN Slashing API",
				endpoints: {
					webhook: `${this.path}/webhook`,
					violations: `${this.path}/violations`,
					rules: `${this.path}/rules`,
					test: `${this.path}/test`,
				},
			});
		});

		/**
		 * POST /api/slashing/webhook
		 *
		 * Receives violation events from Supabase webhook
		 */
		this.router.post(
			`${this.path}/webhook`,
			this.slashingController.processWebhook,
		);

		/**
		 * GET /api/slashing/violations
		 *
		 * Get recent violations
		 */
		this.router.get(
			`${this.path}/violations`,
			this.slashingController.getRecentViolations,
		);

		/**
		 * GET /api/slashing/rules
		 *
		 * Get slashing rules
		 */
		this.router.get(
			`${this.path}/rules`,
			this.slashingController.getSlashingRules,
		);

		/**
		 * POST /api/slashing/test
		 *
		 * Test endpoint to simulate a violation (development only)
		 */
		this.router.post(
			`${this.path}/test`,
			this.slashingController.testViolation,
		);
	}
}
