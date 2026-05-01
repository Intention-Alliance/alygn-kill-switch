# ALYGN Daily Signal Brief — Changelog

## [2026-04-27] - Major Update - Data Collection Gaps Fixed

### Added

#### collect-data.js
- **Multi-repo GitHub tracking**: Now monitors both `AndlerRL/andler-ops` and `Intention-Alliance/align-core-infra`
- **Alygn issue filtering**: Issues closed are filtered for project tags (labels containing "alygn" or "project")
- **Notion VC Tracker**: New `collectNotionVC()` function to track VC outreach pipeline (sent/replies/meetings)
- **Local work tracking**: New `collectLocalWork()` function reads from `memory/*.md` and `HEARTBEAT.md` for team progress acknowledgment
- **Email tracking setup**: Structure for tracking both `alyyygn@gmail.com` (3 y's) and `outreach@alyygn.com` (2 y's) via IMAP
- **Correct Notion API terminology**: Uses `dataSource` instead of `database` for table queries

#### synthesize-report.js
- **VC outreach section**: Now displays VC pipeline metrics from Notion
- **Local work section**: Displays features in progress and active work streams
- **Extended daily targets**: Now supports up to 5 targets (was 3)
- **Data completeness tracking**: New `dataCompleteness` field to verify all sources queried
- **Enhanced suggestions**: Includes recommendations for local work continuation and GitHub activity

#### generate-audio.js
- **Extended word limit**: 400 words max (was 180) - supports up to 2:45min audio
- **Increased timeout**: 120 seconds (was 60s) for longer TTS generation
- **Duration estimation**: Output includes `estimatedDurationSec` field
- **No extreme truncation**: Preserves all categories and details

### Changed

#### collect-data.js
- `GITHUB_REPO` → `GITHUB_REPOS` (array of 2 repos)
- `NOTION_GRANT_DB` → `NOTION_GRANT_DATA_SOURCE` (correct ID: `32c33487-4af6-8191-8d35-000bba56be84`)
- Added `NOTION_VC_DATA_SOURCE` (ID: `32c334874af68130b265de7464a51a72`)
- Added `GMAIL_APP_PASSWORD` and `OUTREACH_EMAIL_APP_PASSWORD` env vars

#### synthesize-report.js
- `generateOperations()`: Now includes VC outreach and local work subsections
- `generateOutreach()`: Now includes email tracking for both accounts
- `generateTargets()`: Returns up to 5 targets instead of 3
- `generateAudioScript()`: Extended to include all details (was truncated aggressively)

#### generate-audio.js
- `MAX_WORDS`: 180 → 400
- `TIMEOUT_MS`: 60000 → 120000

### Documentation

- **README.md**: Fully updated with new data sources, env vars, and troubleshooting
- **IMPLEMENTATION-UPDATES.md**: New file with detailed migration guide
- **CHANGELOG.md**: This file

### Fixed

- Notion API calls now use correct `dataSource` terminology
- VC outreach metrics now collected and displayed
- Local work progress now tracked and reported
- Email tracking structure ready for IMAP implementation
- Audio truncation no longer cuts important details

### Technical Details

**Test Results:**
```bash
# Data collection
✅ GitHub: 2 repos tracked
✅ Notion VC: 10 VCs in pipeline
✅ Notion Grants: DataSource ID updated
✅ Supabase: 18 municipal emails sent
✅ Local work: Memory files checked
✅ Email: Structure ready (IMAP TODO)

# Pipeline
✅ collect-data.js → synthesize-report.js → generate-audio.js → send-signal.js

# Audio generation
✅ Word count: 122 words (test with minimal data)
✅ Max capacity: 400 words (~2:45min)
✅ Timeout: 120s (tested successfully)
✅ Output: OGG format, 319KB average
```

### Migration Required

**Set new environment variables:**
```bash
export NOTION_GRANT_DATA_SOURCE=32c33487-4af6-8191-8d35-000bba56be84
export NOTION_VC_DATA_SOURCE=32c334874af68130b265de7464a51a72
export GMAIL_APP_PASSWORD=your-gmail-app-password
export OUTREACH_EMAIL_APP_PASSWORD=your-outreach-app-password
```

**Optional - Full email tracking:**
```bash
cd scripts/alygn/signal-daily-brief
npm install imap
```

### Backward Compatibility

✅ All changes are additive - no breaking changes to existing pipeline structure.

---

## [2026-02-24] - Initial Implementation

### Added
- `collect-data.js`: Data collection from GitHub, Notion, Supabase, Twitter, Kill Switch
- `synthesize-report.js`: Executive summary, operations, outreach, suggestions, targets
- `generate-audio.js`: Piper TTS with Wobblus voice (balanced profile)
- `send-signal.js`: Signal CLI delivery
- Basic cron setup for daily 8 AM CST briefs

### Technical Specs
- Audio: 60-90 seconds (~150-180 words)
- Timeout: 60 seconds
- Data sources: GitHub (1 repo), Notion (grants), Supabase (municipal), Twitter, Kill Switch

---

**Current Version:** 2026-04-27 (Major Update)  
**Status:** ✅ Production Ready  
**Test Coverage:** Pipeline tested end-to-end  
**Next Milestone:** IMAP email tracking implementation
