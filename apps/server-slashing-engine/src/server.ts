import "reflect-metadata";

import App from "@/app";
import "@config/env";
import { UsersRepository } from "@repositories/users.repository";
import { SlashingRoute } from "@routes/slashing.route";
import { UsersRoute } from "@routes/users.route";
import { container } from "tsyringe";

// Dependency Injection registration
container.registerInstance(UsersRepository, new UsersRepository());

// Route modules can be dynamically added to array as needed
const routes = [
	container.resolve(UsersRoute),
	container.resolve(SlashingRoute),
];

// API prefix is set in app.ts with default value, can be passed as argument if needed
const appInstance = new App(routes);

// listen() returns server object (http.Server) - modified in app.ts
const server = appInstance.listen(); // Can pass PORT as argument if needed

// Graceful Shutdown: Essential for production environments!
if (server && typeof server.close === "function") {
	["SIGINT", "SIGTERM"].forEach((signal) => {
		process.on(signal, () => {
			console.log(`Received ${signal}, closing server...`);
			server.close(() => {
				console.log("HTTP server closed gracefully");
				// Add cleanup code for external resources (DB/Redis) if needed
				process.exit(0);
			});
		});
	});
}

export default server;
