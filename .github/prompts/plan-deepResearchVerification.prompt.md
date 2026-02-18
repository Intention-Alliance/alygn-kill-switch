<expertise>
You are a software development and software architecture expert with IQ of 140 that focuses on efficient, elegant, performant and minimalist code without introducing any regressions to existing code.
</expertise>

<instructions>
- Do not refactor unrelated code.
- Follow the existing code style and patterns unless there is a compelling reason to change.
- Prioritize safety and regression avoidance over optimization or refactoring.
- If you identify any issues or potential improvements, document them clearly and propose solutions, but do not implement them without explicit approval.
- Follow the plan outlined in the "Plan" section below, and ask for clarification if any step is unclear or if you need additional information to proceed.
</instructions>

<task>

# Plan: Verify Deep-Research Flow & Regressions

TL;DR — Confirm authoritative deep-research script, verify whether sub-agents are actually spawned vs. file-based orchestration with Wobblus, and validate Notion integration. Prefer file-based orchestration (script posts request → Wobblus spawns sub-agents → saves /tmp file → script reads).

## Steps

1. Confirm latest script
   - Inspect header & timestamps of `scripts/alygn/vc-outreach/deep-research-vcs-v3.backup.js` and `scripts/alygn/vc-outreach/deep-research-vcs-v3.js`.
   - Decision checkpoint: choose one canonical file and archive others.

2. Map spawn points and agent flow
   - Locate all uses of `openclaw sessions spawn`, `sessions_spawn`, `openclaw message send`, `sessions_send`, and `/tmp/vc-research-` files across `scripts/alygn/vc-outreach`.
   - Verify whether scripts call `sessions_spawn` themselves or they post requests for Wobblus to spawn.
   - Confirm SUB-AGENT-PATTERN.md is followed: script posts request → Wobblus spawns → saves `/tmp` file → script reads.

3. Validate Notion integration and consistency
   - Compare Notion usage: `@notionhq/client` SDK vs. direct HTTPS helper.
   - Centralize Notion credentials and DB ID (avoid hard-coded IDs).
   - Ensure Notion updates include rate-limit handling and robust error handling.

4. Design tests to verify spawn behavior and file coordination
   - Local simulation: create `/tmp/vc-research-EXAMPLE-result.json`, run `node deep-research-vcs-v3.js --vc-name=EXAMPLE --dry-run`, assert script reads file and logs/update attempt.
   - CLI spawn test: if `openclaw` is available, run `openclaw sessions spawn --task="echo '{\"name\":\"t\"}'" --timeout-seconds=10` to observe stdout and JSON extraction.
   - JSON-extraction test: confirm brittle `stdout.match(...)` logic fails safely and falls back to `/tmp` file read.

5. Remediation & hardening
   - Prefer file-based coordination; remove or guard direct `sessions_spawn` CLI calls from scripts unless explicitly required and tested.
   - Replace brittle stdout JSON parsing with markers (e.g., `===JSON-START===...===JSON-END===`) or require `/tmp` file output.
   - Standardize Notion helper using `@notionhq/client` and central config file or environment variables.
   - Add retry/backoff for file waits and Notion updates; add detailed logging for failures and timeouts.
   - Remove hard-coded database IDs and move them to `notion-config.json` or env vars.

6. Verification checklist (manual & automated)
   - Manual: simulate `/tmp` file and run `--dry-run`; confirm read + Notion update path.
   - Automated: unit tests for Notion helper (mocked network) and integration test that simulates Wobblus by writing the expected `/tmp` file.

## Commands (examples)

Get a working example of the expected `/tmp` file format (or create it by running the script with a dry-run):

```bash
echo '{"name":"Test VC","description":"A test VC for validation","website":"https://example.com"}' > /tmp/vc-research-EXAMPLE-result.json
```

Dry-run:

```bash
node scripts/alygn/vc-outreach/deep-research-vcs-v3.js --vc-name="EXAMPLE" --dry-run
```

Optional CLI spawn test (only if `openclaw` CLI is installed):

```bash
openclaw sessions spawn --task="echo '{\"name\":\"t\"}'" --timeout-seconds=10
```

Decisions (recommended)
- Adopt the file-based Wobblus orchestration (script posts request and waits for `/tmp` result) as canonical.
- Standardize on `@notionhq/client` across scripts.
- Archive non-canonical copies to avoid accidental execution.

Questions for clarification
1. Confirm canonical spawn behavior: do you want (A) file-based Wobblus orchestration (recommended) or (B) scripts directly spawning sub-agents via `openclaw sessions spawn`? Please pick one.
  - Answer: Option A, file-based orchestration: script posts request → Wobblus spawns an agent → saves `/tmp` file → script reads.
2. Is there a staging Notion DB we can use for integration tests, or should tests remain dry-run/local only?
  - Answer: Use the `notion-config.json`, that should have the correct DB IDs and credentials for testing.
3. Is the `openclaw` CLI installed and usable on the machines where these scripts run? If yes, which version?
  - Answer: Yes, `openclaw` CLI is installed and usable. Version is `2026.2.15`.
4. Should I standardize Notion usage across all scripts now (convert HTTP helper to SDK), or produce a patch only after you confirm answers?
  - Answer: Standardize Notion usage across all scripts now using the `@notionhq/client` SDK. IUs a must to have a consistent, modular and maintainable codebase.
5. Should I rename the chosen canonical script to `deep-research-vcs-canonical.js` and move others to `archive/`?
  - Yes. We can rename it to `deep-research-vcs-canonical.js` and move the others to an `archive/` directory to avoid confusion and accidental execution.

Files to manually verify
- `scripts/alygn/vc-outreach/deep-research-vcs-v3.backup.js` — backup header + direct HTTPS Notion helper
- `scripts/alygn/vc-outreach/deep-research-vcs-v3.js` — contains `openclaw sessions spawn` and stdout JSON parsing
- `scripts/alygn/vc-outreach/SUB-AGENT-PATTERN.md` — authoritative flow
- `scripts/alygn/vc-outreach/notion-config.json` — confirm DB IDs and env usage
- `scripts/alygn/vc-outreach/send-approved-emails.js` — check consistent Notion usage

Next steps (proposed)
- Run the smoke tests (simulate `/tmp` file and run `--dry-run`).
- If `openclaw` CLI is available, test CLI spawn behavior and capture stdout behavior.
- Prepare a small patch to centralize Notion helper and remove unsafe `sessions_spawn` calls (only after your confirmation of decisions above).

</task>
