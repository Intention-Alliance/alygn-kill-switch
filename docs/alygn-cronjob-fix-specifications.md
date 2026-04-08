# Alygn Outreach Cronjob Fix Specifications

**Date:** 2026-03-30  
**Author:** Dev Lead Subagent  
**Status:** Ready for Review

---

## Executive Summary

Three critical issues were identified in the Alygn outreach cronjob specifications that cause command failures and path resolution errors. This document provides fix specifications **without modifying actual cronjobs**.

---

## Issues Identified

### 1. ❌ `--retry-failed` Flag Doesn't Exist

**Problem:**
Cronjob specifications reference a CLI flag that is not implemented:

```bash
# INVALID - causes command failure
bun bin/alygn-outreach.ts --type=vc --action=send --retry-failed --limit=50
```

**Evidence:**
- The `alygn-outreach.ts` CLI parser (`/home/andlersrv/.openclaw/workspace/skills/alygn-outreach/src/index.ts`) does NOT define `--retry-failed`
- Supported flags are: `--type`, `--action`, `--limit`, `--draft-status`, `--email-send-to`, `--input`, `--dry-run`, `--test-email`, `--validator`, `--region`
- Wave state file confirms: `"reason": "CLI flag --retry-failed does not exist in skill"`

**Fix:**
Replace `--retry-failed` with the working two-filter system:

```bash
# ✅ CORRECT - uses existing flags
bun bin/alygn-outreach.ts --type=vc --action=send --draft-status=Approved --limit=50
```

**Affected Cronjobs:**
- `alygn-vc-afternoon` (currently uses `--retry-failed`)
- `alygn-muni-afternoon` (currently uses `--retry-failed`)

---

### 2. ❌ Wave State Path Resolution Broken

**Problem:**
Cronjob specs use `$HOME/.openclaw/workspace/...` which causes **double expansion**:

```bash
# BROKEN - expands to /home/andlersrv/$HOME/.openclaw/workspace/...
$HOME/.openclaw/workspace/reports/alygn/waves/VC/YYYY-MM-DD.json
```

**Root Cause:**
- Shell expands `$HOME` → `/home/andlersrv`
- But the cronjob spec itself contains literal `$HOME` in a string that gets re-expanded
- Results in: `/home/andlersrv/$HOME/.openclaw/workspace/...` (invalid path)
- Causes **ENOENT** errors when accessing wave files

**Fix Options:**

#### Option A: Use Shell Variable Expansion (Recommended)
```bash
# In shell script context (cron runs bash)
cd "$HOME/.openclaw/workspace" && bun bin/alygn-outreach.ts ...
```

#### Option B: Use Absolute Paths
```bash
# Hardcoded absolute path (less portable)
cd /home/andlersrv/.openclaw/workspace && bun bin/alygn-outreach.ts ...
```

#### Option C: Let Node.js Resolve Paths
```typescript
// In the CLI or pipeline code
import path from 'path';
const workspacePath = path.resolve(process.env.HOME || '', '.openclaw', 'workspace');
```

**Recommendation:** Use **Option A** (shell variable expansion) since cronjobs already run in bash context.

**Affected Paths:**
- `$HOME/.openclaw/workspace/reports/alygn/waves/VC/YYYY-MM-DD.json`
- `$HOME/.openclaw/workspace/reports/alygn/waves/MUNI/YYYY-MM-DD.json`
- `$HOME/.openclaw/workspace/reports/alygn/waves/VC/logs/sent-email-tracker.json`
- `$HOME/.openclaw/workspace/reports/alygn/waves/MUNI/logs/sent-email-tracker.json`

---

### 3. ❌ Missing Pre-Flight Checks

**Problem:**
Cronjobs attempt to send without validating prerequisites, causing silent failures.

**Missing Checks:**

| Phase | Required Check | Consequence if Missing |
|-------|---------------|------------------------|
| **Research** | Wave file exists | ENOENT error, no entities to process |
| **Research** | Entities have `discovered` status | No entities match filter, empty run |
| **Send** | Wave file exists | ENOENT error |
| **Send** | Entities have `Approved` draft status | Sends unapproved drafts (safety violation) |
| **Send** | Entities NOT already sent | Duplicate sends, reputation damage |
| **Send** | SMTP credentials configured | Send failures, no error feedback |

