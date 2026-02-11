# Alygn Repositories - Architecture & Documentation

This directory contains all Alygn-related repository documentation, design documents, and architecture overviews.

⚠️ **CRITICAL:** These are READ-ONLY reference materials. Do NOT edit code in cloned repos. All automation scripts go in `scripts/alygn/`.

---

## 📁 Directory Structure

```
alygn/
├── core/                # Core product documentation
│   ├── grok-conversations/       # AI automation system docs
│   ├── intention-alliance-overview.pdf
│   └── README.md        # Project overview (mission, principles)
├── infrastructure/      # Infrastructure and deployment docs
└── read-only/           # Cloned repos (NO EDITS ALLOWED)
```

---

## 🎯 Project Overview

**Name:** Alygn (also known as "Intention Alliance" in external docs)  
**Mission:** Humanizing technology by empowering people online  
**Nature:** Protocol (not just a technology solution)

### Core Values

1. **Freedom of Speech** — Decentralized journalism and communication
2. **Freedom of Intentions** — Ethical monetization of online intentions
3. **Freedom of Attention** — Protecting users from attention exploitation

### Key Contributions

- Monetizing decentralized journalism
- Ethical intention-based advertising
- Attention optimization (user choice in content)
- New income sources for individuals and platforms

---

## 📂 Subdirectories

### `core/` — Product Design & Documentation

**Purpose:** Core product architecture, design philosophy, and protocol documentation

**Contents:**
- **README.md** — Project mission, principles, core contributions
- **intention-alliance-overview.pdf** — Foundation document (1.7 MB)
- **grok-conversations/** — AI automation system documentation
  - Conversation templates for Grok-enhanced workflows
  - Prompt engineering guidelines
  - Content generation strategies

**Key Documents:**
- Mission statement and protocol philosophy
- Freedom principles (speech, intentions, attention)
- Alliance model (governance, stakeholders)

---

### `infrastructure/` — Deployment & DevOps

**Purpose:** Infrastructure documentation, deployment guides, CI/CD pipelines

**Status:** ⏳ Documentation in progress

**Planned Contents:**
- Deployment architecture diagrams
- CI/CD pipeline configurations
- Infrastructure-as-code (Terraform, Ansible, etc.)
- Monitoring and observability setup
- Scaling and performance optimization

---

### `read-only/` — Cloned Repositories (NO EDITS)

**Purpose:** Reference copies of GitHub repositories for exploration and documentation

**⚠️ CRITICAL RULES:**
- ❌ **NO editing code** in this directory
- ✅ **ONLY read** for reference and documentation
- ✅ Clone with `--depth 1` (shallow, faster)
- ❌ **NO commits or pushes** from this directory
- ✅ All automation scripts go in `scripts/alygn/`

**Why?**
- Prevents accidental changes to production code
- Keeps workspace clean and traceable
- Automation scripts are version-controlled separately

**Repositories (Expected):**
- `Intention-Alliance/align-core-infra`
- `Intention-Alliance/license-app`
- `Intention-Alliance/docs`
- `Intention-Alliance/examples`

**Cloning Best Practice:**
```bash
cd repos/alygn/read-only/
git clone --depth 1 https://github.com/Intention-Alliance/align-core-infra.git
```

---

## 🏗️ Architecture Overview

### Product Architecture

**Alygn as a Protocol:**

1. **Alliance Layer** — Governance and stakeholder coordination
2. **Intention Layer** — Ethical monetization of user intentions
3. **Attention Layer** — User-controlled content curation
4. **Journalism Layer** — Decentralized content creation and distribution

**Technical Stack (Expected):**
- Frontend: React/Next.js
- Backend: Node.js (possibly serverless)
- Blockchain: Ethereum/Polygon (for monetization)
- AI: Grok (content generation, personalization)
- Database: PostgreSQL, Redis (caching)

**Integration Points:**
- Social media platforms (Twitter/X, Facebook, Instagram)
- Payment processors (Stripe, crypto wallets)
- Content management systems
- Analytics and tracking

---

### Automation System

**Location:** `core/grok-conversations/`

**Purpose:** AI-powered automation for Alygn operations

**Components:**
1. **Content Generation** — Grok-enhanced prompts for Twitter, blog posts
2. **VC Outreach** — Automated investor discovery and personalization
3. **Engagement** — Strategic replies, follows, and community building

**Scripts:** `scripts/alygn/x-twitter/`, `scripts/alygn/vc-outreach/`

---

## 📊 GitHub Repositories

**Organization:** `Intention-Alliance`

**Key Repos:**
- **align-core-infra** — Core infrastructure and backend
- **license-app** — Licensing application
- **docs** — Project documentation
- **examples** — Example implementations

**Personal Repos (Alygn-related):**
- **AndlerRL/ai-agents-server** — AI agent coordination
- **AndlerRL/ai-powered-creative-hub** — Creative tools

**Daily Tracking:**
- Script: `scripts/alygn/daily-tracker.js`
- Schedule: 3:30 AM daily
- Tracks: Commits, PRs, issues (last 24h)

---

## 🔒 Security & Confidentiality

**⚠️ NDA Active:** Alygn Mutual Non-Disclosure Agreement (signed Aug 19, 2025)

**Confidential Material:**
- All files in this directory are covered by the NDA
- Do NOT share externally without written authorization
- Context isolation MANDATORY (no cross-project leakage)

**See:** `SECURITY.md` for full NDA terms and OpSec guidelines

---

## 🚀 Getting Started (For Development)

**If you need to work on Alygn code:**

1. **Clone repo externally** (outside workspace):
   ```bash
   cd ~/projects/
   git clone https://github.com/Intention-Alliance/align-core-infra.git
   cd align-core-infra/
   ```

2. **Set up development environment:**
   ```bash
   npm install
   # or
   yarn install
   ```

3. **Reference workspace docs:**
   - Read `repos/alygn/core/README.md` for project overview
   - Check `docs/alygn/` for integration guidelines
   - Use `scripts/alygn/` for automation

4. **Never edit repos in `read-only/`** — always work in external clone

---

## 📚 Related Documentation

- **[core/README.md](./core/README.md)** — Project mission and principles
- **[core/intention-alliance-overview.pdf](./core/intention-alliance-overview.pdf)** — Foundation document
- **[docs/alygn/](../../docs/alygn/)** — Alygn-specific documentation
- **[scripts/alygn/](../../scripts/alygn/)** — Automation scripts
- **[SECURITY.md](../../SECURITY.md)** — NDA and security policies

---

## 🛠️ Contribution Guidelines

**For Alygn development:**

1. Work in external repo clone (not in workspace)
2. Follow project coding standards
3. Test locally before pushing
4. Create feature branches for new work
5. Submit PRs with clear descriptions

**For workspace documentation:**

1. Update `core/README.md` for project changes
2. Add architecture docs to `infrastructure/`
3. Keep automation scripts in `scripts/alygn/`
4. Document integration points in `docs/alygn/`

---

_Last updated: 2026-02-10_  
_Project: Alygn (Intention Alliance)_  
_Status: Active development + VC fundraising_
