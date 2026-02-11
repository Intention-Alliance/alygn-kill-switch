# Documentation Hub

This directory contains organization-specific documentation, instructions, roles, guidelines, and reference materials for the workspace.

---

## 📁 Directory Structure

```
docs/
├── alygn/              # ALYGN documentation
├── bitcashorg/         # BitcashOrg documentation
├── personal/           # Personal project documentation
├── system/             # System-wide documentation
├── SECURITY.md         # Security policies (symlink to root)
└── README.md           # This file
```

---

## 🔖 Organization-Specific Documentation

### `alygn/`

**Purpose:** ALYGN-related instructions, roles, guidelines, and integration docs

**Contents:**
- **Instructions:** How to execute ALYGN-specific tasks
- **Roles:** Expertise and responsibilities within ALYGN
- **Guidelines:** Integration guides, output instructions
- **Security:** ALYGN NDA and confidentiality specifics (see also `SECURITY.md`)
- **Reference:** Notion page IDs, contact info, meeting notes

**Key Files:**
- `NDA.md` — Full Alygn Non-Disclosure Agreement
- Integration guides for VC outreach, Twitter automation
- Team roles and contact information

---

### `bitcashorg/`

**Purpose:** BitcashOrg-related documentation

**Contents:**
- Technical specifications
- Integration guides
- Repository documentation (references to `repos/bitcash/`)
- Development guidelines
- API documentation

**Key Files:**
- Repository overviews
- Development workflow docs
- BitcashOrg-specific processes

---

### `personal/`

**Purpose:** Personal project documentation

**Contents:**
- Professional consulting documentation
- Personal creative project notes
- Blog post drafts
- Learning resources
- Experiment logs

**Key Files:**
- Blog publishing system docs
- Personal project roadmaps
- Creative work references

---

### `system/`

**Purpose:** System-wide documentation and guides

**Contents:**
- Workspace architecture documentation
- Cronjob setup guides
- Automation system overviews
- General utilities and helpers
- Cross-organization processes

**Key Files:**
- Workspace structure guides
- Cron job management docs
- Backup and recovery procedures

---

## 🔒 Security Documentation

**`SECURITY.md`** (symlink to root `SECURITY.md`)

Contains:
- Active NDAs (Alygn, future partners)
- Operational security rules
- Context isolation guidelines
- Credential management policies
- Emergency procedures
- Security checklists

**Critical:** Read `SECURITY.md` before any Alygn-related work.

---

## 📝 Documentation Guidelines

### When to Create Documentation

**Create docs when:**
- Setting up a new integration or service
- Documenting a complex process
- Recording important decisions
- Establishing team roles or contacts
- Defining security or compliance requirements

**Don't over-document:**
- Scripts should be self-documenting (clear variable names, comments)
- Simple one-off tasks don't need full docs
- Use `memory/YYYY-MM-DD.md` for daily notes, not formal docs

### Where to Put Documentation

| Type of Documentation | Location |
|-----------------------|----------|
| ALYGN-specific | `docs/alygn/` |
| BitcashOrg-specific | `docs/bitcashorg/` |
| Personal projects | `docs/personal/` |
| System/workspace-wide | `docs/system/` |
| Security/NDAs | `SECURITY.md` (root) |
| Daily notes | `memory/YYYY-MM-DD.md` |
| Long-term memory | `MEMORY.md` (root) |

### Documentation Format

**Markdown Guidelines:**

- Use clear headings (`#`, `##`, `###`)
- Include a table of contents for long docs
- Use code blocks with syntax highlighting
- Add examples and use cases
- Link to related documentation

**Structure:**

```markdown
# Document Title

## Overview
Brief description of what this doc covers.

## Prerequisites
What you need before following this guide.

## Instructions
Step-by-step guide with examples.

## Reference
Links to related docs, APIs, or external resources.

## Troubleshooting
Common issues and solutions.

---
_Last updated: YYYY-MM-DD_
```

---

## 🔗 Related Resources

- **[Root README](../README.md)** — Workspace overview
- **[SECURITY.md](../SECURITY.md)** — Security policies and NDAs
- **[AGENTS.md](../AGENTS.md)** — How Wobblus operates
- **[TOOLS.md](../TOOLS.md)** — Tool configurations and setups
- **[repos/README.md](../repos/README.md)** — Repository overview

---

## 🆘 Need Help?

**For documentation questions:**
- Check existing docs in the relevant org directory
- Review `MEMORY.md` for historical context
- Ask Andler for clarification

**For security/NDA questions:**
- Always refer to `SECURITY.md`
- When in doubt, ask Andler before sharing

---

_Last updated: 2026-02-10_  
_Structure: Context-driven organization_
