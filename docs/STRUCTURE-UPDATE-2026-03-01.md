# Structure Update - 2026-03-01

## Overview
Separated Twitter/X automation into **project-specific** (Alygn) and **general-purpose** (multi-project) skills and scripts.

---

## Skills Structure

### Alygn-Specific
```
skills/alygn-x-growth/
├── SKILL.md (renamed from x-twitter-growth)
└── README.md
```

**Purpose:** Alygn's daily Twitter operations with hardcoded institutional voice, mandatory format, and pre-approved posts.

### General-Purpose
```
skills/x-growth/
├── SKILL.md (new, from scratch)
└── README.md
```

**Purpose:** Multi-project Twitter growth automation. Configurable voice, format, and topics per project.

---

## Scripts Structure

### Alygn Scripts
```
scripts/alygn/x-growth/
├── README.md
├── daily-summary.js (new)
├── parser/
│   ├── twitter-content-parser.js (moved)
│   ├── workflow-validator.js (new)
│   └── PARSER-*.md (moved)
├── research/
│   ├── decision-engine.js (moved from twitter-discovery/)
│   └── trend-analyzer.js (TODO)
├── content/
│   ├── thread-generator.js (TODO)
│   ├── reply-strategy.js (TODO)
│   └── pre-approved-posts.json (moved)
├── posting/
│   ├── x-api-executor.js (moved)
│   ├── browser-executor.ts (moved)
│   ├── format-enforcer.js (new)
│   └── post-pre-approved.js (moved)
└── workflows/
    └── daily-growth.lobster (TODO)
```

### General Scripts
```
scripts/x-growth/
├── README.md
├── daily-growth.js (TODO)
├── trend-discovery.js (TODO)
├── content-generator.js (TODO)
├── reply-engine.js (TODO)
├── format-validator.js (TODO)
└── projects/
    └── template.json (TODO)
```

---

## Lobster Workflows

### Alygn Workflow
```
.lobster/alygn-x-growth-daily.lobster (new)
```

**Phases:**
1. Pre-approved post
2. Grok content generation
3. Parse markdown → JSON
4. Validate workflow
5. Format enforcement
6. Post original content
7. Browser trend discovery
8. Decision engine
9. Post engagement (replies/quotes)
10. Discord summary

### General Workflow
```
.lobster/x-growth-daily.lobster (new)
```

**Phases:**
1. Load project config
2. Trend discovery
3. Content generation
4. Validation
5. Posting
6. Engagement
7. Reporting

---

## Key Differences

| Feature | `alygn-x-growth` | `x-growth` |
|---------|------------------|------------|
| **Context** | Hardcoded Alygn | Configurable per project |
| **Voice** | Institutional, governance-first | Project-defined |
| **Signature** | `more at @aialygn` (mandatory) | Configurable |
| **Hashtags** | Fixed list (#AIGovernance, etc.) | Project-defined |
| **Pre-approved** | 100 institutional posts | None (dynamic only) |
| **Parser** | Alygn-specific markdown | Generic parser |
| **Format** | Strict enforcement | Flexible validation |

---

## Migration Status

### Completed ✅
- [x] Renamed skill `x-twitter-growth` → `alygn-x-growth`
- [x] Created new skill `x-growth` (skeleton)
- [x] Created directory structure for both
- [x] Moved existing scripts to new locations
- [x] Created `workflow-validator.js`
- [x] Created `format-enforcer.js`
- [x] Created `daily-summary.js`
- [x] Created Lobster workflows (both)
- [x] Created READMEs for all directories

### Pending ⏳
- [ ] Move remaining scripts (twitter-*.js, twitter-*.ts, etc.)
- [ ] Create `thread-generator.js`
- [ ] Create `reply-strategy.js`
- [ ] Create `trend-analyzer.js`
- [ ] Create general scripts (`daily-growth.js`, etc.)
- [ ] Create project config template
- [ ] Test Lobster workflows
- [ ] Update documentation

---

## Next Steps

1. **Complete script migration** - Move all remaining Twitter scripts to new structure
2. **Create missing scripts** - Implement TODO items
3. **Test workflows** - Run Lobster workflows with mocks (no credentials needed yet)
4. **Document usage** - Update main README with new structure
5. **Wait for credentials** - Test end-to-end once APIs are available

---

**Updated:** 2026-03-01 03:15 CST
**Status:** Structure created, migration in progress
