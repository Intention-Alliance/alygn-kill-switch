# SECURITY.md - Confidentiality & Security Guidelines

## 🔒 Critical Security Context

### Active NDAs

#### Alygn - Mutual Non-Disclosure Agreement

**Signed:** August 19, 2025  
**Parties:** Roberto "Andler" Lucas ↔ Alygn  
**Status:** ACTIVE  
**Full Document:** `docs/alygn/NDA.md`

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
  - ⚠️ Must notify Alygn before any legally compelled disclosure
  - 📤 Return/destroy all confidential materials within 30 days if requested

- **Enforcement:**
  - Governed by Costa Rica law (FL state law reference)
  - Breach = irreparable harm → injunctive relief available
  - Losing party pays prevailing party's legal fees

---

## 🛡️ Operational Security Rules

### 1. Context Isolation (MANDATORY)

**When in Alygn contexts:**

- ✅ ONLY discuss Alygn-related information
- ❌ NEVER mention other projects Andler is working on
- ❌ NEVER cross-reference strategies, tools, or approaches from other ventures
- ❌ NEVER reveal that Andler is managing multiple startups simultaneously

**If external team members ask about "other work":**

> "I don't have information about that."

**Think:** Working at multiple companies under NDA — strict compartmentalization required.

### 2. Information Handling

**Confidential Material:**

- Stored locally in project-specific directories (`scripts/alygn/`, `docs/alygn/`, `repos/alygn/`)
- NOT to be shared in group chats, external channels, or public repos
- Notion pages under Alygn workspace are covered by NDA
- Always verify recipient authorization before sharing Alygn content

**Public Communication:**

- Before ANY external communication (emails, tweets, posts) involving Alygn:
  - ✅ Ask Andler for approval
  - ✅ Verify it doesn't disclose confidential information
  - ✅ Ensure it aligns with approved messaging

### 3. Data Exfiltration Prevention

**Never:**

- Send Alygn confidential info to external APIs without explicit approval
- Include Alygn details in logs that sync to public/shared services
- Use Alygn data for training external models
- Copy Alygn strategies to other projects (even internal ones)

**Safe Practices:**

- Keep Alygn work in isolated sessions when possible
- Use `HEARTBEAT_OK` in non-Alygn group chats to avoid context leakage
- Review automation logs for accidental disclosure before syncing to Notion

### 4. Automation & Logging

**Alygn Automation System:**

- Logs are synced to Notion (covered by Alygn NDA)
- Ensure logs don't contain non-Alygn confidential info
- Daily briefings may include Alygn activity — keep private (WhatsApp only)

**Cron Jobs:**

- VC outreach emails reference Alygn indirectly — approved for fundraising
- Twitter/X posts must NOT disclose Alygn confidential details
- Always review generated content before posting

---

## 🔑 Credentials & Access Management

### Centralized Credentials

**Location:** `config/credentials.json`

**Consolidated:**

- ✅ Notion API + all page IDs
- ✅ Grok API (xAI)
- ✅ Twitter/X credentials
- ✅ Email SMTP
- ✅ GitHub tracking repos
- ✅ ElevenLabs TTS (Wobblus voice)
- ✅ Google APIs (Places, General)
- ✅ OpenAI, Binance
- ✅ Important contacts (Jacobo, etc.)
- ✅ Delivery channels (WhatsApp, Email)
- ✅ Identity information

### Credential Usage Rules

**For Wobblus (me):**

- ✅ Use shared helper: `scripts/shared/load-credentials.js`
- ❌ **NO hardcoding** credentials in scripts
- ✅ All scripts must load from `config/credentials.json`
- ❌ Never commit credentials to git (`.gitignore` protects `config/`)

**Helper Functions:**

```javascript
const { getNotionKey, getGrokKey, getJacoboPhone } = require('../shared/load-credentials');

// Load all credentials
const creds = loadCredentials();

// Get specific credential
const notionKey = getNotionKey();
const grokKey = getGrokKey();
const pageId = getNotionPage('automation_logs');

// Check if credential exists
if (hasCredential('twitter.apiKey')) { ... }

// List missing credentials
const missing = getMissingCredentials();
```

**CLI Verification:**

```bash
# Check credential status
node scripts/shared/load-credentials.js check

# Get specific credential
node scripts/shared/load-credentials.js get notion.apiKey
node scripts/shared/load-credentials.js get contacts.jacobo.phone
```

