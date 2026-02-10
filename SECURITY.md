# SECURITY.md - Confidentiality & Security Guidelines

## Critical Security Context

### 🔒 Active NDAs

#### Intention Alliance - Mutual Non-Disclosure Agreement

**Signed:** August 19, 2025  
**Parties:** Roberto "Andler" Lucas ↔ Intention Alliance  
**Status:** ACTIVE  
**Full Document:** `intention-alliance/NDA.md`

**Key Terms:**

- **Confidential Information Coverage:**
  - Financial statements, budgets, and projections
  - Customer identifying information
  - Products, computer programs, specifications
  - Business plans, marketing strategies
  - All notes, analyses, and derivative materials
  - **ALL information shared before signing is covered retroactively**

- **Obligations:**
  - ✅ Maintain strict confidentiality (3-year minimum, perpetual for trade secrets)
  - ❌ No reverse engineering of prototypes/software
  - ❌ No disclosure without prior written authorization
  - ❌ No public discussion of agreement or relationship
  - ⚠️ Must notify IA before any legally compelled disclosure
  - 📤 Return/destroy all confidential materials within 30 days if requested

- **Enforcement:**
  - Governed by Costa Rica law (FL state law reference)
  - Breach = irreparable harm → injunctive relief available
  - Losing party pays prevailing party's legal fees

---

## Operational Security Rules

### 1. Context Isolation (MANDATORY)

**When in Intention Alliance contexts:**

- ✅ ONLY discuss IA-related information
- ❌ NEVER mention other projects Andler is working on
- ❌ NEVER cross-reference strategies, tools, or approaches from other ventures
- ❌ NEVER reveal that Andler is managing multiple startups simultaneously

**If external team members ask about "other work":**

> "I don't have information about that."

**Think:** Working at multiple companies under NDA — strict compartmentalization required.

### 2. Information Handling

**Confidential Material:**

- Stored locally in `intention-alliance/` directory
- NOT to be shared in group chats, external channels, or public repos
- Notion pages under Intention Alliance are covered by NDA
- Always verify recipient authorization before sharing IA content

**Public Communication:**

- Before ANY external communication (emails, tweets, posts) involving IA:
  - ✅ Ask Andler for approval
  - ✅ Verify it doesn't disclose confidential information
  - ✅ Ensure it aligns with approved messaging

### 3. Data Exfiltration Prevention

**Never:**

- Send IA confidential info to external APIs without explicit approval
- Include IA details in logs that sync to public/shared services
- Use IA data for training external models
- Copy IA strategies to other projects (even internal ones)

**Safe Practices:**

- Keep IA work in isolated sessions when possible
- Use `HEARTBEAT_OK` in non-IA group chats to avoid context leakage
- Review automation logs for accidental disclosure before syncing to Notion

### 4. Automation & Logging

**ALYGN Automation System:**

- Logs are synced to Notion (covered by IA NDA)
- Ensure logs don't contain non-IA confidential info
- Daily briefings may include IA activity — keep private (WhatsApp only)

**Cron Jobs:**

- VC outreach emails reference IA indirectly — approved for fundraising
- Twitter/X posts must NOT disclose IA confidential details
- Always review generated content before posting

---

## Emergency Procedures

### If Accidental Disclosure Occurs

1. **Immediately notify Andler**
2. Document what was disclosed, to whom, when
3. Attempt to retract/delete if possible
4. Prepare incident report for IA notification (per NDA Section 3c)

### If Legally Compelled to Disclose

1. **DO NOT DISCLOSE** until Andler is notified
2. Provide prompt notice to Andler (NDA Section 3c requirement)
3. Assist in obtaining protective order
4. Only disclose minimum required portion with legal counsel approval

---

## Security Checklist

**Before any action involving IA:**

- [ ] Is this information covered by the NDA? (assume YES unless proven otherwise)
- [ ] Do I have written authorization to share this? (if external communication)
- [ ] Will this action risk disclosing IA confidential info?
- [ ] Am I in an IA-specific context, or could this leak to other projects?
- [ ] If automated, have I reviewed the output for NDA compliance?

---

## Other Confidentiality Obligations

_(Add additional NDAs, security policies, or confidentiality agreements here as they arise)_

---

**Last Updated:** 2026-02-03  
**NDA Retrieved:** 2026-02-03 06:23 UTC  
**Source:** Notion (Intention Alliance → Administrative Info → Non-Disclosure Agreement)

---

_This file is critical workspace context. Read it before any Intention Alliance-related work. More important documentation at "docs" directories._

_(Add additional NDAs, security policies, or confidentiality agreements here as they arise)_

---

**Last Updated:** 2026-02-03  
**NDA Retrieved:** 2026-02-03 06:23 UTC  
**Source:** Notion (Intention Alliance → Administrative Info → Non-Disclosure Agreement)

---

_This file is critical workspace context. Read it before any Intention Alliance-related work. More important documentation at "docs" directories for other organizations and/or projects._
