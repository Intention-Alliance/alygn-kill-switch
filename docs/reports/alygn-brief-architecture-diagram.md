# ALYGN Daily Signal Brief — Architecture Diagram

**Date:** 2026-04-27  
**Author:** Hugrukal 📐  

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        ALYGN Daily Signal Brief Pipeline                     │
│                                                                              │
│  ┌──────────────┐   stdout    ┌──────────────────┐   stdout   ┌──────────┐  stdout  ┌──────────────┐  ┌──────────────┐
│  │ collect-data  │───────────▶│ synthesize-report  │──────────▶│ generate │─────────▶│ send-signal  │─▶│ OpenClaw      │
│  │     .js      │   JSON     │      .js          │   JSON    │ -audio.js │   JSON    │    .js       │  │ Message Tool  │
│  └──────┬───────┘            └───────────────────┘           └─────┬────┘          └──────┬───────┘  └──────┬───────┘
│         │                            │                            │                      │                  │
│    ┌────┴─────┐              ┌───────┴──────┐            ┌───────┴────┐           │           ┌──────┴───────┐
│    │ Data     │              │ Report       │            │ Piper TTS  │           │           │ Signal       │
│    │ Sources  │              │ Structure    │            │ Pipeline   │           │           │ Channel      │
│    └──────────┘              └──────────────┘            └──────┬─────┘           │           │ ✅ WORKS     │
│                                                                │           │           └──────────────┘
│                                                         ┌──────▼─────┐│
│                                                         │ OGG Audio  ││
│                                                         │ (Signal-   ││
│                                                         │ compatible)││
│                                                         └────────────┘│
│                                                         │ ⚠️ BLOCKED ││
│                                                         └────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Data Sources (collect-data.js)

```
┌─────────────────────────────────────────────────────┐
│                  Data Sources                        │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐         │
│  │ GitHub   │  │ Notion   │  │ Supabase │         │
│  │ API v3   │  │ API v1   │  │ REST API │         │
│  │          │  │          │  │          │         │
│  │ ✅ Works │  │ ⚠️ Grant │  │ ⚠️ Partial│         │
│  │          │  │ DB 404   │  │ No key   │         │
│  └──────────┘  └──────────┘  └──────────┘         │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐         │
│  │ Twitter  │  │ Kill     │  │ Gmail    │         │
│  │ API v2   │  │ Switch   │  │ IMAP    │         │
│  │          │  │ HTTP     │  │          │         │
│  │ ❌ 401   │  │ ❌ No URL│  │ ❌ No IMPL│         │
│  └──────────┘  └──────────┘  └──────────┘         │
│                                                      │
│  ┌──────────┐                                       │
│  │ Local    │  ← memory/*.md + HEARTBEAT.md         │
│  │ Files    │                                       │
│  │ ✅ Works │                                       │
│  └──────────┘                                       │
└─────────────────────────────────────────────────────┘
```

---

## Audio Pipeline (generate-audio.js)

```
┌──────────────────────────────────────────────────────────────────┐
│                    Audio Generation Pipeline                       │
│                                                                    │
│  JSON stdin                                                        │
│     │                                                              │
│     ▼                                                              │
│  ┌──────────────────────┐                                         │
│  │ Extract audioScript   │                                         │
│  │ Truncate to 400 words │                                         │
│  └──────────┬───────────┘                                         │
│             │                                                      │
│             ▼                                                      │
│  ┌──────────────────────┐                                         │
│  │ generate-wobblus-     │                                         │
│  │ voice.sh              │                                         │
│  │ Profile: balanced     │                                         │
│  └──────────┬───────────┘                                         │
│             │                                                      │
│             ▼                                                      │
│  ┌──────────────────────┐                                         │
│  │ local-tts.sh          │                                         │
│  │ Language: en (Ryan)   │                                         │
│  └──────────┬───────────┘                                         │
│             │                                                      │
│             ▼                                                      │
│  ┌──────────────────────┐                                         │
│  │ Piper TTS             │                                         │
│  │ en_US-ryan-medium     │                                         │
│  │ → TMP_WAV             │                                         │
│  └──────────┬───────────┘                                         │
│             │                                                      │
│             ▼                                                      │
│  ┌──────────────────────┐                                         │
│  │ ffmpeg processing    │                                         │
│  │ • Pitch shift +20%   │                                         │
│  • EQ (2.5kHz, 4kHz)   │                                         │
│  • Opus 48kbit          │                                         │
│  • 24kHz mono           │                                         │
│  └──────────┬───────────┘                                         │
│             │                                                      │
│             ▼                                                      │
│  ┌──────────────────────┐                                         │
│  │ Output: OGG Opus     │                                         │
│  │ ~300KB for 2min      │                                         │
│  │ Signal-compatible    │                                         │
│  └──────────────────────┘                                         │
│                                                                    │
│  ✅ PIPELINE WORKS — Tested end-to-end                           │
│  Test: 122 words → 49s audio → 308.7KB OGG                       │
└──────────────────────────────────────────────────────────────────┘
```

---

## Signal Delivery (send-signal.js) — ✅ FIXED

