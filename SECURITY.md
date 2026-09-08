# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| main branch | ✅ |
| older releases | ❌ (upgrade) |

## Reporting a Vulnerability

**Do not open public issues for security vulnerabilities.**

Report privately via **security@andler.dev** (or GitHub Security Advisories if enabled on this repository). Include:

- Affected component (scoring, enforcement, audit, auth, dashboard)
- Steps to reproduce or a proof of concept
- Impact assessment (what an attacker could achieve)
- Any known workarounds

### Response targets

| Severity | First response | Fix target |
|----------|---------------|------------|
| Critical (auth bypass, audit tampering, remote kill) | 24 hours | 7 days |
| High (privilege escalation, injection) | 72 hours | 30 days |
| Medium/Low | 7 days | next release |

We credit reporters in the release notes unless anonymity is requested.

## Scope

In scope: the kill-switch server, web-regulator dashboard, agent plane, audit chain, authorization logic, and deployment configurations in this repository.

Out of scope: the Alygn institutional infrastructure (arbitration, LNG), third-party dependencies reported upstream, and social engineering.

## Safety-Critical Disclosure Note

This is safety-critical infrastructure for governing autonomous AI systems. Vulnerabilities that allow **unauthorized kill execution, audit tampering, or self-deactivation by an AI system** are treated as Critical regardless of exploitability complexity. We ask researchers to coordinate disclosure — a public proof-of-concept against a deployed kill switch can cause real harm.

## Hardening Commitments

The project maintains these structural guarantees, and vulnerability reports that demonstrate a bypass of any of them are highest priority:

1. No AI system can self-deactivate or authorize a kill (human WebAuthn with mandatory UV only).
2. The audit chain is tamper-evident with dual-HSM signing and external anchoring.
3. Quorum-gated policy changes — the authorization threshold cannot be lowered without meeting itself.
4. Weight redistribution before administrator removal (no quorum-failure states).