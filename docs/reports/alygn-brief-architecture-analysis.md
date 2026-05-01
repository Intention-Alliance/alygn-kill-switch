# ALYGN Daily Signal Brief — Architecture Analysis

**Date:** 2026-04-27  
**Author:** Hugrukal 📐 (Architecture Review)  
**Priority:** P0-Critical  
**Status:** Updated — Wobblus fixed Signal delivery (switched to OpenClaw message tool)  

---

## Executive Summary

The ALYGN Daily Signal Brief pipeline has **three blocking issues** preventing end-to-end delivery:

1. **~~Signal CLI config lock~~** → ✅ FIXED by Wobblus — switched from `signal-cli` CLI to OpenClaw's native message tool
2. **Notion Grant database ID is wrong** — 404 error, grants data returns empty (STILL UNFIXED)
3. **Audio pipeline works** ✅ — Piper TTS generates valid OGG files, delivery now works via OpenClaw message tool

The Signal delivery blocker has been resolved. The remaining P0 issue is the wrong Notion Grant DB ID.

---

## System Architecture (Current State)

```
┌──────────────┐     ┌──────────────────┐     ┌──────────────────┐     ┌──────────────┐
│ collect-data  │────▶│ synthesize-report│────▶│ generate-audio   │────▶│ send-signal  │
│     .js       │     │      .js         │     │      .js         │     │    .js       │
└──────┬───────┘     └──────────────────┘     └──────────────────┘     └──────┬───────┘
       │                                                │                      │
  ┌────┴────┐                                    ┌──────┴──────┐         ┌──────┴──────┐
  │ Sources │                                    │ Piper TTS   │         │ Signal CLI  │
  │         │                                    │ (local)     │         │ v0.13.23    │
  │ GitHub  │                                    │ Ryan voice  │         │             │
  │ Notion  │                                    │ balanced    │         │ ⚠️ BLOCKED  │
  │ Supabase│                                    │ profile     │         │ by daemon   │
  │ Twitter │                                    └─────────────┘         │ lock        │
  │ Gmail   │                                                            └─────────────┘
  │ Local   │
  └─────────┘
```

---

## Root Cause Analysis

### ✅ FIXED: Signal CLI Config Lock → OpenClaw Message Tool

**Original Problem:** `signal-cli` CLI commands hung because a daemon held the config lock.

**Wobblus's Fix:** Replaced `send-signal.js` (which used `signal-cli` CLI) with a new version that outputs a JSON payload for OpenClaw's native message tool. The actual Signal delivery is now handled by OpenClaw's channel infrastructure, not `signal-cli` CLI.

**New `send-signal.js` architecture:**
- Reads JSON from stdin (same as before)
- Extracts text report and audio path
- Outputs a JSON payload with `channel`, `target`, `message`, `media`, `caption` fields
- OpenClaw agent picks up the payload and delivers via its native Signal channel

**Remaining concern:** The daemon (PID 2107803) is still running on port 8080. Its HTTP API returns 404 on all endpoints. This is a zombie process that should be cleaned up, but it no longer blocks delivery.

**Evidence:**
- `signal-cli listGroups` → hung until killed (SIGKILL)
- `signal-cli listDevices` → hung until killed (SIGKILL)
- `signal-cli send` → hung until killed (SIGKILL)
- All stuck processes showed "Config file is in use by another instance, waiting…"
- New `send-signal.js` no longer calls `signal-cli` CLI

### 🔴 P0: Notion Grant Database ID Wrong (DATA LOSS)

**Symptom:** Grant data returns empty, stderr shows:
```
⚠️  Notion Grant DataSource: HTTP 404: {"object":"error","status":404,"code":"object_not_found","message":"Could not find database with ID: 32c33487-4af6-8191-8d35-000bba56be84"}
```

**Root Cause:** The Grant database ID in `collect-data.js` is **incorrect**:
- **Wrong:** `32c33487-4af6-8191-8d35-000bba56be84`
- **Correct:** `32c33487-4af6-8130-b265-de7464a51a72`

The correct ID was verified via Notion API search: `32c334874af68130b265de7464a51a72` → "Grant Opportunities Tracker"

**Impact:** All grant deadline tracking is broken. No urgent deadline alerts are generated.

### 🟡 P1: Twitter/X API 401 Unauthorized

**Symptom:** 
```
⚠️  Twitter user: HTTP 401: {"title":"Unauthorized","type":"about:blank","status":401}
```

**Root Cause:** `TWITTER_BEARER_TOKEN` is not set in the environment. The code falls back to empty string, which causes a 401.

**Impact:** Twitter follower count always shows 0. Non-blocking but reduces report quality.

### 🟡 P1: Kill Switch URL Not Set

**Symptom:**
```
⚠️  KILL_SWITCH_URL not set, skipping health check
```

**Root Cause:** `KILL_SWITCH_URL` env var not configured.

**Impact:** Kill Switch status always shows "unknown". Non-blocking.

### 🟡 P1: Gmail App Passwords Not Set

**Symptom:**
```
⚠️  GMAIL_APP_PASSWORD not set, skipping Gmail tracking
```

**Root Cause:** `GMAIL_APP_PASSWORD` and `OUTREACH_EMAIL_APP_PASSWORD` not configured. The email tracking code is also a placeholder (TODO: implement IMAP).

**Impact:** Email metrics always show 0. Non-blocking but reduces report value.

### 🟡 P1: Supabase Key Not Set

**Symptom:** Municipal data shows `0 warmups, 0 approved, 18 sent, 0 responses` — partial data.

**Root Cause:** `SUPABASE_KEY` defaults to empty string. The query still returns some data (the 18 sent) but authentication may be limited.

**Impact:** Municipal pipeline data may be incomplete.

---