**Fix:**
Add pre-flight validation before each phase (see "Pre-Flight Checklist" below).

---

## Updated Cronjob Command Examples

### VC Afternoon Cronjob (Recovery)

**Before (Broken):**
```bash
cd $HOME/.openclaw/workspace && \
bun bin/alygn-outreach.ts --type=vc --action=send --retry-failed --limit=50
```

**After (Fixed):**
```bash
cd "$HOME/.openclaw/workspace" && \
bun bin/alygn-outreach.ts --type=vc --action=send \
  --draft-status=Approved \
  --limit=50 \
  --input="$HOME/.openclaw/workspace/reports/alygn/vc-waves/$(date +%Y-%m-%d).json"
```

### Municipal Afternoon Cronjob (Recovery)

**Before (Broken):**
```bash
cd $HOME/.openclaw/workspace && \
bun bin/alygn-outreach.ts --type=municipal --action=send --retry-failed --limit=50
```

**After (Fixed):**
```bash
cd "$HOME/.openclaw/workspace" && \
bun bin/alygn-outreach.ts --type=municipal --action=send \
  --draft-status=Approved \
  --limit=50 \
  --input="$HOME/.openclaw/workspace/reports/alygn/muni-waves/$(date +%Y-%m-%d).json"
```

### With Retry Logic (Replaces `--retry-failed`)

```bash
# Step 1: Check for failed entities in wave file
WAVE_FILE="$HOME/.openclaw/workspace/reports/alygn/vc-waves/$(date +%Y-%m-%d).json"

# Step 2: Count entities needing retry
RETRY_COUNT=$(jq '[.data.entities[] | select(.status == "failed" or .status == "personalized")] | length' "$WAVE_FILE")

if [ "$RETRY_COUNT" -gt 0 ]; then
  echo "Found $RETRY_COUNT entities for retry"
  
  # Step 3: Run send with Approved filter (handles both fresh and retry)
  bun bin/alygn-outreach.ts --type=vc --action=send \
    --draft-status=Approved \
    --limit=50 \
    --input="$WAVE_FILE"
else
  echo "No entities require retry"
fi
```

---

## Path Resolution Strategy

### Recommended Approach: Shell Variable Expansion

**Why:** Cronjobs run in bash context where `$HOME` is already defined.

**Implementation:**
```bash
# Wrap all paths in double quotes to preserve expansion
cd "$HOME/.openclaw/workspace"

# Use variable in command args
--input="$HOME/.openclaw/workspace/reports/alygn/vc-waves/$(date +%Y-%m-%d).json"

# Log files
--output="$HOME/.openclaw/workspace/reports/alygn/vc-sent/$(date +%Y-%m-%d).json"
```

### Alternative: Node.js Path Resolution

If cronjobs invoke Node.js scripts directly (not via shell), use this pattern:

```typescript
// In the CLI or pipeline code
import path from 'path';

const WORKSPACE_ROOT = path.resolve(
  process.env.HOME || process.env.USERPROFILE || '',
  '.openclaw',
  'workspace'
);

const waveFile = path.join(
  WORKSPACE_ROOT,
  'reports',
  'alygn',
  'vc-waves',
  `${new Date().toISOString().split('T')[0]}.json`
);
```

**Recommendation:** Use **shell expansion** for cronjob specs (Option A), as they already run in bash.

---

## Pre-Flight Checklist by Phase

### 🔍 Research Phase

```bash
# Pre-flight checks before running research
WAVE_FILE="$HOME/.openclaw/workspace/reports/alygn/vc-waves/$(date +%Y-%m-%d).json"

# 1. Check wave file exists
if [ ! -f "$WAVE_FILE" ]; then
  echo "❌ Wave file not found: $WAVE_FILE"
  exit 1
fi

# 2. Check entities exist with 'discovered' status
DISCOVERED_COUNT=$(jq '[.data.entities[] | select(.status == "discovered")] | length' "$WAVE_FILE")

if [ "$DISCOVERED_COUNT" -eq 0 ]; then
  echo "ℹ️  No discovered entities to research"
  exit 0  # Clean exit, not an error
fi

echo "✅ Found $DISCOVERED_COUNT entities to research"
```

