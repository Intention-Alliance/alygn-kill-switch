# Masterbots Workspace Media Templates - Missing Checklist

**Created:** 2026-02-28 18:10 CST  
**Task:** Process and reformat social media images for masterbots repo  
**Status:** ⏸️ BLOCKED - Repository access + approvals pending

---

## 🚧 Current Blockers

### 1. Repository Access
- [ ] **Clone masterbots repo locally**
  - Location: `bitcashorg/masterbots`
  - Target branch: `develop`
  - Local path: `~/.openclaw/workspace/repos/masterbots` (or `/tmp/masterbots`)
  - **Status:** ⏸️ Approval required (gh auth / git clone)

### 2. GitHub Authentication
- [ ] **Verify gh CLI authentication**
  - Command: `gh auth status`
  - **Status:** ⏸️ Approval required

### 3. Source Directory Access
- [ ] **Access `/Pictures/mb-pro-workspace-templates/`**
  - Contains source images to reformat
  - **Status:** ⏸️ Approval required (ls ~/Pictures/)

---

## 📋 Task Requirements (From Andler)

### Source Material
- **Location:** `/Pictures/mb-pro-workspace-templates/` (multiple sub-folders)
- **Purpose:** Social media images for masterbots repo
- **Reference:** `apps/pro-web/public/templates/` (shows current workspace template handling)

### Target System
- **Destination:** `apps/pro-web/public/templates/` (in masterbots repo)
- **Logic Reference:** 
  - `apps/pro-web/lib/helpers/workspace/media-tab/template.ts`
  - Related files in `media-tab/` directory
- **Branch:** `develop` (should `git pull --rebase` first)

### Required Actions
1. [ ] **Clone/update masterbots repo** (develop branch)
2. [ ] **Review current template system** at `apps/pro-web/lib/helpers/workspace/media-tab/`
3. [ ] **Access source images** at `/Pictures/mb-pro-workspace-templates/`
4. [ ] **Analyze image dimensions** (width x height)
5. [ ] **Reformat image names** according to masterbots naming convention
6. [ ] **Copy reformatted images** to `apps/pro-web/public/templates/`

---

## 📊 Historical Context (From Feb 4, 2026 Analysis)

### Previous Masterbots Work Completed ✅
- **Issue #604 (P0):** RAG blocks not returning - ✅ Analyzed + GitHub comment posted
- **Issue #578 (P0):** Workspace bugs master plan - ✅ 8 bugs mapped to phases
- **Issue #555 (P1):** Performance issues - ✅ 5 concerns + 6 edge cases documented
- **Issue #389 (P2):** ClickableText audit - ⏳ Preliminary only

### Analysis Files Created
- ✅ `/tmp/masterbots-comprehensive-analysis.md` (31KB)
- ✅ GitHub comment on #604
- ✅ Memory: `memory/2026-02-04-comprehensive-summary.md`

### Repository Status (Last Attempt)
- Cloning started at `/tmp/masterbots` (sparse clone, ~1GB)
- File reads failed due to `--no-checkout` option
- Brave API missing for GitHub issue web searches

---

## 🔧 Technical Details Needed

### Image Naming Convention (TO DISCOVER)
Need to review `template.ts` to understand:
- [ ] Expected file naming pattern
- [ ] Dimension requirements per template type
- [ ] Supported formats (PNG, JPG, WebP?)
- [ ] Size limits/optimization requirements

### Template Types (TO DISCOVER)
Based on sub-folders in `/Pictures/mb-pro-workspace-templates/`:
- [ ] List all sub-folder names
- [ ] Map each to template type
- [ ] Identify target use case (social media platform?)

---

## ✅ Completion Criteria

1. [ ] Masterbots repo cloned and updated (develop branch)
2. [ ] Template naming convention understood
3. [ ] All source images processed and renamed
4. [ ] Images placed in `apps/pro-web/public/templates/`
5. [ ] Git commit with clear message
6. [ ] PR or direct push (based on permissions)

---

## 🎯 Next Actions (When Approvals Granted)

```bash
# 1. Check gh auth
gh auth status

# 2. Clone/update repo
cd ~/.openclaw/workspace/repos
git clone https://github.com/bitcashorg/masterbots.git
# OR if exists:
cd masterbots && git pull --rebase origin develop

# 3. Review template system
ls apps/pro-web/lib/helpers/workspace/media-tab/
cat apps/pro-web/lib/helpers/workspace/media-tab/template.ts

# 4. Check source images
ls -R ~/Pictures/mb-pro-workspace-templates/

# 5. Process images (script or manual)
# TBD: Based on naming convention discovered
```

---

## 📝 Notes

- **Priority:** High (direct request from Andler)
- **Estimated Time:** 1-2 hours (once access granted)
- **Risk:** Low (read-only analysis + file copying)
- **Dependencies:** GitHub auth, Pictures directory access

---

**Last Updated:** 2026-02-28 18:10 CST  
**Waiting For:** Approval for gh auth, git clone, and directory access
