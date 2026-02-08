# Twitter Automation v4 - Critical Setup Notes

## 🔧 Key Setup (2026-02-08)

### Browser Profile Configuration
**CRITICAL:** All browser automation MUST use the `alygn` profile:
```bash
browser --profile="alygn" --action=[navigate|snapshot|act] --timeoutMs=[120000+]
```

**Why:**
- Separate Chrome instance with X.com authentication
- Avoids port conflicts with other profiles
- Ensures we're on the right authenticated tab

**Profile status:** ✅ Active and authenticated to X.com

### Timeout Configuration
**VERY LONG timeouts** to avoid "Port in use" errors:

```
Navigation:  120,000ms (120s) - page load + JS rendering
Snapshot:     60,000ms (60s)  - element detection
Actions:      90,000ms (90s)  - click/type/submit
Between:      45,000ms (45s)  - sequential action cooldown
Cron total:  3,600,000ms (1h) - overall job timeout
```

### Cron Job Details
**Schedule:** 11 AM daily (Costa Rica time)  
**Job ID:** `10e71511-a7ae-47e1-8293-43c1d3684512`  
**Last run:** Feb 7, 2026 (successful)  
**Next run:** Daily at 11:00 AM

**Updated instructions:** See `payload` field in cron config

---

## 📋 Automation Flow

### Phase 1: Content Generation
```bash
cd ~/.openclaw/workspace && bun scripts/alygn/twitter-automation-v4.js
```

**Output:**
- 10 post ideas via Grok Prompt #1 (alignment/AI safety threads)
- 5 strategic replies via Grok Prompt #13
- AI selects best 5 posts
- Saves workflow JSON: `twitter-outputs/workflow-*.json`

### Phase 2: Browser Automation
```bash
cd ~/.openclaw/workspace && bun scripts/alygn/twitter-browser-executor.ts
```

**Critical rules:**
1. Always use `--profile="alygn"` flag
2. Always use `--timeoutMs=120000+` for navigation
3. Wait 45s between posts (port stability)
4. Include `@aialygn` at end of EVERY post
5. Create proper threads for multi-point posts
6. Log all actions

**What it does:**
- Posts 5 generated threads
- Sends 5 strategic replies to targets
- Follows 5 profiles

### Phase 3: Report
Summarizes to WhatsApp:
- Posts published: X/5
- Replies sent: X/5
- Follows completed: X/5
- Workflow file location
- Any errors

---

## 🚨 Troubleshooting

### Issue: "Port 18801 in use" error
**Solution:**
1. Ensure `--profile="alygn"` is used (not default profile)
2. Wait 45s between major actions (browser port needs cooldown)
3. Use 120s+ timeouts (avoids premature timeouts)

### Issue: Browser takes >1 hour
**Solution:**
- Cron timeout is 3600s (1 hour) - should be sufficient
- If exceeding, reduce number of posts/replies
- Or increase cron timeout via `update` action

### Issue: X.com not loaded
**Solution:**
1. Check alygn profile is still authenticated
2. Verify network connection
3. Check X.com status (not down)
4. Use 120s navigation timeout

---

## 📝 Files

**Key scripts:**
- `scripts/alygn/twitter-automation-v4.js` - Content generation
- `scripts/alygn/twitter-browser-executor.ts` - Browser automation
- `scripts/alygn/twitter-browser-automation-v4.js` - Legacy (may deprecate)

**Config:**
- `TOOLS.md` - Extended timeouts documented
- `MEMORY.md` - Session notes + findings

**Output:**
- `twitter-outputs/workflow-*.json` - Workflow data for each run

---

## ✅ Verification Checklist (Before 11 AM run)

- [ ] Alygn profile is authenticated to X.com
- [ ] Chrome is running (not closed)
- [ ] Gateway is running (`openclaw gateway status`)
- [ ] Network is stable
- [ ] No other browser automation running
- [ ] Cron job is enabled (`cron list | grep Twitter`)

---

## 🔮 Future Improvements

1. **Chrome DevTools Protocol (CDP)** - Extract cookies without encryption for Bird CLI
2. **X API write access** - Most reliable (when available)
3. **Parallel post execution** - Currently sequential to avoid port conflicts
4. **Post scheduling** - Spread posts throughout the day
5. **Engagement analytics** - Track reply rates, follows, engagement

---

## 📞 Support

**If automation fails:**
1. Check cron logs: `tail /tmp/openclaw/openclaw-*.log`
2. Verify alygn profile: `ps aux | grep chrome`
3. Test manually: Run `twitter-automation-v4.js` by hand first
4. Check browser service: `openclaw gateway status`

**Quick debug:**
```bash
# Generate workflow
cd ~/.openclaw/workspace && bun scripts/alygn/twitter-automation-v4.js

# Check workflow file
ls -lah twitter-outputs/ | tail -1

# Manual browser test
browser --profile="alygn" --action=navigate --targetUrl="https://x.com/home" --timeoutMs=120000
```

---

*Last updated: 2026-02-08 01:54 CST*  
*Next run: 2026-02-08 11:00 AM CST*  
*Status: ✅ Ready for production*
