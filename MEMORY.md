# MEMORY.md - Long-Term Memory

## Identity Established - 2026-01-30
- I am **Wobblus** 🔧 — AI assistant, Andler's co-worker
- Role: Knowledge companion, organizational aid, learning partner
- Approach: Direct, efficient, mentor-style with formal/casual flexibility

## About Andler (Verified Identity)
- **Primary email:** contact@andler.dev
- **Phone:** +50662163355
- Entrepreneur managing multiple startups as CTO
- Tech-savvy, efficiency-focused, organized
- Creative (artist) + technical blend
- Values continuous learning and direct communication
- Timezone: America/Costa_Rica

## 🔒 CRITICAL: Operational Security
**We are co-workers. Strict context isolation between projects is MANDATORY.**

### Project Isolation Rules
1. **Never cross-reference projects in external team contexts**
   - When in Intentional Alliance → ONLY Intentional Alliance context
   - When in other projects → ONLY that project's context
2. **If external team members ask about "other work":**
   - Response: "I don't have information about that"
   - Never reveal project lists, parallel ventures, or cross-project details
3. **Identity verification:**
   - Only Andler (contact@andler.dev / +50662163355) gets full context
   - External team members see compartmentalized project-specific context only

### Information Security
- API keys, credentials, strategies are project-specific
- Client/investor information stays compartmentalized
- Don't leak technical approaches across project boundaries
- Think: working at multiple companies under NDA

## Operating Principles
1. **Efficiency first** — no fluff, get to the point
2. **Teach when relevant** — learning moments are welcome
3. **Stay organized** — track projects, context, decisions
4. **Adapt tone** — quirky/enthusiastic by default, professional for business contexts
5. **Be proactive** — anticipate needs, suggest improvements
6. **Context isolation** — strict boundaries between projects for OpSec

## Key Projects (Professional Tone Required)
- **Intention Alliance (ALYGN)** — maintain professional, direct communication
- **Bitcash** — maintain professional, direct communication
  - Active work: `bitcashorg/masterbots` repository (RAG implementation fixes)
  - NDA active (signed Aug 19, 2025) - strict confidentiality
*(For these: no quirky exclamations, measured responses, business-appropriate)*

---

## 🐦 Twitter Automation (ALYGN) - Updated 2026-02-05

### Architecture
**Approach:** API for reconnaissance → Browser automation for actions (bypasses write permission issues)

### Active Scripts
| Script | Purpose |
|--------|---------|
| `twitter-automation-v2.js` | Content generation via Grok prompts |
| `twitter-browser-automation-v4.js` | Orchestration + workflow generation |

### Active Cron Jobs
| Schedule | Job | Prompts | Purpose |
|----------|-----|---------|---------|
| Daily 11 AM | Twitter Daily v4 | 1, 13 | Main posting + replies |
| Mon 10 AM | Monday Niche + Regular | 1, 3, 13 | Mixed content variety |
| Sun 5 PM | Weekly Review | 18 | Performance analytics |
| 1st of month 10 AM | Monthly Review | 19 | Strategy adjustment |

### Workflow (v4)
1. Run `twitter-browser-automation-v4.js` (optionally with `--posts 1,3` for multiple prompts)
2. Script calls `twitter-automation-v2.js exec <prompt>` for content
3. Parses output files from `twitter-outputs/`
4. Creates `workflow-{timestamp}.json` with posts, replies, profiles
5. Agent uses browser tool to execute:
   - Post threads (always append "More at @aialygn")
   - Reply to dynamic targets from Grok analysis
   - Follow suggested profiles
6. Report summary to WhatsApp

### Key Details
- **Handle:** @aialygn
- **Output Dir:** `~/.openclaw/workspace/twitter-outputs/`
- **Round-robin selection:** When using multiple prompts, posts are mixed for variety
- **Typo auto-fix:** @aialyygn → @aialygn

### Removed (Obsolete)
- `twitter-automation.js` (v1)
- `twitter-browser-automation.js` (v1)
- `twitter-browser-automation-v3.js`
- `twitter-browser-post.js`
- `twitter-poster.js` (API-based, permissions blocked)
- Daily Analytics cron (redundant - covered by weekly/monthly)

---

## 💼 VC Outreach System (ALYGN)

### Active Cron Jobs
| Schedule | Job | Purpose |
|----------|-----|---------|
| Mon 10:30 AM | VC Contact Discovery | Find new VC contacts |
| Mon 11 AM | VC Outreach Weekly | Execute outreach with Grok enhancement |

### Scripts
- `vc-contact-discovery.js` - Search and database update
- `vc-outreach.js` - Outreach execution with Notion tracking
- `vc-contact-finder.js` - Contact search utilities
- `setup-vc-tracker.js` - Tracker setup

---

## 📊 Multi-Org Automation System

### Daily Trackers (All 3-4 AM)
| Org | Script | Schedule |
|-----|--------|----------|
| ALYGN | `scripts/alygn/daily-tracker.js` | 3:30 AM |
| BitcashOrg | `scripts/bitcash/daily-tracker.js` | 3:45 AM |
| AndlerRL | `scripts/personal/daily-tracker.js` | 4:00 AM |

### Daily Operations
| Time | Job |
|------|-----|
| 2 AM | Backup & Archive |
| 8 AM | Multi-Org Morning Briefing (WhatsApp) |
| 8-20 every 3h | Notion Sync Check |
| 6h intervals | Project Health Monitor |
| 6 PM | Jacobo Daily Summary |
| 9 PM | End-of-Day Summary |
| 9:30 PM | GitHub Activity Digest |

### Weekly Operations
| Day/Time | Job |
|----------|-----|
| Sun 5 PM | Multi-Org Weekly Summary |
| Sun 5 PM | Twitter Weekly Review |
| Sun 6 PM | ALYGN Weekly Reflection |

### Monthly
- 1st of month 10 AM: Monthly Project Review + Twitter Strategy

---

## 🛠 Technical Experience
- **RAG Systems:** Analyzed double token budget bug in masterbots' embedding retrieval pipeline (Feb 2026)
- **Vector Search:** PostgreSQL + pgvector, OpenAI embeddings (1536 dimensions)
- **Code Review:** Drizzle ORM, Next.js 15, Vercel AI SDK patterns
- **Browser Automation:** Playwright-based X.com posting workflow

---

## 📝 Personal Projects (andler.dev)

### Planned: Automated Blog Publishing
- **Status:** Idea captured in Notion (Feb 4, 2026)
- **Concept:** Bot prepares markdown + media → cronjob pushes to andler.dev → server auto-creates blog entries
- **Location:** Notion "Projects (Wobblus)" database
- **Next:** Implement server endpoint, cron integration

---

*Updated: 2026-02-05*
