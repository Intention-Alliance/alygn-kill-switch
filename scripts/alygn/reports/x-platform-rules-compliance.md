# X Platform Rules Compliance Guide
**For: ALYGN X-Warmup Team (Wobblus, Gimglich, Keridz, Hugrukal, Nikaya, Chanshuk)**  
**Effective:** 2026-04-27  
**Source:** https://help.x.com/en/rules-and-policies/x-rules

---

## ⚠️ CRITICAL: What We CANNOT Do

### 1. ❌ Platform Manipulation & Spam
**Rule:** You may not use X's services to artificially amplify or suppress information or engage in behavior that manipulates or disrupts people's experience.

**What this means for us:**
- ❌ NO automated mass-following (we're doing manual, max 15/day)
- ❌ NO bot-like behavior (random delays, human-paced engagement)
- ❌ NO coordinated inauthentic behavior (each account acts independently)
- ❌ NO spam replies (value-add only, no copy-paste)

**Our compliance:**
- ✅ Manual follow execution (browser relay, human-paced)
- ✅ Max 15 follows/day (well below X's limits)
- ✅ 30-120 second delays between actions
- ✅ Personalized, value-add engagement only

---

### 2. ❌ Misleading & Deceptive Identities
**Rule:** You may not impersonate individuals, groups, or organizations to mislead, confuse, or deceive others.

**What this means for us:**
- ❌ NO impersonating officials, partners, or verified accounts
- ❌ NO fake engagement (must be genuine interest)
- ❌ NO deceptive profile info (@aialygn must be clear it's ALYGN institution)

**Our compliance:**
- ✅ @aialygn is official ALYGN institutional account
- ✅ Clear bio: "Independent AI Governance Institution"
- ✅ No impersonation of government or VC firms

---

### 3. ❌ Abuse & Harassment
**Rule:** You may not share abusive content, engage in targeted harassment, or incite others to do so.

**What this means for us:**
- ❌ NO aggressive or unwanted repeated engagement
- ❌ NO reply spam on sensitive topics
- ❌ NO dogpiling (multiple accounts targeting same person)

**Our compliance:**
- ✅ One engagement per account per phase
- ✅ Value-add content only (governance insights, not sales)
- ✅ Respectful, institutional tone

---

### 4. ❌ Privacy Violations
**Rule:** You may not publish or post other people's private information without express authorization.

**What this means for us:**
- ❌ NO doxxing (no personal emails, phones, addresses)
- ❌ NO sharing private DMs without consent
- ❌ NO scraping private data

**Our compliance:**
- ✅ Only use publicly available info (official websites, public X profiles)
- ✅ Official municipal emails from .go.cr websites
- ✅ VC emails from public firm websites

---

### 5. ❌ Civic Integrity
**Rule:** You may not use X's services for manipulating or interfering in elections or civic processes.

**What this means for us:**
- ❌ NO election-related messaging (we're non-partisan governance institution)
- ❌ NO voter suppression or misleading civic info
- ❌ NO political campaign support

**Our compliance:**
- ✅ Focus on AI governance, not elections
- ✅ Institutional, non-partisan positioning
- ✅ No endorsement of candidates or parties

---

## ✅ What We CAN Do (Safely)

### 1. ✅ Manual Following (Max 15/day)
- Use browser relay (alygn profile)
- Human-paced (30-120s delays)
- Official accounts only (VCs, Municipalities)
- Track in Notion/Supabase for compliance

### 2. ✅ Liking Posts (Max 20/day)
- Recent posts only (last 7 days)
- Value-add content (AI governance, safety, coordination)
- No controversial or sensitive topics

### 3. ✅ Quote Tweets (Max 5/day)
- Add ALYGN perspective (governance insights)
- No sales pitches
- Institutional tone

### 4. ✅ Replies (Max 10/day)
- Value-add only (insights, resources, coordination frameworks)
- Respectful, professional tone
- No unsolicited DMs

---

## 📊 Rate Limits (Conservative Compliance)

| Action | Daily Limit | Weekly Limit | Notes |
|--------|-------------|--------------|-------|
| Follows | 15 | 105 | Well below X's 400/day limit |
| Likes | 20 | 140 | Conservative, human-paced |
| Replies | 10 | 70 | Value-add only |
| Quote Tweets | 5 | 35 | Institutional insights |
| Retweets | 10 | 70 | Relevant governance content |

**Rest Day:** 1 day/week (no engagement)  
**Timezone:** America/Costa_Rica (business hours only)

---

## 🔍 Zero-Trust Verification Protocol

**Before engaging with any account:**

1. ✅ **Browser Relay Verification** (alygn profile)
   - Navigate to X.com/handle
   - Confirm profile exists
   - Extract follower count, verification status
   - Check recent activity

2. ✅ **Official Status Confirmation**
   - VCs: Firm website cross-reference
   - Municipalities: .go.cr official website
   - No third-party scrapers (twitterscore.io, etc.)

3. ✅ **Track in DataSource/Database**
   - VCs: Notion DataSource (VC Outreach Tracker)
   - Municipalities: Supabase (municipalities table)
   - Include verification timestamp, source

4. ✅ **Manual Follow Execution**
   - Browser relay (alygn profile)
   - Human-paced (10-20s page load, then action)
   - Verify follow succeeded (return to window, confirm)
   - Retry failed windows

---

## 🚨 Red Flags (Stop Immediately If...)

- ❌ X API returns 429 (rate limit exceeded)
- ❌ Account suspension warning
- ❌ Multiple failed follow attempts (account may be private/banned)
- ❌ Profile doesn't exist (we verified wrong)
- ❌ Content violates X rules (hate speech, harassment, etc.)

**Action:** Pause 24h, review compliance, reduce rate limits if needed.

---

## 📋 Team Responsibilities

| Agent | Responsibility | Compliance Check |
|-------|----------------|------------------|
| **Wobblus** | Overall coordination, Zero-Trust verification | Final approval before engagement |
| **Gimglich** | Browser relay execution | Verify profiles exist before follow |
| **Keridz** | Supabase/Notion tracking | Ensure only verified accounts tracked |
| **Hugrukal** | Architecture review | Confirm compliance with X rules |
| **Nikaya** | Quality assurance | Audit engagement logs weekly |
| **Chanshuk** | Pipeline coordination | Ensure rate limits enforced |

---

## 📖 Reference Documents

- **X Rules:** https://help.x.com/en/rules-and-policies/x-rules
- **Authenticity Policy:** https://help.x.com/en/rules-and-policies/authenticity.html
- **Spam Policy:** https://help.x.com/en/rules-and-policies/spam
- **Automation Rules:** https://help.x.com/en/rules-and-policies/automation

---

**Acknowledged by Team:** 2026-04-27  
**Next Review:** 2026-05-04 (weekly compliance audit)

*Report by Wobblus 🔧 — X Platform Rules compliance integrated into x-warmup protocol.*
