# ADR-136: Human-Signature Kill Authorization (WebAuthn + Quorum)

## Status

**Accepted** — 2026-08-17

## Context

The kill switch is a safety-critical control: it can stop harmful LLM-generated
content at the request level. Prior to this ADR, a kill could be triggered with a
Bearer token or API key — a credential that a compromised service account or an
autonomous agent could hold. That means an autonomous system could **deactivate
its own kill switch** (self-deactivation), defeating the entire safety mechanism.

The kill switch must be gated behind a **human** decision. We need:

1. **Human-only authorization** — a kill must be authorized by a real human, not
   a machine credential.
2. **Quorum for high-impact actions** — a fleet-wide kill (or a policy change that
   weakens the kill switch) should require more than one distinct human.
3. **Auditability** — every signature event must be recorded immutably.
4. **Replay resistance** — a captured authorization must not be reusable.
5. **Defense against autonomous self-deactivation** — service accounts and API
   keys must have no path into the kill-authorization flow.

## Decision

Kill authorization is gated behind a **WebAuthn (FIDO2) human signature**. A human
registers a hardware authenticator (YubiKey, platform authenticator, etc.), and
every kill / policy-change action requires a fresh WebAuthn **assertion** that
yields a short-lived, HMAC-signed **assertion token**. The token is bound to the
exact action, the user, and the specific credential.

### §1 — WebAuthn ceremonies

Two ceremonies are exposed (see `src/routes/webauthn.ts`):

| Endpoint | Purpose |
|----------|---------|
| `POST /v1/auth/webauthn/register/begin` / `.../finish` | Register a new authenticator credential |
| `POST /v1/auth/webauthn/assert/begin` / `.../finish` | Assert identity and mint an assertion token |

Security properties enforced by `src/services/webauthn.ts`:

- **Challenges are single-use, short-lived, and bound to a purpose** (`register` |
  `assert`) and, for assertions, to the exact action being authorized.
- **Authenticator counter** is enforced (monotonic per credential) for replay
  detection.
- A successful assertion yields a **short-lived, HMAC-signed assertion token**
  bound to the action, the user, and the specific credential. An API key can
  never mint one.

### §2 — Assertion token

The assertion token is an HMAC-signed JWT-like payload (`BETTER_AUTH_SECRET` /
`WEBAUTHN_ASSERTION_TOKEN_SECRET`). It is presented in the
`Authorization: Assertion <token>` header. It is:

- **Action-bound** — `verifyAssertionTokenForAction({ token, action })` rejects a
  token minted for a different action.
- **Short-lived** — `assertionTokenTtlMs` (default 120s).
- **Credential-bound** — carries the specific credential id that signed it.

### §3 — Quorum workflow

Kill requests are stored in the `kill_authorization_request` table. The workflow
is driven by `src/services/kill-authorization.ts`:

```
single mode:  assertion #1 → request EXECUTED immediately
quorum mode:  assertion #1 → PENDING_QUORUM
              assertion #2 (distinct human) → threshold met → EXECUTE
```

Rules enforced:

- **Distinct approvers** — the initiator cannot be the sole approver when the
  threshold is > 1; a second **distinct** human (different user and credential) is
  required.
- **Timeout** — a `PENDING_QUORUM` request expires after
  `kill.authorization.timeoutMs` (default 10 min) and is marked `EXPIRED`.
- **Atomicity** — the status update and the executor side-effect (kill-switch
  transition / flag update) run inside a transaction; an executor failure rolls
  back so the request stays `PENDING_QUORUM` and can be retried.
- **Audit** — every signature event is appended to the immutable
  `kill_switch_audit_log` (ADR-140) by the route layer.

### §4 — Defense against autonomous self-deactivation

The kill-authorization endpoints accept **only** a WebAuthn assertion token:

- `POST /v1/kill-authorization/requests` (initiate kill)
- `POST /v1/kill-authorization/requests/:id/approve` (quorum approval)
- `POST /v1/kill-authorization/policy-change` (quorum-gated flag change)

Bearer tokens and API keys are **structurally rejected** (`ASSERTION_REQUIRED`,
403) on these endpoints. Service accounts and autonomous agents have no path into
the flow, so an autonomous system cannot deactivate its own kill switch.

### §5 — Single mode

`kill.authorization.mode = single` is the default. In single mode, **one** valid
human assertion immediately executes the kill (or applies the policy change). This
is the low-friction path for a single operator with a hardware authenticator.

### §6 — Quorum-gated policy changes

Changing any `kill.authorization.*` flag (mode, quorum, timeout) is itself
quorum-gated:

- The change is initiated via `POST /v1/kill-authorization/policy-change`.
- The **current** mode's threshold applies — never the proposed one. This prevents
  a single human from lowering the quorum threshold and then acting alone.
- In quorum mode, a single signature leaves the change `PENDING_QUORUM`; a second
  distinct human executes it.
- Only `kill.authorization.*` flags are accepted on this endpoint; other flags are
  rejected (`NOT_KILL_AUTH_FLAG`, 400).

## Consequences

### Positive

1. **Human-only kills** — a kill requires a real human WebAuthn signature.
2. **No autonomous self-deactivation** — service accounts / API keys are rejected
   on kill-authorization endpoints.
3. **Quorum for high-impact actions** — fleet kills and policy changes need
   multiple distinct humans.
4. **Replay-resistant** — single-use challenges + monotonic authenticator counter +
   short-lived action-bound tokens.
5. **Auditable** — every signature is recorded in the immutable audit log.

### Negative

1. **Operational friction** — operators must hold a registered hardware
   authenticator; a lost authenticator requires re-registration.
2. **Latency** — quorum mode requires a second human to approve, adding delay to
   fleet-wide kills.
3. **Credential management** — the `webauthn_credential` table and registration
   ceremony add operational surface.

### Neutral

1. **Single mode default** keeps the common single-operator path low-friction while
   quorum mode is available for high-impact actions.
2. **Assertion tokens are short-lived** — they must be minted fresh per action,
   which is a deliberate trade-off for replay resistance.

## Alternatives Considered

### Rejected: Keep Bearer / API-key kills

**Why rejected:** A compromised service account or autonomous agent could
deactivate the kill switch (self-deactivation), defeating the safety mechanism.

### Rejected: SMS / TOTP second factor

**Why rejected:** Phishing-resistant hardware WebAuthn is stronger than SMS/TOTP
and is already supported by the FIDO2 ecosystem.

### Rejected: Single human signature for all actions

**Why rejected:** A single compromised operator could execute a fleet-wide kill or
weaken the kill switch. Quorum (≥2 distinct humans) is required for high-impact
actions.

## References

- [ADR-133](./ADR-133-kill-switch-protocol.md) — Kill Switch protocol (accepted, 2026-05-13)
- [ADR-134](./ADR-134-metrics-and-logging.md) — Metrics & logging (proposed, 2026-05-28)
- `apps/server-kill-switch/src/services/webauthn.ts` — WebAuthn ceremonies + assertion tokens
- `apps/server-kill-switch/src/services/kill-authorization.ts` — Quorum workflow
- `apps/server-kill-switch/src/routes/kill-authorization.ts` — Kill-authorization endpoints
- `apps/server-kill-switch/src/routes/webauthn.ts` — WebAuthn ceremony endpoints
- `apps/server-kill-switch/src/config/schema.ts` — `WebAuthnConfigSchema` (rpID, origin, TTLs)
