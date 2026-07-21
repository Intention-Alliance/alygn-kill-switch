# HEARTBEAT.md — Image-Router Build + Cross-Channel Workstate

**Purpose:** Cross-channel workstate + tick protocol. NOT a status report. The HEARTBEAT is the *control surface* (what to do on each tick); status is reported on the relevant channel only when needed.

**Frequency:** Every heartbeat tick (default 30 min; cron-driven via parked DM `1466578242109706282`).

**Channel routing (locked 2026-07-20 15:12 CST):**
- **Image-router build + R-items + PR reviews** → this DM session
- **Blog content pipeline** (12 articles, Notion rewrite) → `#branding` session
- **UI/UX Designer Agent + pending skills revisions** → `#design` session

**Contact:** <contact@andler.dev>

<!-- DYNAMIC_SECTION_START -->

_Auto-rendered at 2026-07-21 23:28 UTC on `feat/image-router-build`._

_No active branches (all merged into master)._

### Workboard
- **ready** (17)
  - `aa14d2d1` [andler-landing#136-B1] B1 — Migrate ParallaxProjectCard → FloatingGlassCard with gold focus treatment
  - `0950717c` [andler-landing#136-A2] A2 — About page mobile layout fix (team grid + timeline padding)
  - `49bffda6` [andler-landing#136-A3] A3 — Projects index mobile layout fix (filter bar + card grid + impact metrics)
  - `ec05830f` [andler-landing#136-A5] A5 — Blog index mobile layout fix (hero + sections)
  - `062b78e1` [andler-landing#136-A6] A6 — Blog detail mobile layout fix (article + headings + code blocks)
- **blocked** (2)
  - `164527f8` '[andler-landing#93] Lint: track all 80 Biome errors (143 warnings) — accessibility + correctness sweep'
  - `8ca30875` [andler-landing#ADR-012] App-side pipeline must be consumer-only (no Notion in app)

_No active subagents._

### Today's cost: $0.00 of $1.00 daily cap

<!-- DYNAMIC_SECTION_END -->

---

## 🫀 HEARTBEAT TICK PROTOCOL (silent unless escalation needed)

This is what runs on every tick. Do not narrate each step; just do it.

1. **Read this file top-to-bottom** to recover session context.
2. **Check active subagents** via `subagents list` (recentMinutes=15) AND `sessions_list` for any persistent session-mode agents. Note which session keys are live.
3. **For each live subagent**, decide:
   - **Already completed (status=done, recent report seen)** → no action. Move on.
   - **Still running, no report yet** → wait one more tick. If 2 ticks silent, `sessions_send` a status check.
   - **Failed** → read the failure detail. If gateway restart (1012/1006), re-spawn with same task. If model error or wrong output, fix task and re-spawn.
4. **Check git state** on the relevant branch for the active workstream (image-router: `~/.openclaw/skills/image-router/` on `feat/image-router-build`). New commit since last tick = forward progress, no report needed.
5. **Check `~/.openclaw/workspace/.staging/image-router/ledger.jsonl`** — if the day's spend crosses 50% of $1.00, ping Andler in the appropriate channel with a single cost summary line. Otherwise silent.
6. **Decide: report or stay silent.**
   - **Silent** (default, 95% of ticks): `HEARTBEAT_OK` to parked DM `1466578242109706282`. No other output.
   - **Report** (escalation only): if a subagent failed twice, a step is blocked on a real blocker, daily cap will be hit, or Andler-direct requires a status reply. Report on the **channel of the workstream**, NOT in HEARTBEAT. Example: image-router status → this DM; blog pipeline status → `#branding`; designer-agent status → `#design`.
7. **Update this file** with any state change (new commit, step transition, new blocker, archive moves). Keep edits surgical — replace only the changed section, do not rewrite the whole file.
8. **Update the `_Updated:` footer** at the bottom of this file with the current CST timestamp.

**Anti-patterns to avoid in HEARTBEAT updates:**
- ❌ Repeating the same status snapshot tick after tick. If nothing changed, do not write.
- ❌ Writing "Step 3 in progress" without the commit SHA or session key. State changes are dated + sourced.
- ❌ Polling (`sessions_history`, `subagents list`) more than once per tick. If the runtime note says "do not poll, wait for push", then don't.
- ❌ Long session previews in HEARTBEAT. Move long reports to `docs/reports/` or the channel.
- ❌ Reporting channel-routed work in HEARTBEAT. Blog pipeline state lives in `#branding`, not here.

---

## 🔄 AGENT PICKUP LOGIC (no narration, just dispatch)

**Ping-pong protocol:** Spawn agent with tight task + clear deliverable → `sessions_yield` → wait for push event → on completion, read result + decide next dispatch in same turn.

**Re-spawn rule:** If a subagent fails with `gateway closed (1012/1006)`, re-spawn with the **same task verbatim**. Gateway restarts are not the agent's fault and don't invalidate the task. If a subagent fails with a model error or wrong output, fix the task brief before re-spawning.

**File organization:**
- `batch-scripts/` for internal automation (gitignored)
- `docs/` for operation summaries (sanitized, no secrets)
- `docs/samples/` for completed work samples after scrubbing
- `docs/heartbeat-archive/` for completed HEARTBEAT sections (digest)
- `docs/reports/` for long per-step reports (image-router ADR, blog mini-reports, designer-agent outputs)

**Queued messages:** When agent is busy, messages queue. Multiple "Continue where you left off" stack — process ALL in chronological order via `sessions_history` if needed.

---

# Active Work

## 🎯 IMAGE-ROUTER BUILD (2026-07-20 — ACTIVE, this session)

**Source:** `docs/plans/IMAGE-ROUTER-2026-07-20.md` (DRAFT v0.3, 12KB) + `docs/adr/IMAGE-ROUTER-ADR-2026-07-20.md` (Hugrukal, 515 lines, 11 sections, Andler answered 10/10 open questions in §11).

**Step status (live):**
- ✅ **Step 1** `type_resolver.py` — `bb00f0a`, 10/10 tests
- ✅ **Step 2** `cost_ledger.py` — `c12fbd1`, 6/6 tests
- ✅ **Step 3** `fal_client.py` — `87c9834`, 8/8 tests
- ✅ **Step 4** `lib/upload_reference.py` — `6019939`, 6/6 tests
- ✅ **Step 5** `lib/call_fal.py` — `5f17fe4`, 7/7 tests
- ✅ **Step 6** `lib/call_nano_banana.py` — `6cc1b02`, 7/7 tests
- ✅ **Step 7** `generate_image_router.py` — `1602c81`, 13/13 tests
- ✅ **Step 8** `SKILL.md` — `798cb31` (docs only)
- ✅ **Step 9** `references/*.md` — `6949402` (type-matrix.md + fal-endpoints.md, 72 lines each)
- ✅ **Build COMPLETE** — 9/9 atomic commits, 57/57 self-tests pass cumulative (10+6+8+6+7+7+13)
- ⏳ **Step 10** (out of build, **blocked on Andler-direct**): Gimblich (fe-coder) runs 5 verification tests A/B/C/D/E on `feat/image-router-build` (~$0.46 actual Fal spend)
- ⏳ **Step 11** (out of build): Nikaya (reviewer) quality gate
- ⏳ **Step 12** (out of build, Andler-direct review of comparison images)
- 🚫 **Step 13** `andlergm-thumbnail.lobster` migration — **BLOCKED** until Step 12 green + Andler-direct

**Hard rules (locked, Andler §11):**
- No code from Wobblus. Spec → build → review → approve → migrate.
- `andlergm-thumbnail.lobster` NOT touched until Step 12 green + Andler-direct.
- Daily $1.00 USD cap, global across all types (§11.5).
- FAL_API_KEY (not FAL_KEY), sourced from `~/.openclaw/.env` (§11.8).
- DI for type→model mapping: v4 default, v3 on low budget OR explicit request (§11.1).
- Dry-run only when explicitly passed; 24h wall-block from approval, Andler reviews by 2026-07-20 23:00 CST (§11.2).
- infogram accepts BOTH Mermaid codeblocks AND image-reference reimagination (§11.3), via designer-agent prompts.
- Multiple character refs: fail gracefully, designer-agent picks best single ref (§11.7).
- type vs photo distinction: routing by art direction (portrait → movie/short/reel/mobile-cuts), not just Fal API type (§11.9).
- Fallback input-image: DI maps `--input-image` to `--input` for nano-banana-pro shell-out (§11.10).

**5 verification tests (cost budget):**
- A: portrait (founder painted) → Flux 2 Pro 2K ~$0.30
- B: type (scam-incidents cover) → Ideogram V4 QUALITY 2K ~$0.06
- C: character (Talanara fierce-no-bg ref) → Ideogram Character 2K ~$0.05
- D: infogram (AUR architecture) → Ideogram V4 BALANCED 2K ~$0.05
- E: icon (4-6 service-card icons) → Gemini 3 Pro 1K free
- **Total: ~$0.46 of $1.00 daily cap.** Comfortable headroom.

**Pickup logic (next tick, no narration):**
- Step 2 commit `c12fbd1` exists → re-verify with `python3 ~/.openclaw/skills/image-router/scripts/test_cost_ledger.py` → if PASS, spawn Step 3.
- Step 3 commit lands → re-verify + spawn Step 4.
- After Step 9 lands → notify Andler in this channel with the 9 commit SHAs + final smoke test output. **Do not auto-spawn Step 10 (Gimblich 5-test run)** — wait for Andler-direct.
- Daily cap crosses $0.50 → single-line cost ping to this channel.

**Out of scope (do NOT touch in this session):** R-items, PR reviews, Blog content, UI/UX Designer Agent, andlergm-thumbnail.lobster migration.

---

## 🎯 BLOG CONTENT PIPELINE REWRITE (2026-07-20 15:19–16:25 CST — ACTIVE, #branding session)

**Source:** Notion `Blog Content Pipeline` DB `35133487-4af6-811e-aaae-e1a69fbcfaea`. 14 articles: 11 Draft + 1 Review + 2 Ready.

**State lives in #branding, not here.** This entry is for cross-session visibility only. Heartbeat in this DM does NOT poll the blog pipeline — that's the `#branding` session's job. When blog hits "all 12 marked Review", Wobblus main session will receive a push event with the link.

**Locked contract (2026-07-20 15:50 CST):**
- Option C: 12 articles marked `Status=Review` (NOT Ready). Build adapter is separate workstream.
- Build adapter: cron 1/day + ISR on `/blog` navigation. Captures `Status=Ready` at build time.

**Asset plan:** 4 assets per article (WebP base64 via `image_generate`), 48 total. Page-property `Assets` (rich_text for now) gets JSON-stringified asset plan.

**Out of scope this session:**
- `andler-blog-pipeline` webhook handler
- `andler-landing` build-time Notion → MDX adapter
- 2 Ready articles ("Why Your LLM Safety Layer Needs Hardware Enforcement", "Zero-Trust AI Infrastructure") — stay Ready

---

## 🫀 PR/Issue reply queue (this session)

[empty — Andler-direct driven only]

## 🫀 Pending R-items (separate session, parked here for visibility)

- **R1** about-hero.tsx (use existing parallax-hero from brandkit) → Gimblich
- **R5** en.json L73 ("How We Think" rewrite, human-in-the-loop emphasis) → Talanara
- **R7** #127 figma + section-stacking + JSDoc follow-up → Chanshuk
- **R10** contact-banner.tsx (restore primary-bg glass + remove mocked fns) → Gimblich — re-verify; may have been superseded by #141
- **R6-followup** R-items batch 2: 5 remaining agent bios (volthiz/rokthar/zuldrak/thalgrim/zyxali) → Talanara

**Status:** WIP with Andler. **NOT dispatched in this session.** Image-router build is the active job; R-items are next-up once image-router hits Step 12.

---

## 🫀 Heartbeat reply-queue log (rolling, last 7 days)

### 2026-07-12 10:48 CST (cron-event, Discord direct) — 32nd no-op
- **Trigger:** OpenClaw cron heartbeat, chat_id=`user:856709050824392714` (Andler DM)
- **State:** workspace HEAD `c19cbf6f` on `fix/gh-reply-queue-cron-bugs`. `master @ ff3e07f6`. WOBBLUS_AUTONOMY_BOUNDARY unset.
- **Open PRs:** #130 (MERGEABLE, Vercel team-membership), #129 (MERGEABLE, same), #128 (CONFLICTING), #125 (AndlerRL, MERGEABLE, 22 commits/49 files).
- **Action:** `HEARTBEAT_OK` to parked DM. Silent.
- **Quiet window:** 94h13m since Andler last surfaced in #core.

### 2026-07-08 06:48 CST (cron-event, Discord direct)
- **Trigger:** OpenClaw cron heartbeat
- **State:** PR #113 MERGED (`04a28e3`). PR #126 rebased to `24252b3`, MERGEABLE, both reviews passed (Chanshuk ✅, Nikaya 97/100 ✅). Vercel deploy FAILED (same @wobblus not-on-Vercel-team permission block).
- **Action:** `HEARTBEAT_OK`. No commits, no PR comments, no dispatches.

---

## 🫀 Session pickup logic (silent, no narration)

1. **Cron-event in parked DM** → run the tick protocol above + `HEARTBEAT_OK` to parked DM `1466578242109706282`. Single message. No spam.
2. **Andler-direct in this DM** → image-router build (next step in sequence) + R-items once image-router hits Step 12.
3. **Andler-direct in #branding** → that session owns it. This DM does not interfere.
4. **Andler-direct in #design** → that session owns it. This DM does not interfere.
5. **Active subagent in session mode** → `sessions_send` status check, never poll.
6. **Nothing new since last check (< 30 min)** → `HEARTBEAT_OK`. Do not write.

---

## ⚠️ HEARTBEAT CHANNEL ROUTING (locked 2026-07-08 19:18 CST, refreshed 2026-07-20 15:12 CST)

- Cron heartbeats resolve to `chat_id=user:856709050824392714` → bound DM `1466578242109706282` (parked disclosure DM).
- The `channel: 1481025340842446898` parameter on `message` is **ignored** in cron-event context — Discord tool always routes to bound DM.
- **Default:** live with parked DM. One `HEARTBEAT_OK` per tick. Other channels get reports only when workstream-specific escalations fire.
- Workarounds if Andler-directs change routing: (b) update cron `payload` to set `sessionTarget: 'session:<id>'`; (c) update cron to bind to a different account.

---

## 📋 COMMUNICATION DISCIPLINE (during active work)

- **Heartbeat ticks:** silent (`HEARTBEAT_OK` to parked DM). No narration, no full status dump, no channel-routed reports in HEARTBEAT.
- **Agent completions:** immediate acknowledgment on the **channel of the workstream** (this DM for image-router, #branding for blog, #design for designer). Next-step in same reply.
- **Blockers:** escalate on the workstream channel within 5 min. If image-router blocked, this DM. If blog blocked, #branding. If designer blocked, #design.
- **User escalations:** only when team cannot resolve. Channel-routed, not in HEARTBEAT.

**File update discipline:**
- `HEARTBEAT.md` — surgical edits only (replace changed sections, not full rewrite). Update `_Updated:` footer every tick where state changed.
- `memory/YYYY-MM-DD.md` — session logs, decisions, agent reports.
- `docs/reports/` — long per-step reports (image-router step-by-step, blog mini-reports, designer-agent outputs).
- `docs/heartbeat-archive/` — completed HEARTBEAT sections (digest).

---

_Updated: 2026-07-21 00:44 CST (image-router build COMPLETE — 9/9 commits, 57/57 tests; Step 10 blocked on Andler-direct; HEARTBEAT was stale through Steps 3-9, this patch restores accuracy)_
_Archive: docs/heartbeat-archive/2026-07-20-completed.md (19KB, 16 sections)_