### ✉️ Send Phase

```bash
# Pre-flight checks before running send
WAVE_FILE="$HOME/.openclaw/workspace/reports/alygn/vc-waves/$(date +%Y-%m-%d).json"

# 1. Check wave file exists
if [ ! -f "$WAVE_FILE" ]; then
  echo "❌ Wave file not found: $WAVE_FILE"
  exit 1
fi

# 2. Check entities have 'Approved' draft status
APPROVED_COUNT=$(jq '[.data.entities[] | select(.draftStatus == "Approved" and .status == "personalized")] | length' "$WAVE_FILE")

if [ "$APPROVED_COUNT" -eq 0 ]; then
  echo "ℹ️  No approved drafts to send"
  exit 0  # Clean exit
fi

# 3. Check for already-sent entities (avoid duplicates)
SENT_COUNT=$(jq '[.data.entities[] | select(.status == "sent")] | length' "$WAVE_FILE")
echo "⚠️  Warning: $SENT_COUNT entities already sent (will be skipped)"

# 4. Check SMTP credentials (optional but recommended)
if [ -z "$SMTP_HOST" ] || [ -z "$SMTP_USER" ]; then
  echo "❌ SMTP credentials not configured"
  exit 1
fi

echo "✅ Ready to send $APPROVED_COUNT emails"
```

### 🔁 Recon/Retry Phase

```bash
# Pre-flight checks for retry logic
WAVE_FILE="$HOME/.openclaw/workspace/reports/alygn/vc-waves/$(date +%Y-%m-%d).json"

# 1. Check wave file exists
if [ ! -f "$WAVE_FILE" ]; then
  echo "❌ Wave file not found: $WAVE_FILE"
  exit 1
fi

# 2. Count failed entities
FAILED_COUNT=$(jq '[.data.entities[] | select(.status == "failed")] | length' "$WAVE_FILE")

# 3. Count exhausted entities (skip these)
EXHAUSTED_COUNT=$(jq '[.data.entities[] | select(.status == "exhausted")] | length' "$WAVE_FILE")

# 4. Calculate retryable entities
RETRYABLE=$((FAILED_COUNT - EXHAUSTED_COUNT))

if [ "$RETRYABLE" -eq 0 ]; then
  echo "ℹ️  No entities to retry ($EXHAUSTED_COUNT exhausted)"
  exit 0
fi

echo "✅ Found $RETRYABLE entities to retry ($EXHAUSTED_COUNT exhausted, skipping)"
```

---

## Summary of Changes Required

| Cronjob | Current Command | Fixed Command |
|---------|----------------|---------------|
| `alygn-vc-afternoon` | `--retry-failed --limit=50` | `--draft-status=Approved --limit=50 --input=<wave-file>` |
| `alygn-muni-afternoon` | `--retry-failed --limit=50` | `--draft-status=Approved --limit=50 --input=<wave-file>` |
| **Path Resolution** | `$HOME/.openclaw/workspace` (broken) | `"$HOME/.openclaw/workspace"` (quoted for shell expansion) |
| **Pre-flight** | None | Add checks per phase (see above) |

---

## Next Steps

1. **Review** this specification with the team
2. **Update** cronjob definitions in OpenClaw config (not covered here)
3. **Test** with `--dry-run` flag before enabling production sends
4. **Monitor** first few runs for path resolution and approval workflow

---

## References

- CLI Source: `/home/andlersrv/.openclaw/workspace/skills/alygn-outreach/src/index.ts`
- Pipeline Source: `/home/andlersrv/.openclaw/workspace/skills/alygn-outreach/src/core/Pipeline.ts`
- Wave State: `/home/andlersrv/.openclaw/workspace/reports/alygn/vc-waves/wave-state.json`
- Cronjob Specs: `/home/andlersrv/.openclaw/workspace/docs/cronjobs/`
