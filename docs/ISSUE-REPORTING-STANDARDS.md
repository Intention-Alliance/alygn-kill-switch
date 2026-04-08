# Issue Reporting Standards

## Before/After Format (Gold Standard)

When reporting changes to GitHub issues, always include:

### 1. Before State
Show the code/configuration BEFORE changes:
```javascript
// BEFORE: Missing functionality
function sendEmail() {
  // ... send logic
  // No tracking call
}
```

### 2. After State
Show the code/configuration AFTER changes:
```javascript
// AFTER: With tracking
function sendEmail() {
  // ... send logic
  await trackEmail();  // Added tracking
}
```

### 3. Files Modified
List all files touched:
```
- scripts/alygn/vc-outreach/email/send-approved-emails.js
- scripts/alygn/muni-outreach/core/supabase-utils.ts
```

### 4. Test Steps
Provide verification steps:
```bash
# Step 1: Dry run
node script.js --dry-run

# Step 2: Test with mock data
node script.js --test-email=test@example.com

# Step 3: Verify in database
SELECT * FROM outreach_emails WHERE sent_at > NOW() - INTERVAL '1 hour';
```

### 5. Report Location
Save detailed reports to `/tmp/` for review:
```
Report saved to: /tmp/issue37-fix-report.md
```

## Example Issue Comment

```markdown
## ✅ Issue #37 Fix Complete — READY FOR REVIEW

**Implemented by Keridz ⚙️**

### Before
[Show code before]

### After
[Show code after]

### Files Modified
- file1.js
- file2.ts

### Test Steps
1. Run: `node script.js --dry-run`
2. Verify logs show expected output
3. Check database for new records

### Report Location
Full report: `/tmp/issue37-fix-report.md`

---

Report by Keridz ⚙️
```

## Why This Matters

1. **High-level review** — Andler can quickly see what changed
2. **Audit trail** — Before/after provides clear history
3. **Reproducibility** — Test steps allow verification
4. **Knowledge transfer** — Future developers understand the change

## dist/ Folder Rule

**NEVER edit files in `dist/` directories.**

- `dist/` is a build output, not source code
- Edit source files (`.ts`, `.js` in `src/` or root)
- Run build scripts to regenerate `dist/`
- If a skill has a build script, run it AFTER editing source

## Marking Issues as Done

When an issue is complete:
1. Post detailed GitHub comment with before/after
2. Close the issue with `gh issue close <number>`
3. Include "Report by [Agent] [Emoji]" signature
4. Update Notion tracking if applicable

---

**Created:** 2026-04-08
**Author:** Wobblus 🔧
**Related:** Issue reporting feedback from Andler