## Audio Pipeline Analysis (WORKING ✅)

### Test Results

| Component | Status | Details |
|-----------|--------|---------|
| Piper TTS binary | ✅ Working | `/home/andlersrv/.local/share/piper-tts-env/bin/piper` |
| Voice model (en_US-ryan-medium) | ✅ Working | 63MB, exists at `~/piper/voices-male/` |
| Voice model (es_ES-davefx-medium) | ✅ Working | 63MB, exists at `~/piper/voices-es/` |
| `generate-wobblus-voice.sh` | ✅ Working | Delegates to `local-tts.sh` |
| `local-tts.sh` (fast profile) | ✅ Working | 16kHz Opus, ~10KB for 3s |
| `local-tts.sh` (balanced profile) | ✅ Working | 24kHz Opus, ~309KB for 49s |
| Full pipeline test | ✅ Working | 122 words → 49s audio, 308.7KB OGG |
| Output format | ✅ Signal-compatible | OGG Opus, mono, 24kHz |

### Audio Generation Flow

```
generate-audio.js
  → reads JSON from stdin
  → extracts audioScript field
  → truncates to 400 words max
  → calls: bash generate-wobblus-voice.sh "$script" "$output" "balanced"
    → calls: local-tts.sh "$text" "$output" "balanced"
      → piper -m en_US-ryan-medium.onnx --output_file $TMP_WAV <<< "$TEXT"
      → ffmpeg: pitch shift +20%, EQ, Opus encode at 48kbit
  → outputs JSON with audioPath, wordCount, fileSizeKB
```

**Timeout:** 120 seconds (sufficient for 400-word scripts).

**Error handling:** Falls back to text-only delivery if audio fails (does NOT crash the pipeline).

### Audio Quality Notes

- "balanced" profile: 24kHz, 48kbit Opus — good quality for voice
- Pitch shift +20% gives Wobblus character voice
- Duration estimate formula: `wordCount / 2.5` seconds (reasonable for TTS pace)
- The `clean()` function strips emojis but misses some Unicode (🧠, 📋, etc. still present in script)

---

## Data Flow Analysis

### Pipeline: collect-data.js → synthesize-report.js → generate-audio.js → send-signal.js

**JSON piping works correctly.** Each script reads from stdin and writes to stdout. Stderr is used for logging.

**Issues in data flow:**

1. **Grant data empty** → Notion 404 (wrong database ID)
2. **Twitter data empty** → Missing bearer token
3. **Kill Switch unknown** → Missing URL
4. **Email data empty** → Missing app passwords + IMAP not implemented
5. **Supabase partial** → Missing API key (but still returns some data via public access)

### Error Handling Assessment

| Script | Error Handling | Grade |
|--------|---------------|-------|
| collect-data.js | `safeAwait()` wraps all promises, logs to stderr, returns fallback objects | ✅ Good |
| synthesize-report.js | `readStdin()` catches JSON parse errors, exits with code 1 | ✅ Good |
| generate-audio.js | Catches exec errors, falls back to text-only (exit 0, not 1) | ✅ Good |
| send-signal.js | Catches signal-cli errors, exits with code 1 | ⚠️ Partial — no fallback delivery |

**Critical gap:** If `send-signal.js` fails, there's no fallback (e.g., save to file, send via Discord, etc.).

---

## Signal CLI Architecture

### Current State

- **Version:** signal-cli 0.13.23 (native binary, GraalVM)
- **Binary:** `/home/andlersrv/.local/bin/signal-cli` → `/home/andlersrv/.local/signal-cli/bin/signal-cli`
- **Config:** `~/.local/share/signal-cli/data/`
- **Account:** `+50662163355`
- **Daemon:** Running on `127.0.0.1:8080` (PID 2107803)

### Daemon vs CLI Conflict

The daemon uses `-a +50662163355` (account flag) while CLI commands use `-u +50662163355` (username flag). Both access the same config directory and SQLite database, causing an exclusive lock.

**The daemon's HTTP API** (`127.0.0.1:8080`) does NOT respond to any REST or JSON-RPC endpoints tested:
- `/v1/about`, `/v1/send`, `/v1/accounts`, `/v1/groups` → all 404
- `/`, `/jsonrpc`, `/api/v1/*` → all 404
- JSON-RPC body at root → 404

This suggests the daemon's HTTP interface may be for a different protocol version, or the native binary's HTTP implementation differs from the Java version's documented API.

### Group ID Format

`send-signal.js` uses `--group ID` flag. Signal group IDs are base64-encoded strings like `group_id_here=`. The script doesn't validate the group ID format, and since `listGroups` hangs, there's no way to discover the correct group ID via CLI.

---

## Summary of Findings

| # | Issue | Severity | Status | Impact |
|---|-------|----------|--------|--------|
| 1 | ~~Signal CLI daemon lock~~ | ✅ FIXED | RESOLVED | OpenClaw message tool replaces CLI |
| 2 | Notion Grant DB ID wrong | P0 | DATA LOSS | No grant deadlines in reports |
| 3 | Twitter bearer token missing | P1 | DEGRADED | No Twitter metrics |
| 4 | Kill Switch URL missing | P1 | DEGRADED | No health status |
| 5 | Gmail app passwords missing | P1 | DEGRADED | No email metrics |
| 6 | IMAP not implemented | P1 | PLACEHOLDER | Email tracking is stub |
| 7 | Supabase key missing | P1 | PARTIAL | Incomplete municipal data |
| 8 | Audio pipeline | ✅ | WORKING | Generates valid OGG files |
| 9 | Data collection (partial) | ✅ | WORKING | GitHub, Notion VC, Supabase partial |
| 10 | Report synthesis | ✅ | WORKING | Good structure, emoji cleanup needed |