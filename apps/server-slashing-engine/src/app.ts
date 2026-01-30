import {
	CORS_ORIGIN_LIST,
	CREDENTIALS,
	LOG_FORMAT,
	NODE_ENV,
	PORT,
} from "@config/env";
import type { Routes } from "@interfaces/routes.interface";
import { ErrorMiddleware } from "@middlewares/error.middleware";
import { NotFoundMiddleware } from "@middlewares/notFound.middleware";
import { logger, stream } from "@utils/logger";
import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import hpp from "hpp";
import morgan from "morgan";

class App {
	public app: express.Application;
	public env: string;
	public port: string | number;

	constructor(routes: Routes[], apiPrefix = "/api/v1") {
		this.app = express();
		this.env = NODE_ENV || "development";
		this.port = PORT || 3000;

		this.initializeTrustProxy();
		this.initializeMiddlewares();
		this.initializeRoutes(routes, apiPrefix);
		this.initializeErrorHandling();
	}

	public listen() {
		const server = this.app.listen(this.port, () => {
			logger.info(`=================================`);
			logger.info(`======= ENV: ${this.env} =======`);
			logger.info(`🚀 App listening on the port ${this.port}`);
			logger.info(`=================================`);
		});

		return server;
	}

	public getServer() {
		return this.app;
	}

	private initializeTrustProxy() {
		// Required for extracting real IP in proxy environments (Nginx, Heroku, Cloudflare, etc.)
		this.app.set("trust proxy", 1);
	}

	private initializeMiddlewares() {
		this.app.use(
			rateLimit({
				windowMs: 60_000,
				limit: this.env === "production" ? 100 : 1000,
				standardHeaders: true,
				legacyHeaders: false,
				skip: (req) =>
					this.env !== "production" ||
					["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.ip ?? ""),
			}),
		);

		this.app.use(morgan(LOG_FORMAT || "dev", { stream }));

		// Manage CORS whitelist via environment variables
		const allowedOrigins =
			CORS_ORIGIN_LIST.length > 0
				? CORS_ORIGIN_LIST
				: ["http://localhost:3000"];

		this.app.use(
			cors({
				origin: (origin, callback) => {
					if (!origin || allowedOrigins.includes(origin)) {
						callback(null, true);
					} else {
						callback(new Error("Not allowed by CORS"));
					}
				},
				credentials: CREDENTIALS,
			}),
		);

		this.app.use(hpp());
		this.app.use(
			helmet({
				contentSecurityPolicy:
					this.env === "production"
						? {
								directives: {
									defaultSrc: ["'self'"],
									scriptSrc: ["'self'", "'unsafe-inline'"],
									objectSrc: ["'none'"],
									upgradeInsecureRequests: [],
								},
							}
						: false, // Disable CSP in dev for convenience (hot reload, etc.)
				referrerPolicy: { policy: "no-referrer" },
			}),
		);
		this.app.use(compression());
		this.app.use(express.json({ limit: "10mb" }));
		this.app.use(express.urlencoded({ extended: true, limit: "10mb" }));
		this.app.use(cookieParser());

		// Basic root route for health check / discovery
		this.app.get("/", (_req, res) => {
			res.json({
				status: "OK",
				message: "ALYGN Slashing Engine API",
				version: "1.0.0",
				endpoints: {
					slashing: "/api/v1/slashing",
				},
			});
		});
	}

	private initializeRoutes(routes: Routes[], apiPrefix: string) {
		routes.forEach((route) => {
			this.app.use(apiPrefix, route.router);
		});
	}

	private initializeErrorHandling() {
		this.app.use(NotFoundMiddleware);
		this.app.use(ErrorMiddleware);
	}
}

export default App;
