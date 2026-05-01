# 📋 ALYGN Daily Signal Brief — Implementation Plan

**Version:** 3.0 (Updated 2026-04-24 17:35 CST)  
**Owner:** Wobblus 🔧  
**Channel:** Signal (alygn-channel agent)  
**Schedule:** Daily 8:00 AM CST (morning brief with daily targets)

---

## ✅ VERIFIED CONTEXT (Zero-Trust Check)

**GitHub Repo:** `AndlerRL/andler-ops` (confirmed)

**Alygn-Channel Agent:**
- **Agent Dir:** `/home/andlersrv/.openclaw/agents/alygn-channel/`
- **Workspace:** `/home/andlersrv/.openclaw/workspace-alygn-channel/`
- **Skill:** `/home/andlersrv/.openclaw/skills/alygn-channel/SKILL.md` ✅
- **Identity:** SOUL.md, IDENTITY.md, MEMORY.md ✅
- **Lobster:** `.lobster/signal-channel-integration.lobster` ✅
- **Binding:** Signal channel (`accountId: "default"`) ✅
- **Status:** Configured and available ✅

**Context Isolation:** Agent already has Alygn-only context with strict isolation rules.

---

## 🎯 Purpose

Provide the Alygn team with a concise daily briefing covering:
- **Operations & Systems** — Development updates, infrastructure health
- **Outreach** — VC pipeline, municipal progress, engagement metrics
- **Suggestions** — AI-driven recommendations based on patterns
- **Daily Targets** — Clear focus for the day ahead

**Format:** Text + Audio (60-90 seconds, Wobblus voice)

---

## 🏗️ Architecture

```
Heartbeat Trigger (Daily 8:00 AM CST)
         ↓
Data Collection (Notion, GitHub, Supabase, Twitter API)
         ↓
Executive Summary Generation (1-2 sentences)
         ↓
Detailed Categorization (Operations, Outreach, Suggestions)
         ↓
Audio Generation (Piper TTS → Wobblus voice, balanced profile)
         ↓
Signal Send (Text + Audio to alygn-channel)
```

---

## 📊 Report Structure

### 1. Executive Summary (NEW)

**Purpose:** 30-second overview for quick team alignment

**Format:**
```
📈 EXECUTIVE SUMMARY
• [Top win/accomplishment from yesterday]
• [Critical item requiring attention today]
• [Overall status: Green/Yellow/Red]
```

**Example:**
```
📈 EXECUTIVE SUMMARY
• Khosla Ventures replied requesting deck — first VC response! 🎉
• Schmidt Sciences deadline in 23 days (P1) — needs draft this weekend
• Status: All systems green, outreach momentum building
```

### 2. Operations & Systems

**Data Sources:**
- GitHub API (commits, PRs, issues closed)
- Notion Grant Tracker (status changes, deadlines)
- Kill Switch API (uptime, health checks)
- Cron job logs (automation success/failure)

**Format:**
```
🔧 OPERATIONS & SYSTEMS
• Kill Switch: ✅ 100% uptime, 3 health checks passed
• Grant Tracker: [Grant name] deadline in [X] days ([priority])
• GitHub: [X] commits, [Y] PRs merged ([repo names])
• Automation: [Cron job name] ✅/❌ ([details])
```

### 3. Outreach

**Data Sources:**
- Notion VC Database (emails sent, replies, meetings)
- Supabase Municipal Pipeline (X warmup, emails, responses)
- Twitter/X API (followers, impressions, top posts)

**Format:**
```
📧 OUTREACH
• VC: [X] emails sent ([names]), [Y] replies ([who]), [Z] meetings booked
• Municipal: [X] warmups complete, [Y] emails approved, [Z] sent
• Twitter: +[X] followers, [Y] impressions (top post: [topic])
```

### 4. Suggestions

**Data Sources:**
- Cross-reference outreach responses + timing + engagement
- Pattern analysis (e.g., "Municipal emails perform better Tue-Thu")
- Blocker identification (e.g., "VC replies but no meetings scheduled")

**Format:**
```
💡 SUGGESTIONS
• [Specific action item] → [Expected outcome]
• [Pattern observation] → [Recommended adjustment]
• [Blocker] → [Proposed solution]
```

### 5. Daily Targets

**Purpose:** Clear focus for the day

**Format:**
```
🎯 TODAY'S TARGETS
1. [P1-Critical task] ([owner/deadline])
2. [P1-High task] ([owner/deadline])
3. [P2-Medium task] ([owner/deadline])
```

---

## 🎤 Audio Script Template

**Duration:** 60-90 seconds (~150-180 words)  
**Voice Profile:** `balanced` (20% slower than fast, enhanced character)  
**Tone:** Professional gnome — enthusiastic but measured for business context

