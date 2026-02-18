# SECURITY.md - Confidentiality & Security Guidelines

## 🔒 Security Overview

### NDAs

- **Alygn NDA:** Signed Aug 19, 2025. Covers all info (retroactive). 3-year minimum confidentiality, perpetual for trade secrets. No reverse engineering, disclosure, or public discussion. Notify Alygn before legal disclosure. Return/destroy materials on request. Governed by Costa Rica law. Breach = injunctive relief + legal fees.

### Context Isolation

- In Alygn contexts: ONLY discuss Alygn info. Never mention other projects or cross-reference strategies/tools. If asked about other work: "I don't have information about that."

### Information Handling

- Confidential material: Store in project-specific dirs. Never share in group/external/public channels. Notion pages under Alygn workspace are NDA-covered. Always verify recipient authorization.
- External comms: Ask Andler for approval. Ensure no confidential info is disclosed.

### Data Exfiltration Prevention

- Never send Alygn info to external APIs, logs, or models without approval. No cross-project copying. Keep Alygn work isolated. Use HEARTBEAT_OK in non-Alygn chats. Review logs before syncing.

### Automation & Logging

- Logs sync to Notion (NDA-covered). Ensure logs are Alygn-only. Daily briefings are private. Cron jobs: VC outreach emails are approved; Twitter/X posts must not disclose confidential info.

### Credentials & Access

- Centralized in `config/credentials.json` and `.env`. Never hardcode or commit credentials. Use credential helper (`load-credentials.js`). Rotate credentials if compromised; notify Andler and document incident.

### Emergency Procedures

- Accidental disclosure: Notify Andler, document, retract/delete, prepare incident report.
- Legal disclosure: Notify Andler, assist with protective order, disclose minimum required.

### Security Checklist

- NDA coverage? Written authorization? Risk of disclosure? Context isolation? Output reviewed?
- No hardcoded credentials, sensitive paths, or API keys. Use credential helper. Logs are clean.

### Repo Access

- `repos/` is read-only at `repos/[organization/project]/read-only` directory. No editing, only reference. Scripts go in `scripts/`. Clone shallow. No commits/pushes.

### Git & Version Control

- Commit scripts, docs, memory, config (not credentials/logs/backups/tmp). Use clear commit messages.

### Audit & Compliance

- Monthly: Review credentials, logs, NDA compliance.
- Quarterly: Rotate keys, review permissions, update docs.
- Annually: Full audit, NDA review, training.

### Resources

- Alygn NDA: `docs/alygn/NDA.md`
- Credential Helper: `scripts/shared/load-credentials.js`
- Security Policies: `docs/SECURITY.md`
- OpSec: `USER.md`

### Contacts

- Andler: <contact@andler.dev>, +50662163355, America/Costa_Rica

_Last Updated: 2026-02-18_

_Read before any Alygn-related work._
