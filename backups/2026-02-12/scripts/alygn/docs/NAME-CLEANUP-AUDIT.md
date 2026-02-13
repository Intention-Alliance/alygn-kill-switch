# "Intention Alliance" Name Cleanup Audit

**Date:** February 10, 2026 21:30 CST  
**Policy:** Only use "Alygn" going forward (minimum 2 semesters)

## 🎯 Audit Results

### ✅ Clean (No References Found)

- `MEMORY.md`
- `USER.md`
- `scripts/alygn/pre-approved-posts.json`
- `scripts/alygn/post-pre-approved.js`
- `scripts/alygn/twitter-discovery/decision-engine.js`
- `scripts/alygn/twitter-master-automation.js`
- `scripts/alygn/x-twitter/twitter-automation.js`

### ✅ Cleaned (References Removed)

- `TOOLS.md` - Removed "Project Name Mapping" section

### ⚠️ Documentation Files (Documenting Deprecation)

These files mention "Intention Alliance" only to explain the deprecation:

- `scripts/alygn/NOTION-UPDATES-REQUIRED.md`
- `scripts/alygn/ALYGN-CONTEXT-UPDATE-SUMMARY.md`
- `memory/2026-02-10.md`

**Status:** These are correct (documenting the policy itself)

### 🚨 REQUIRES CLEANUP

#### 1. VC Email Templates (HIGH PRIORITY)

**File:** `scripts/alygn/vc-outreach/vc-outreach-email-template.py`

```python
# Line with "Intention Marketplace":
<li><strong>Intention Marketplace</strong> — Economic alignment through ethical, user-empowered systems...

# LinkedIn URL:
<a href="https://linkedin.com/company/alygn/posts/?feedView=all&utm_source=email..."
```

**Action Required:**

- Remove entire "Intention Marketplace" bullet point
- Remove or update LinkedIn URL (check if alygn LinkedIn profile exists)

---

**File:** `scripts/alygn/vc-outreach/send-email-test.js`

```javascript
// LinkedIn URL:
<a href="https://linkedin.com/company/alygn/posts/?feedView=all&utm_source=email..."
```

**Action Required:**

- Remove or update LinkedIn URL

---

#### 2. Notion Pages (HIGH PRIORITY)

**Location:** Notion workspace  
**Pages requiring updates:**

1. **Alygn Central Hub**
   - **Current title:** "Intention Alliance - Central Hub"
   - **Update to:** "Alygn - Central Hub"
   - **Page ID:** `2f933487-4af6-819f-a5c5-f32ae95088f1`

2. **Weekly Progress Database entries**
   - **Database ID:** `2fe33487-4af6-8137-868e-e14fd068948c`
   - **Action:** Search for any entries with "Intention Alliance" in Project field
   - **Replace with:** "ALYGN" or "Alygn"

3. **Reference documents in Central Hub**
   - Check all child pages for "Intention Alliance" references
   - Especially:
     - "Humanizing Technology - Protocol Overview" (may have old name)
     - "Context Engineering - Technical Framework" (may have old name)

---

#### 3. GitHub Repositories (FUTURE - NOT URGENT)

**Note from TOOLS.md (before removal):**

> "GitHub: `intention-alliance/*` repos → refers to Alygn"

**Action Required (Low Priority):**

- If GitHub repos exist under `intention-alliance/*` org/prefix
- Consider renaming or archiving for next phase
- Not blocking for current work (templates/Notion more urgent)

---

## 📋 Cleanup Checklist

### Immediate (Today/Tomorrow)

- [ ] Remove "Intention Marketplace" from `vc-outreach-email-template.py`
- [ ] Remove/update LinkedIn URLs in both email templates
- [ ] Update Notion "Alygn Central Hub" page title
- [ ] Search Notion database for "Intention Alliance" entries

### This Week

- [ ] Audit all Notion child pages under Central Hub
- [ ] Update any remaining references in Notion documentation
- [ ] Verify VC outreach templates are clean

### Future (Non-Blocking)

- [ ] Review GitHub repo naming if applicable
- [ ] Check any external documentation or links

---

## 🔍 How to Search for Remaining References

**Command-line search:**

```bash
# Search all workspace files (excluding backups/node_modules)
grep -r "Intention Alliance" . \
  --exclude-dir=node_modules \
  --exclude-dir=.git \
  --exclude-dir=backups \
  --exclude="*.log" \
  2>/dev/null | grep -v "Binary file"
```

**Notion search:**

1. Open Notion workspace
2. Use global search: `"Intention Alliance"`
3. Review all results, update as needed

---

## ✅ Verification

After cleanup, verify:

- [ ] No "Intention Alliance" in active code/templates
- [ ] Notion pages use "Alygn" consistently
- [ ] VC email templates mention only "Alygn"
- [ ] Database entries use "ALYGN" or "Alygn"

---

_Audit completed: 2026-02-10 21:30 CST_  
_Policy effective: Immediate (minimum 2 semesters)_