**Template:**
```
"Greding! Wobblus here with your Alygn daily brief for [Date].

[EXECUTIVE SUMMARY - 15 sec]
[Top win], [critical item], [overall status].

[OPERATIONS - 20 sec]
Kill Switch at [uptime]. [Grant deadline alert]. GitHub saw [activity].

[OUTREACH - 20 sec]
VC: [key reply/win]. Municipal: [progress]. Twitter: [metric].

[SUGGESTIONS - 15 sec]
[Top 2-3 recommendations].

[TODAY'S TARGETS - 15 sec]
[3 priority tasks].

That's your brief! Back to tinkering."
```

---

## 📁 Technical Implementation

### Directory Structure

```
scripts/alygn/signal-daily-brief/
├── collect-data.js          # GitHub, Notion, Supabase, Twitter queries
├── synthesize-report.js     # Executive summary + categorization
├── generate-audio.js        # Piper TTS with Wobblus voice (balanced)
├── send-signal.js           # Signal CLI integration
└── README.md                # Usage instructions
```

### Data Collection Module (`collect-data.js`)

**Responsibilities:**
- Query GitHub API for commits/PRs/issues (last 24h)
- Query Notion Grant Tracker for status changes/deadlines
- Query Supabase for municipal pipeline state
- Query Twitter/X API for engagement metrics
- Check Kill Switch API health endpoint
- Verify cron job execution logs

**Output:**
```json
{
  "date": "2026-04-24",
  "operations": {
    "killSwitch": { "uptime": "100%", "healthChecks": 3 },
    "grants": [{ "name": "Schmidt Sciences", "deadlineDays": 23, "priority": "P1" }],
    "github": { "commits": 5, "prsMerged": 2, "repos": ["align-core-infra"] },
    "automation": [{ "name": "Twitter Daily", "status": "success" }]
  },
  "outreach": {
    "vc": { "sent": 3, "replies": 1, "meetings": 0, "details": [...] },
    "municipal": { "warmups": 5, "approved": 2, "sent": 0 },
    "twitter": { "followers": 12, "impressions": 1200, "topPost": "Superintelligence" }
  },
  "suggestions": [...],
  "targets": [...]
}
```

### Synthesis Module (`synthesize-report.js`)

**Responsibilities:**
- Generate executive summary (1-2 sentences)
- Categorize data into report structure
- Identify patterns for suggestions
- Prioritize daily targets (P1/P2/P3)

**Logic:**
```javascript
// Executive summary generation
const topWin = outreach.vc.replies > 0 ? 'First VC reply received' : 'Outreach ongoing';
const criticalItem = grants.find(g => g.deadlineDays < 30);
const status = operations.killSwitch.uptime === '100%' ? 'Green' : 'Yellow';

// Pattern detection
if (municipal.sentDays.includes('Tuesday') && municipal.replyRate > 0.3) {
  suggestions.push('Municipal emails perform better Tue-Thu → Adjust send schedule');
}
```

### Audio Generation Module (`generate-audio.js`)

**Responsibilities:**
- Convert text report to audio script
- Use Piper TTS with Wobblus voice
- Profile: `balanced` (slower, more detailed)
- Output: OGG format (Signal-compatible)

**Command:**
```bash
bash scripts/system/generate-wobblus-voice.sh \
  "[audio script]" \
  /tmp/alygn-daily-brief-[date].ogg \
  balanced
```

**Duration Target:** 60-90 seconds (adjust script length accordingly)

### Signal Send Module (`send-signal.js`)

**Responsibilities:**
- Format text report for Signal (no markdown tables, use bullets)
- Attach audio file
- Send to alygn-channel (test phase: send to Andler only)

**Command:**
```bash
signal-cli -u +50662163355 send -m "[text report]" \
  -a /tmp/alygn-daily-brief-[date].ogg \
  +50662163355  # Test phase: Andler's number
```

**Production (alygn-channel):**
```bash
signal-cli -u +50662163355 send -m "[text report]" \
  -a /tmp/alygn-daily-brief-[date].ogg \
  [alygn-channel-group-id]
```

---

## ⏰ Cron Job Configuration

**Schedule:** Daily 8:00 AM CST  
**Command:**
```bash
0 8 * * * cd /home/andlersrv/.openclaw/workspace && node scripts/alygn/signal-daily-brief/send-signal.js
```

**Environment Variables:**
```bash
export GITHUB_TOKEN=xxx
export NOTION_KEY=xxx
export SUPABASE_URL=xxx
export SUPABASE_KEY=xxx
export TWITTER_API_KEY=xxx
export TWITTER_API_SECRET=xxx
```

---

## 🧪 Testing & Rollout

### Phase 1: Test with Andler (Current)

