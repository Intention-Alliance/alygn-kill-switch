# Script Audit - Duplicate & Legacy Detection

**Date:** 2026-02-10  
**Purpose:** Identify duplicate/legacy scripts and consolidate

---

## 🔍 Findings

### Duplicate Scripts Found

#### 1. Morning Briefing (SYSTEM)

**Files:**
- `scripts/system/morning-briefing.js` (159 lines) - **UPDATED** with local TTS
- `scripts/system/morning-briefing-v2.js` (358 lines) - **IN USE** by cron

**Cron Job:** Uses `morning-briefing-v2.js` (bun scripts/system/morning-briefing-v2.js)

**Issue:** I updated the wrong file! The cron is using v2, but I updated the base version.

**Resolution:**
- Compare both scripts
- Merge best features into `morning-briefing.js` (no version suffix)
- Update cron to use `morning-briefing.js`
- Delete `morning-briefing-v2.js`

---

#### 2. Twitter Automation (ALYGN)

**Files:**
- `scripts/alygn/x-twitter/twitter-automation-v2.js` (production version)
- No base version found

**Status:** v2 is the current production version (not a duplicate)

**Resolution:** Rename to `twitter-automation.js` (remove v2 suffix for clarity)

---

#### 3. Daily Trackers (Multiple)

**Files:**
- `scripts/alygn/daily-tracker.js`
- `scripts/bitcash/daily-tracker.js`
- `scripts/personal/daily-tracker.js`

**Status:** These are NOT duplicates - they're org-specific implementations (correct)

**Resolution:** No action needed

---

### Legacy/Obsolete Scripts

**To investigate:**
- Check each script for usage
- Check if referenced by cron jobs
- Check if referenced by other scripts

**Candidates for removal:**
- Scripts with `-old`, `-legacy`, `-backup` suffixes
- Scripts not referenced anywhere
- Scripts superseded by newer versions

---

## 📊 Script Inventory

### Total Scripts: 60 files

**Breakdown:**
- `scripts/alygn/`: ~15 files
- `scripts/bitcash/`: ~3 files
- `scripts/personal/`: ~3 files
- `scripts/system/`: ~15 files
- `scripts/shared/`: ~5 files
- `scripts/notion/`: ~5 files
- `scripts/cron/`: ~5 files
- `scripts/logs/`: ~2 files

---

## ✅ Action Plan

### Immediate (Fix morning-briefing)

1. ☐ Compare morning-briefing.js vs morning-briefing-v2.js
2. ☐ Merge local TTS updates into v2 (or vice versa)
3. ☐ Keep best version as `morning-briefing.js` (no suffix)
4. ☐ Update cron job to use `morning-briefing.js`
5. ☐ Delete obsolete version
6. ☐ Test the updated cron job

### Short-term (Clean up)

1. ☐ Rename `twitter-automation-v2.js` → `twitter-automation.js`
2. ☐ Update any references
3. ☐ Audit all scripts for actual usage
4. ☐ Remove unused/legacy scripts
5. ☐ Document which scripts are active

### Long-term (Prevent future confusion)

1. ☐ Naming convention: No version suffixes (use git for versioning)
2. ☐ Script registry: Document which scripts are in production
3. ☐ Automated testing: Ensure cron jobs reference correct files

---

## 🧹 Cleanup Checklist

### Scripts to Review

☐ `scripts/system/morning-briefing-v2.js` → merge or delete  
☐ `scripts/alygn/x-twitter/twitter-automation-v2.js` → rename  
☐ Any other `-v2`, `-v3` scripts  
☐ Scripts not referenced by cron or other scripts  

### Cron Jobs to Update

☐ Multi-Org Morning Briefing → use `morning-briefing.js`  
☐ Twitter automation → use `twitter-automation.js`  

---

_Audit started: 2026-02-10 19:52 CST_  
_Status: In progress_
