/**
 * Test config helper — a COMPLETE AppConfig for `mock.module('../../config')`.
 *
 * Bun's `mock.module` is process-global and is never reset between test
 * files. A partial config mock therefore leaks into every later file in
 * the same process: downstream suites that read `getConfig().webauthn`
 * (webauthn service) or `getConfig().features` (traffic-pause) crash with
 * "undefined is not an object" depending on file order.
 *
 * Any test file that mocks the config module MUST return the full shape.
 * Build it from the real schema + environment defaults so it can never
 * drift. This module deliberately imports the schema and environment
 * defaults directly (NOT `../config`) — importing the mocked index would
 * recurse through the mock factory.
 *
 * @author Keridz ⚙️ (be-coder)
 */

import { developmentConfig } from '../config/environments/development'
import { type AppConfig, AppConfigSchema } from '../config/schema'

let cached: AppConfig | null = null

/**
 * A complete, valid AppConfig (development defaults). Cached so repeated
 * `getConfig()` calls in a mocked module behave like the real singleton.
 */
export function testConfig(): AppConfig {
	if (!cached) {
		cached = AppConfigSchema.parse({ env: 'development', ...developmentConfig })
	}
	return cached
}

/**
 * The `../../config` module surface used by the kill-switch test files.
 * Mirrors the named exports those suites consume.
 */
export function configModuleMock() {
	return {
		getConfig: () => testConfig(),
		isFeatureEnabled: (flag: keyof AppConfig['features']) =>
			testConfig().features[flag],
	}
}