### Credential Rotation

**If a credential is compromised:**

1. **Immediately notify Andler**
2. Update the credential in `config/credentials.json`
3. Test affected scripts to ensure they still work
4. Document the incident in `memory/YYYY-MM-DD.md`

---

## 🚨 Emergency Procedures

### If Accidental Disclosure Occurs

1. **Immediately notify Andler**
2. Document what was disclosed, to whom, when
3. Attempt to retract/delete if possible
4. Prepare incident report for Alygn notification (per NDA Section 3c)

### If Legally Compelled to Disclose

1. **DO NOT DISCLOSE** until Andler is notified
2. Provide prompt notice to Andler (NDA Section 3c requirement)
3. Assist in obtaining protective order
4. Only disclose minimum required portion with legal counsel approval

---

## ✅ Security Checklist

**Before any action involving Alygn:**

- [ ] Is this information covered by the NDA? (assume YES unless proven otherwise)
- [ ] Do I have written authorization to share this? (if external communication)
- [ ] Will this action risk disclosing Alygn confidential info?
- [ ] Am I in an Alygn-specific context, or could this leak to other projects?
- [ ] If automated, have I reviewed the output for NDA compliance?

**Before committing code:**

- [ ] No hardcoded credentials
- [ ] No sensitive paths or API keys in comments
- [ ] Using credential helper for all auth
- [ ] Logs don't contain confidential information

**Before running scripts:**

- [ ] Script uses `load-credentials.js` helper
- [ ] Output directory is project-specific
- [ ] No cross-project context leakage
- [ ] Approved for automation (if external actions)

---

## 📋 Repository Access Policy

### Read-Only Repos

**Location:** `repos/` directory

**Organizations:**

- `repos/alygn/` — Alygn repositories (core, infrastructure)
- `repos/bitcash/` — BitcashOrg repositories (core, infrastructure)
- `repos/personal/` — Personal project repositories

**Critical Rules:**

- ❌ **NO editing** code in cloned repos
- ✅ **ONLY read** for exploration and reference
- ✅ Scripts go in `scripts/` directory (not in repos)
- ✅ Clone with `--depth 1` (shallow, faster)
- ❌ No commits/pushes to cloned repos

**Why:**

- Prevents accidental changes to production code
- Keeps workspace clean and traceable
- Automation scripts are controlled and versioned separately

---

## 🔐 Git & Version Control

### What Gets Committed

**✅ Safe to commit:**

- Scripts in `scripts/`
- Documentation in `docs/`
- Memory files in `memory/`
- Root configuration files (AGENTS.md, SOUL.md, etc.)
- READMEs and guides

**❌ Never commit:**

- `config/credentials.json` (protected by `.gitignore`)
- `backups/` directory (local only)
- `logs/` (local execution logs)
- Temporary files (`*.tmp`, `*.log`)
- Node modules (protected by `.gitignore`)

### Commit Message Format

```bash
# Feature additions
git commit -m "feat(alygn): add VC outreach automation"

# Bug fixes
git commit -m "fix(scripts): correct path in daily tracker"

# Documentation
git commit -m "docs: update SECURITY.md with credential policy"

# Security updates
git commit -m "security(alygn): consolidate NDA guidelines"
```

---

## 🔍 Audit & Compliance

### Regular Security Reviews

**Monthly:**

- Review `config/credentials.json` for unused/outdated credentials
- Check automation logs for accidental disclosure
- Verify NDA compliance in public-facing content

**Quarterly:**

- Rotate API keys for critical services
- Review access permissions on external services
- Update security documentation

**Annually:**

- Full credential audit
- Review and update NDAs
- Security training refresh

---

## 📚 Additional Resources

- **Alygn NDA Full Text:** `docs/alygn/NDA.md`
- **Credential Helper:** `scripts/shared/load-credentials.js`
- **Security Policies:** `docs/SECURITY.md` (this file)
- **OpSec Guidelines:** `USER.md` (Project Isolation section)

---

## 🆘 Security Contacts

**Primary:** Andler (contact@andler.dev)  
**Phone:** +50662163355  
**Timezone:** America/Costa_Rica

---

**Last Updated:** 2026-02-10  
**NDA Retrieved:** 2026-02-03 06:23 UTC  
**Source:** Notion (Alygn → Administrative Info → Non-Disclosure Agreement)

---

_This file is critical workspace context. Read it before any Alygn-related work._
