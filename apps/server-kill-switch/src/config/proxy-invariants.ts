/**
 * Proxy-Invariant Guard — P1-2 (Stage 2 fix).
 *
 * Centralised here so the unit test doesn't have to import the entire
 * `index.ts` (which has Bun-specific globals and a long module init
 * graph). The guard itself is a pure function over two booleans.
 *
 * The kill-switch acts as the inference proxy (the node-res-adapter relays
 * POST /v1/inference/* to upstream Ollama). If the proxy flag is ON but
 * verification is OFF, the server MUST refuse to start — a misconfigured env
 * must never silently ship verification-off, because the prompt+output
 * telemetry would be lost and UNSAFE outputs would reach the client with no
 * kill-switch doctrine.
 *
 * Production intent (production.ts line 78, verifyEnabled:true): when the
 * proxy is enabled, verification MUST also be enabled. Default for both
 * is true now (docker-compose line 95: KILL_SWITCH_VERIFY_ENABLED:-true).
 *
 * @throws Error with a descriptive FAIL-START message when the misconfig is
 *         detected. The caller (startServer) lets the error propagate so the
 *         container exits non-zero and the orchestrator restarts it visibly.
 */
export function assertProxyAndVerificationInvariant(
	killSwitchVerificationFlag: boolean,
	verifyEnabled: boolean,
): void {
	if (killSwitchVerificationFlag && !verifyEnabled) {
		throw new Error(
			'FAIL-START: killSwitchVerificationEnabled=true requires verification.verifyEnabled=true. ' +
				'Set KILL_SWITCH_VERIFY_ENABLED=true (or the env override) to enable the verifier. ' +
				'Refusing to start the inference proxy without verification enabled.',
		)
	}
}
