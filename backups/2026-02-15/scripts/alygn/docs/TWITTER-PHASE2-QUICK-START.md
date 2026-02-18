# 🐦 ALYGN Twitter Phase 2: Quick Start Guide

**Status:** Ready to execute NOW  
**Time to complete:** 7 minutes (Bird CLI) OR 10 minutes (manual)  
**All content prepared:** ✅ Text, Media, Profiles

---

## ⚡ FASTEST PATH (7 minutes total)

### Bird CLI Method

**Step 1: Get Twitter Auth Tokens (5 min)**

1. Open Chrome browser (with @aialygn logged in)
2. Press `F12` to open DevTools
3. Go to `Application` tab → `Cookies` → `https://x.com`
4. Find and copy these two cookie values:
   - `auth_token` (long string)
   - `ct0` (shorter string)

**Step 2: Set Environment (1 min)**

```bash
export AUTH_TOKEN="paste_auth_token_here"
export CT0="paste_ct0_here"
```

**Step 3: Run Script (1 min)**

```bash
cd ~/.openclaw/workspace
node scripts/alygn/twitter-phase2-bird-node.js
```

✅ **Done!** Check @aialygn timeline for all 5 posts

---

## 🔄 MANUAL METHOD (10 minutes)

If you prefer to post manually:

1. Open `PHASE2-READY-TO-POST.md`
2. Copy Thread 1 text
3. Go to @aialygn on Twitter
4. Paste into new post
5. Attach media image
6. Click Post
7. Repeat 4 more times
8. Follow 5 profiles

---

## 📚 FILE REFERENCE

**Quick Start:**
- `TWITTER-PHASE2-QUICK-START.md` ← **YOU ARE HERE**

**Detailed Guides:**
- `PHASE2-READY-TO-POST.md` - Manual posting guide
- `TWITTER-API-GUIDE.md` - All 3 options compared
- `PHASE2-FINAL-STATUS.md` - Technical breakdown

**Scripts:**
- `scripts/alygn/twitter-phase2-bird-node.js` - **USE THIS** (7 min)
- `scripts/alygn/twitter-phase2-bird-cli.sh` - Bash alternative
- `scripts/alygn/twitter-phase2-x-api.js` - X API (for later)

**Content:**
- All 5 thread texts ready
- All 5 media assets generated
- All 5 profiles identified

---

## 🚀 EXECUTE NOW

### Option A: Fully Automated (7 min)
```bash
export AUTH_TOKEN="your_token"
export CT0="your_ct0"
node scripts/alygn/twitter-phase2-bird-node.js
```

### Option B: Bash Version (7 min)
```bash
export AUTH_TOKEN="your_token"
export CT0="your_ct0"
bash scripts/alygn/twitter-phase2-bird-cli.sh
```

### Option C: Manual Copy-Paste (10 min)
1. Open `PHASE2-READY-TO-POST.md`
2. Copy-paste each thread 5 times
3. Done!

---

## 🤔 Questions?

**Q: Where do I get the auth tokens?**  
A: Chrome DevTools → Application → Cookies → x.com → Copy auth_token + ct0

**Q: Why Bird CLI?**  
A: Fastest, no API approval needed, uses your existing browser auth, works immediately

**Q: What if Bird fails?**  
A: Fall back to manual posting (10 min) - guaranteed to work

**Q: Will this post to the right account?**  
A: Yes - uses your @aialygn Chrome session credentials

---

## ✨ SUMMARY

**Everything is ready. Pick your method and execute:**

1. **Bird CLI** (fastest) = 7 minutes
2. **Manual** (safest) = 10 minutes
3. **X API** (official, requires approval) = later

**No more setup. No more waiting. Just execute.**

---

*Created: 2026-02-07 15:24 CST*
*All scripts committed and ready to use*
