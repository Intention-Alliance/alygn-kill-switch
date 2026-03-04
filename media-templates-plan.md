# Masterbots Media Templates - Analysis & Renaming Plan

**Generated:** 2026-02-28 18:25 CST  
**Source:** `/home/andlersrv/Pictures/mb-pro-workspace-media-templates/MB Pro Workspace Media Templates/`  
**Destination:** `/home/andlersrv/.openclaw/workspace/repos/bitcash/read-only/masterbots/apps/pro-web/public/templates/`

---

## 📊 Naming Convention

**Format:** `{template-name}_{social-media}_{frame}.{ext}`

**Example:** `Blue-Modern-Marketing_facebook-ad_21-11.png`

### Components:
1. **Template Name:** Descriptive kebab-case name (e.g., `Blue-Modern-Marketing`)
2. **Social Media:** Platform identifier (e.g., `twitter-post`, `instagram-reel`, `facebook-ad`)
3. **Frame:** Aspect ratio (e.g., `16-9`, `9-16`, `1-1`, `4-5`, `2-3`)

---

## 📁 Source Directories

| Directory | Social Media | Frame (Expected) | File Count |
|-----------|-------------|------------------|------------|
| Twitter Posts | `twitter-post` | `16-9` (landscape) | ~115 files (T1-T115) |
| Instagram Posts | `instagram-post` | `4-5` or `1-1` | ~114 files (IP1-IP114) |
| Facebook Posts | `facebook-post` | `1-1` or `5-4` | ~115 files (F1-F115) |
| LinkedIn Posts | `linkedin-post` | `1-1` | ~120 files (LP1-LP120) |
| TikTok Videos | `tiktok-video` | `9-16` (portrait) | ~100+ files (TT1-TT100+) |
| YT Shorts | `youtube-shorts` | `9-16` (portrait) | TBD |
| YT Banner | `youtube-banner` | `16-9` (landscape) | TBD |
| YT Thumbnail | `youtube-thumbnail` | `16-9` (landscape) | TBD |

---

## 🎨 Naming Strategy

### Option 1: Simple Sequential (Fastest)
```
Twitter-Template-001_twitter-post_16-9.jpg
Twitter-Template-002_twitter-post_16-9.webp
Instagram-Template-001_instagram-post_4-5.webp
```

### Option 2: Descriptive (Requires Image Analysis)
```
Blue-Minimalist-Tech_twitter-post_16-9.jpg
Green-Modern-Motivation_instagram-post_4-5.webp
Purple-Gradient-Business_facebook-post_1-1.png
```

### Option 3: Hybrid (Recommended)
Use color/style keywords + sequential:
```
Blue-Modern-001_twitter-post_16-9.jpg
Green-Minimal-001_instagram-post_4-5.webp
Purple-Gradient-001_facebook-post_1-1.png
```

---

## ⚠️ Important Notes

### Platform-Specific Suffixes
Based on existing templates in destination:
- `twitter-post` (not just `twitter`)
- `instagram-post`, `instagram-story`, `instagram-reel`, `instagram-video`
- `facebook-post`, `facebook-ad`
- `linkedin-post`, `linkedin-ad`, `linkedin-video`
- `tiktok-video`
- `youtube-thumbnail`, `youtube-shorts`, `youtube-banner`
- `pinterest-pin`
- `youtube-shorts`

### Frame Sizes by Platform
- **Twitter:** `16-9` (landscape), `1-1` (square)
- **Instagram Post:** `4-5` (portrait), `1-1` (square)
- **Instagram Story/Reel:** `9-16` (portrait)
- **Facebook:** `1-1` (square), `5-4` (slight landscape)
- **LinkedIn:** `1-1` (square)
- **TikTok:** `9-16` (portrait)
- **YouTube Thumbnail:** `16-9` (landscape)
- **YouTube Banner:** `16-9` (landscape, ultra-wide)
- **YouTube Shorts:** `9-16` (portrait)
- **Pinterest:** `2-3` (portrait)

---

## 📋 Execution Plan

### Phase 1: Analyze Dimensions (✅ Script Ready)
```bash
# Get dimensions for all images
ffprobe -v quiet -select_streams v:0 -show_entries stream=width,height \
  -of csv=p=0 "file.jpg"
```

### Phase 2: Generate Names (Manual Review Needed)
**Decision Required:** Which naming strategy?
- [ ] Option 1: Simple sequential (fast, generic)
- [ ] Option 2: Descriptive (requires AI image analysis)
- [ ] Option 3: Hybrid (color/style + sequential) ⭐ **Recommended**

### Phase 3: Rename & Copy
```bash
# For each image:
# 1. Get dimensions
# 2. Determine frame
# 3. Generate name
# 4. Copy to destination with new name
```

### Phase 4: Verify
- [ ] Check all files copied successfully
- [ ] Verify naming convention matches existing templates
- [ ] Test template loading in masterbots app

---

## 🔧 Next Actions

**Waiting for:**
1. **Approval** to run analysis script
2. **Decision** on naming strategy (Option 1, 2, or 3)
3. **Approval** to copy files to destination

**Estimated Time:**
- Analysis: 2-3 minutes
- Naming: 5-10 minutes (Option 1), 30+ minutes (Option 2 with AI)
- Copy: 1-2 minutes
- **Total:** 10-15 minutes (Option 1), 45+ minutes (Option 2)

---

## 📝 File Counts (Preliminary)

- **Twitter Posts:** ~115 files (T1-T115)
- **Instagram Posts:** ~114 files (IP1-IP114)
- **Facebook Posts:** ~115 files (F1-F115)
- **LinkedIn Posts:** ~120 files (LP1-LP120, L119)
- **TikTok Videos:** ~100+ files (TT1-TT100+, T23, T55, T99)
- **YT Shorts:** TBD
- **YT Banner:** TBD
- **YT Thumbnail:** TBD

**Total Estimated:** ~600-700 images

---

**Status:** ⏸️ Ready to proceed pending approvals and naming strategy decision
