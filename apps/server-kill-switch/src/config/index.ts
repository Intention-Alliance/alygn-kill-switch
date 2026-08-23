  // Verification (ADR-2026-08-23)
  const verificationOverrides: Partial<AppConfig['verification']> = {};
  if (env.KILL_SWITCH_VERIFY_ENABLED) {
    verificationOverrides.verifyEnabled = env.KILL_SWITCH_VERIFY_ENABLED === 'true';
  }
  if (env.KILL_SWITCH_VERIFY_MODE) {
    verificationOverrides.verifyMode = env.KILL_SWITCH_VERIFY_MODE as AppConfig['verification']['verifyMode'];
  }
  if (env.KILL_SWITCH_VERIFIER_SYSTEM_PROMPT_PATH) {
    verificationOverrides.verifierSystemPromptPath = env.KILL_SWITCH_VERIFIER_SYSTEM_PROMPT_PATH;
