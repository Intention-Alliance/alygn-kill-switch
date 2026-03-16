# VC Contact Research - Action Plan

**Generated:** March 9, 2026 11:01 AM CST  
**Status:** Blocked - Missing contact emails for 8 high-priority VCs

---

## Problem

Weekly VC outreach execution skipped 8 VCs due to missing contact emails:

1. **Andreessen Horowitz (a16z)** - 🔴 High Priority
2. **Sequoia Capital** - 🔴 High Priority  
3. **Menlo Ventures** - 🔴 High Priority
4. **Air Street Capital** - 🟡 Medium Priority
5. **Bessemer Venture Partners** - 🟡 Medium Priority
6. **Khosla Ventures** - 🟡 Medium Priority
7. **Lightspeed Venture Partners** - 🟡 Medium Priority
8. **Insight Partners** - 🟢 Low Priority

**CSV Export:** `~/workspace/alygn-automation/vc-tracker-export.csv` ✅ Ready

---

## Solution Options

### Option 1: Manual Research (Fastest for 8 VCs)
**Time:** ~30-45 minutes  
**Approach:**
1. Import CSV to Google Sheets
2. Research each VC website for partner emails
3. Use standard patterns: `firstname@firm.com`, `partners@firm.com`, `info@firm.com`
4. Update Notion database directly
5. Re-run outreach script

**Pros:** Immediate, full control  
**Cons:** Manual work

### Option 2: Run Deep Research Script (Automated)
**Time:** ~15-20 minutes (if working)  
**Command:**
```bash
cd ~/.openclaw/workspace/scripts/alygn/vc-outreach
node tracking/deep-research-vcs.js --limit=8
```

**Pros:** Automated, scalable  
**Cons:** Script may need debugging (last run skipped)

### Option 3: Hybrid (Recommended)
**Time:** ~20 minutes  
**Approach:**
1. Manually research top 3 high-priority VCs (a16z, Sequoia, Menlo)
2. Run automated script for remaining 5
3. Unblock outreach immediately for highest priority

---

## Recommended Next Steps

### Immediate (Today):
1. ✅ **Import CSV to Google Sheets** for review
   - Open: `~/workspace/alygn-automation/vc-tracker-export.csv`
   - Import to Alygn Google account
   - Add contact emails column

2. ✅ **Research top 3 VCs manually** (15 min):
   - **a16z:** Check a16z.com/team, look for AI partners
   - **Sequoia:** Check sequoiacap.com/people, AI practice leads
   - **Menlo:** Check menlovc.com/team, Anthology Fund contacts

3. ✅ **Update Notion database** with found emails
   - Database: https://www.notion.so/305334874af681ef983df57c7f70de33
   - Update "Contact Email" field for each VC

4. ✅ **Re-run outreach script** to generate drafts
   ```bash
   node draft-outreach-emails.js --limit=3
   ```

### This Week:
- [ ] Debug why deep research script skipped all 8 VCs
- [ ] Run automated research for remaining 5 VCs
- [ ] Generate email drafts for all 8
- [ ] Post to Discord #annotations for approval
- [ ] Send first batch (top 3 high priority)

---

## Contact Email Patterns to Try

**Standard formats:**
- `firstname.lastname@firm.com`
- `firstinitial.lastname@firm.com`
- `partners@firm.com`
- `info@firm.com`
- `team@firm.com`

**VC-specific:**
- **a16z:** `bio@a16z.com`, `crypto@a16z.com`, or partner direct
- **Sequoia:** `partners@sequoiacap.com`
- **Menlo:** `anthology@menlovc.com` (Anthology Fund)
- **Khosla:** `ventures@khoslaventures.com`

---

## Files Reference

- **CSV Export:** `~/workspace/alygn-automation/vc-tracker-export.csv`
- **Notion DB:** https://www.notion.so/305334874af681ef983df57c7f70de33
- **Research Script:** `scripts/alygn/vc-outreach/tracking/deep-research-vcs.js`
- **Email Draft Script:** `scripts/alygn/vc-outreach/email/draft-outreach-emails.js`
- **Config:** `scripts/alygn/vc-outreach/notion-config.json`

---

## Notes

- CSV is ready and waiting for email population
- All 8 VCs have been discovered and scored for relevance
- Outreach templates are ready (governance-first positioning)
- Once emails are added, can proceed to draft generation → approval → sending

**Priority:** Unblock high-priority VCs (a16z, Sequoia, Menlo) first for immediate outreach this week.
