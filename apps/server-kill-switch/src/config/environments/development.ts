    killSwitchVerificationEnabled: true,
  // ADR-2026-08-23: verification enabled for local testing against a
  // local Ollama instance. The verifier model must be pulled and
  // reachable at verifierBaseUrl before enabling.
  verification: {
    verifierModel: 'qwen2.5:0.5b',
    verifierBaseUrl: 'http://localhost:11434',
    verifierTimeoutMs: 500,
    verifyEnabled: false,
    verifyMode: 'async',
    verifierSystemPromptPath: 'docs/specs/verifier-system-prompt.md',