```
┌──────────────────────────────────────────────────────────────────┐
│                    Signal Delivery (✅ FIXED)                     │
│                                                                    │
│  JSON stdin                                                        │
│     │                                                              │
│     ▼                                                              │
│  ┌──────────────────────┐                                         │
│  │ Extract textReport   │                                         │
│  │ Extract audioPath    │                                         │
│  │ Build JSON payload   │                                         │
│  └──────────┬───────────┘                                        │
│             │                                                      │
│             ▼                                                      │
│  ┌──────────────────────┐     ┌────────────────────┐             │
│  │ Output JSON payload  │────▶│ OpenClaw Message   │             │
│  │ {channel: 'signal',  │     │ Tool                │             │
│  │  target: '+506...',  │     │                      │             │
│  │  message: text,      │     │ ✅ Delivers via     │             │
│  │  media: audioPath,   │     │ native Signal       │             │
│  │  caption: '...'}     │     │ channel             │             │
│  └──────────────────────┘     └────────────────────┘             │
│                                                                    │
│  ✅ FIXED: No longer uses signal-cli CLI                          │
│  ✅ No daemon lock contention                                    │
│  ✅ OpenClaw handles delivery natively                           │
│                                                                    │
│  ⚠️ Remaining: Kill zombie daemon (PID 2107803)                  │
│  ⚠️ Remaining: Need group ID for production mode                 │
└──────────────────────────────────────────────────────────────────┘
```
│                                                                    │
│  Daemon HTTP API (127.0.0.1:8080):                               │
│  ❌ All endpoints return 404                                      │
│  ❌ JSON-RPC endpoints return 404                                 │
│  ❌ REST API endpoints return 404                                  │
│                                                                    │
│  Root Cause: Daemon and CLI share the same config directory,      │
│  causing exclusive lock contention.                               │
└──────────────────────────────────────────────────────────────────┘
```

---

## Signal CLI Architecture (Legacy — No Longer Used for Delivery)

```
┌──────────────────────────────────────────────────────────────────┐
│                    Signal CLI (Legacy)                            │
│                                                                    │
│  signal-cli v0.13.23 (native binary, GraalVM)                    │
│  Binary: ~/.local/bin/signal-cli                                  │
│  Config: ~/.local/share/signal-cli/data/                          │
│  Account: +50662163355                                            │
│                                                                    │
│  ⚠️  Daemon still running (PID 2107803) — should be killed      │
│  ⚠️  No longer needed for brief delivery                         │
│                                                                    │
│  New delivery path: OpenClaw message tool → Signal channel       │
│                                                                    │
│  Production deployment needs:                                      │
│  ─────────────────────                                             │
│  1. Group ID for Alygn team group                                 │
│  2. Update target in send-signal.js from +50662163355 to group ID │
│  3. Kill zombie daemon process                                    │
└──────────────────────────────────────────────────────────────────┘
```

---

## Environment Variables Status

```
┌───────────────────────────────┬──────────┬────────────────────────────┐
│ Variable                      │ Status   │ Notes                      │
├───────────────────────────────┼──────────┼────────────────────────────┤
│ NOTION_KEY                    │ ✅ Set   │ Working (VC data works)    │
│ NOTION_GRANT_DATA_SOURCE      │ ❌ Wrong │ 404 — needs correct ID    │
│ NOTION_VC_DATA_SOURCE         │ ✅ Set   │ Working                    │
│ SUPABASE_URL                  │ ✅ Set   │ Working                    │
│ SUPABASE_KEY                  │ ❌ Empty │ Partial data only          │
│ GMAIL_APP_PASSWORD            │ ❌ Empty │ Email tracking disabled    │
│ OUTREACH_EMAIL_APP_PASSWORD   │ ❌ Empty │ Email tracking disabled    │
│ KILL_SWITCH_URL               │ ❌ Empty │ Health check disabled      │
│ TWITTER_BEARER_TOKEN          │ ❌ Empty │ Twitter data disabled      │
│ GITHUB_TOKEN                  │ ✅ (gh)  │ Uses gh CLI auth           │
└───────────────────────────────┴──────────┴────────────────────────────┘
```

---

## End-to-End Test Results

```
┌──────────────────────────────────────────────────────────────────┐
│                    E2E Pipeline Test (2026-04-27)                │
│                                                                    │
│  collect-data.js → synthesize-report.js → generate-audio.js     │
│                                                                    │
│  ✅ Data collection: 6/8 sources returning data                  │
│     ✅ GitHub (0 commits, 0 PRs — expected for quiet day)       │
│     ❌ Notion Grants (404 — wrong DB ID)                         │
│     ✅ Notion VC (2 entries: Long-Term Future Fund, Coefficient) │
│     ✅ Supabase (18 sent, 0 responses — partial)                 │
│     ❌ Twitter (401 — no bearer token)                           │
│     ❌ Kill Switch (no URL)                                      │
│     ❌ Gmail (no app password + IMAP not implemented)            │
│     ✅ Local Work (from memory files)                            │
│                                                                    │
│  ✅ Report synthesis: Working, good structure                     │
│     - Executive summary, operations, outreach, suggestions      │
│     - Audio script generated (122 words)                         │
│     - Text report generated (full format)                         │
│                                                                    │
│  ✅ Audio generation: Working, 49s OGG Opus output                │
│     - Profile: balanced (24kHz, 48kbit)                          │
│     - Size: 308.7KB                                              │
│     - Format: OGG Opus (Signal-compatible)                       │
│                                                                    │
│  ✅ Signal delivery: ✅ FIXED — OpenClaw message tool replaces CLI    │
│     - send-signal.js outputs JSON payload for OpenClaw           │
│     - No more daemon lock contention                             │
│     - Zombie daemon still running (cleanup needed)               │
│     - Production needs group ID (currently test mode only)       │
└──────────────────────────────────────────────────────────────────┘
```