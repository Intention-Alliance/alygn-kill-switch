    killSwitchVerificationEnabled: true,
  // ADR-2026-08-23: verification enabled in staging to exercise the
  // full verification path against the staging Ollama endpoint before
  // production rollout.
  verification: {
    verifierModel: 'qwen2.5:0.5b',
    verifierBaseUrl: 'http://localhost:11434',
    verifierTimeoutMs: 500,
    verifyEnabled: false,
    verifyMode: 'async',
    verifierSystemPromptPath: 'docs/specs/verifier-system-prompt.md',