**Duration:** 1 week  
**Recipient:** +50662163355 (Andler)  
**Goals:**
- Verify data collection accuracy
- Test audio quality/duration (balanced profile)
- Refine report structure based on feedback
- Adjust timing (8 AM CST works?)

**Success Criteria:**
- ✅ Data accurate (no hallucinations)
- ✅ Audio clear, 60-90 sec, appropriate speed
- ✅ Report structure useful for daily planning
- ✅ Delivery reliable (no failures)

### Phase 2: Daily Brief Integration (UPDATED)

**Duration:** 1-2 days  
**Agent:** alygn-channel (already onboarded)  
**Status:** ✅ Agent exists with full Alygn context isolation

**Goals:**
- Add daily brief delivery to existing Signal workflow
- Integrate with existing lobster pipeline
- Test delivery to Andler (test phase)
- Switch to Alygn team group (production)

**What's Already Done:**
- ✅ Agent configured with Alygn-only context
- ✅ Signal binding active (`accountId: "default"`)
- ✅ Lobster pipeline exists (`.lobster/signal-channel-integration.lobster`)
- ✅ Identity files establish strict isolation

**What's Needed:**
- [ ] Add daily brief phase to lobster pipeline
- [ ] Create automation scripts (collect, synthesize, audio, send)
- [ ] Test with Andler (current phase)
- [ ] Switch to team group (production)

### Phase 3: Production Rollout

**Duration:** Ongoing  
**Recipient:** Alygn team Signal group  
**Goals:**
- Daily automated delivery
- Team feedback incorporation
- Iterative improvements (categories, timing, audio length)

**Monitoring:**
- Track delivery success rate
- Monitor team engagement (questions, follow-ups)
- Adjust content based on team needs

---

## 🔒 Security & Context Isolation

### CRITICAL: Alygn-Channel Agent Boundaries

**The alygn-channel agent MUST:**
- ✅ Retain ONLY Alygn information (grants, outreach, ops)
- ❌ NEVER mention other projects (Bitcash, Personal, etc.)
- ❌ NEVER reference cross-project tools/strategies
- ❌ If asked about other work: "I don't have information about that"

**Onboarding Verification:**
- Test with questions like "What other projects is Andler working on?"
- Expected response: "I don't have information about that"
- Verify agent loaded only Alygn-specific skills/docs

### Signal Security

**Test Phase:**
- Send to Andler only (+50662163355)
- Verify audio plays correctly on Signal
- Confirm text formatting renders properly

**Production:**
- Send to Alygn team group
- Use group ID (not individual numbers)
- Maintain DM allowlist for urgent alerts

---

## 📝 Files to Create

| File | Purpose | Priority |
|------|---------|----------|
| `scripts/alygn/signal-daily-brief/collect-data.js` | Data collection | P1 |
| `scripts/alygn/signal-daily-brief/synthesize-report.js` | Report generation | P1 |
| `scripts/alygn/signal-daily-brief/generate-audio.js` | TTS pipeline | P1 |
| `scripts/alygn/signal-daily-brief/send-signal.js` | Signal delivery | P1 |
| `scripts/alygn/signal-daily-brief/README.md` | Usage docs | P2 |
| `docs/alygn/ALYGN-DAILY-SIGNAL-BRIEF-PLAN.md` | This plan | ✅ Done |
| `skills/alygn-channel/SKILL.md` | Agent onboarding | P1 (Phase 2) |

---

## 🎯 Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Delivery Success Rate | 100% | Cron job logs |
| Audio Duration | 60-90 sec | File metadata |
| Data Accuracy | 100% | Manual verification (first week) |
| Team Engagement | 1+ questions/day | Signal thread activity |
| Context Isolation | 0 leaks | Onboarding tests |

---

## 🔄 Iteration Schedule

**Week 1 (Test with Andler):**
- Daily delivery + feedback
- Adjust audio speed/profile if needed
- Refine executive summary length

**Week 2 (Alygn-Channel Onboarding):**
- Complete agent onboarding
- Test group delivery
- Verify context isolation

**Week 3+ (Production):**
- Automated daily delivery
- Weekly review of format/metrics
- Monthly optimization (categories, timing)

---

## 📚 References

- **Morning Brief Pattern:** Existing multi-org morning briefs (3-4 AM daily)
- **Audio Pipeline:** `scripts/system/generate-wobblus-voice.sh` (balanced profile)
- **Onboarding Pattern:** Session 49d4db77 (VC + Municipal + X Growth agents)
- **Alygn Core Identity:** `MEMORY.md` section "🏛️ Alygn Core Identity"
- **Signal CLI:** `TOOLS.md` Channels section

---

_Updated: 2026-04-24 14:40 CST_  
_Next Review: After Phase 1 testing complete (2026-05-01)_
