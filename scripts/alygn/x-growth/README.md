# Alygn X/Twitter Growth - Script Structure

**Purpose:** Alygn-specific Twitter automation with parser, research, content generation, and strategic posting.

**Skill:** `alygn-x-growth` (🏛️📣)

---

## Directory Structure

```
x-growth/
├── parser/
│   ├── twitter-content-parser.js    # Parses Grok markdown → workflow JSON
│   ├── workflow-validator.js        # Validates workflow JSON before posting
│   └── PARSER-*.md                  # Parser development logs
├── research/
│   ├── trend-analyzer.js            # Analyzes X trends for Alygn correlation
│   └── discovery-engine.js          # Discovers relevant accounts/topics
├── content/
│   ├── thread-generator.js          # Generates threads from Grok prompts
│   ├── reply-strategy.js            # Strategic reply generation
│   └── pre-approved-posts.json      # 100 institutional posts (sequential)
├── posting/
│   ├── x-api-executor.js            # X API v2 posting (tweets, replies, quotes)
│   ├── browser-executor.ts          # Browser-based posting (fallback)
│   └── format-enforcer.js           # Enforces mandatory tweet format
└── workflows/
    ├── daily-growth.lobster         # Daily execution workflow
    └── discovery-cycle.lobster      # Trend discovery + engagement
```

---

## Daily Workflow (8 Phases)

1. **Phase 1:** Pre-approved institutional post (X API)
2. **Phase 2:** Content generation (Grok Prompts #1 + #13)
3. **Phase 3:** Parse content (markdown → workflow JSON)
4. **Phase 4:** Post original content (X API with format enforcement)
5. **Phase 5:** Browser discovery (explore trends)
6. **Phase 6:** Decision engine (Grok evaluation)
7. **Phase 7:** Post discovery content (quotes/replies)
8. **Phase 8:** Summary report (Discord thread)

---

## Mandatory Tweet Format

Every tweet MUST end with:
```
[Content]

[1-3 hashtags from: #AIGovernance, #AIAlignment, #AISafety, #AGI, #AIPolicy, #AIEthics, #AIRisk]

more at @aialygn
```

---

## Integration with Lobster

Execute daily workflow:
```bash
lobster run alygn-x-growth.lobster
```

Resume after approval:
```bash
lobster resume --token <token> --approve yes
```

---

**Updated:** 2026-03-01
**Status:** Refactoring in progress
