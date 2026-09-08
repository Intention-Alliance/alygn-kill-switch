# Alygn Kill Switch — Code of Conduct

## Our Pledge

In the spirit of fostering an open, innovative, and welcoming environment, we as members, contributors, and leaders of the Alygn community pledge to make participation in our project and our community a harassment-free experience for everyone, regardless of age, body size, disability, ethnicity, sex characteristics, gender identity and expression, level of experience, education, socio-economic status, nationality, personal appearance, race, religion, or sexual identity and orientation.

We pledge to act and interact in ways that contribute to an open, welcoming, diverse, inclusive, and healthy community centered on one mission: **making human dignity verifiable in autonomous AI systems.**

## Why This Project Has a Higher Bar

The Alygn Kill Switch is safety-critical infrastructure. Its purpose is to give humans verifiable control over autonomous AI systems. Code contributed here may one day be responsible for stopping a system that is harming people. We hold this community to a high standard because the stakes are high — and because trust is the product.

## Our Values

- **Safety first, always.** Security and discipline are a shared responsibility — between the automated systems and the humans who govern them. Neither is passive.
- **Honesty about maturity.** We distinguish clearly between what is deployed and what is designed. Overstating readiness is a safety defect.
- **Auditability is sacred.** Every action in the system is logged and attributable. The same transparency applies to our community decisions.
- **Proportionality.** Minimal risk parks a process; it does not stop the system. The same proportionality applies to code review: precise, proportionate feedback.
- **Human dignity is non-negotiable.** In the code, in the community, and in every decision the system makes.

## Our Standards

### Positive behavior

- Submitting well-tested, documented code that follows the project's conventions (Bun strict runtime; Rust for safety-critical paths; TypeScript for operational surfaces).
- Engaging constructively in code reviews and design discussions — especially on safety-critical changes.
- Reporting security vulnerabilities responsibly through the private disclosure channel (see [Security Policy](SECURITY.md)).
- Respecting the built-vs-designed distinction in documentation, issues, and discussions.
- Helping other contributors learn the architecture — the design system and ADRs are the shared source of truth.

### Unacceptable behavior

- Introducing unvetted dependencies into safety-critical paths.
- Bypassing or weakening authorization, audit, or verification logic — even "temporarily."
- Committing secrets, credentials, session data, or live database state.
- Claiming capabilities that are designed but not deployed.
- Harassment, discrimination, or personal attacks of any kind.
- Publishing others' private information without consent.

## Scope

This Code of Conduct applies within all project spaces (repository, issues, discussions, chat) and when an individual officially represents the community in public spaces.

## Enforcement

Instances of abusive, harassing, or otherwise unacceptable behavior may be reported to the community leaders responsible for enforcement via **conduct@andler.dev**. All complaints will be reviewed and investigated promptly and fairly.

Violations of the safety-specific standards (unvetted dependencies in critical paths, weakened authorization, committed secrets) may result in immediate removal of contributions and revocation of commit access, in addition to standard Code of Conduct consequences.

## Attribution

This Code of Conduct is adapted from the [Contributor Covenant](https://www.contributor-covenant.org), version 2.1, with Alygn-specific safety provisions.