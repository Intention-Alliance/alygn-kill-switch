# Personal Repositories - Architecture & Documentation

This directory contains all personal project repository documentation, design documents, and architecture overviews for Andler's non-professional work.

⚠️ **CRITICAL:** These are READ-ONLY reference materials. Do NOT edit code in cloned repos. All automation scripts go in `scripts/personal/`.

---

## 📁 Directory Structure

```
personal/
├── professional/        # Career and consulting work
├── personal/            # Creative projects and experiments
└── read-only/           # Cloned repos (NO EDITS ALLOWED)
```

---

## 🎯 Overview

**Owner:** Andler (AndlerRL)  
**Purpose:** Personal creative projects, learning experiments, and professional side work  
**Nature:** Diverse portfolio of technical and creative initiatives

---

## 📂 Subdirectories

### `professional/` — Career & Consulting

**Purpose:** Professional side projects, consulting work, portfolio pieces

**Status:** ⏳ Documentation in progress

**Planned Contents:**
- Consulting project documentation
- Portfolio pieces and case studies
- Professional tools and utilities
- Client work archives (non-confidential)

---

### `personal/` — Creative & Experimental

**Purpose:** Personal creative projects, learning experiments, hobby code

**Status:** ⏳ Documentation in progress

**Planned Contents:**
- Creative coding projects
- Art and design experiments
- Learning repositories (tutorials, practice)
- Hobby projects and side hacks

---

### `read-only/` — Cloned Repositories (NO EDITS)

**Purpose:** Reference copies of personal GitHub repositories

**⚠️ CRITICAL RULES:**
- ❌ **NO editing code** in this directory
- ✅ **ONLY read** for reference and documentation
- ✅ Clone with `--depth 1` (shallow, faster)
- ❌ **NO commits or pushes** from this directory
- ✅ All automation scripts go in `scripts/personal/`

**Personal Repos:**
- Creative projects
- Learning repositories
- Hobby code
- Experiments

**Cloning Best Practice:**
```bash
cd repos/personal/read-only/
git clone --depth 1 https://github.com/AndlerRL/[repo-name].git
```

---

## 🏗️ Architecture Overview

### Blog Publishing System (Planned)

**Purpose:** Automated blog publishing to andler.dev

**Workflow:**
1. Bot prepares markdown + media
2. Cronjob pushes to andler.dev server
3. Server auto-creates blog entries
4. Published content goes live

**Status:** ⏳ Idea captured in Notion (Feb 4, 2026)

**Next Steps:**
1. Implement server endpoint (andler.dev)
2. Create markdown + media preparation script
3. Set up cron integration
4. Test end-to-end publishing flow

**Location (when built):**
- Scripts: `scripts/personal/blog-automation/`
- Content: `content/blog/` (or similar)
- Output: Published to andler.dev

---

### Creative Tools

**Purpose:** Tools for creative work (art, design, music)

**Potential Projects:**
- Image generation utilities
- Audio/music processing scripts
- Design automation (logo generation, etc.)
- Creative coding experiments (generative art)

---

### Learning Projects

**Purpose:** Personal skill development and experimentation

**Areas:**
- New programming languages
- Framework exploration
- Algorithm practice
- Tutorial projects

---

## 📊 GitHub Repositories

**User:** `AndlerRL`

**Personal Repos (Examples):**
- Creative projects
- Learning repositories
- Portfolio pieces
- Hobby hacks

**Daily Tracking:**
- Script: `scripts/personal/daily-tracker.js`
- Schedule: 4:00 AM daily
- Tracks: Commits, PRs, issues (last 24h)

---

## 🔒 Security & Confidentiality

**Public vs. Private:**
- ✅ Most personal repos are public (portfolio, learning)
- ⚠️ Some may contain private experiments
- ✅ Context isolation maintained (Personal ≠ Alygn ≠ BitcashOrg)

**Credential Management:**
- API keys in `config/credentials.json` (NOT in git)
- Personal service tokens (if any) centralized
- No cross-project credential sharing

**See:** `SECURITY.md` for credential management and OpSec guidelines

---

## 🚀 Getting Started (For Development)

**If you need to work on personal projects:**

1. **Clone repo externally** (outside workspace):
   ```bash
   cd $HOME/projects/personal/
   git clone https://github.com/AndlerRL/[repo-name].git
   cd [repo-name]/
   ```

2. **Set up development environment:**
   ```bash
   npm install
   # or
   yarn install
   ```

3. **Reference workspace docs:**
   - Check `docs/personal/` for project guidelines
   - Use `scripts/personal/` for automation
   - Review `repos/personal/professional/` or `personal/` for architecture

4. **Never edit repos in `read-only/`** — always work in external clone

---

## 🎨 Project Categories

### 1. **Portfolio Pieces**
- Showcase projects for professional visibility
- Well-documented, production-ready code
- Deployed live (andler.dev or similar)

### 2. **Creative Experiments**
- Generative art
- Music/audio tools
- Design automation
- Visual projects

### 3. **Learning Projects**
- Tutorial follow-alongs
- Framework exploration
- Algorithm practice
- Code challenges

### 4. **Hobby Hacks**
- Quick weekend projects
- Fun experiments
- Tool prototypes
- Side ideas

---

## 📚 Related Documentation

- **[docs/personal/](../../docs/personal/)** — Personal project docs
- **[scripts/personal/](../../scripts/personal/)** — Automation scripts
- **[SECURITY.md](../../SECURITY.md)** — Security policies
- **[andler.dev](https://andler.dev)** — Personal website/blog

---

## 🛠️ Contribution Guidelines

**For personal project development:**

1. Work in external repo clone (not in workspace)
2. Follow personal coding style (flexible, creative)
3. Document interesting experiments
4. Share portfolio pieces publicly
5. Keep learning projects well-commented

**For workspace documentation:**

1. Update `professional/README.md` or `personal/README.md` as needed
2. Add project docs to `docs/personal/`
3. Keep automation scripts in `scripts/personal/`
4. Document creative tools and utilities

---

## 💡 Ideas & Future Projects

**Captured in Notion:**
- Automated blog publishing system (andler.dev)
- Creative coding portfolio showcase
- Personal knowledge management system
- Design automation tools

**Add your own ideas:**
- Document in `docs/personal/ideas.md`
- Create Notion page for planning
- Start with MVP in external repo
- Automate via `scripts/personal/` when ready

---

_Last updated: 2026-02-10_  
_Owner: Andler (AndlerRL)_  
_Status: Active exploration + creative work_
