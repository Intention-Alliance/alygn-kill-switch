# X/Twitter Warmup Phase 1 - Output for API

**Date:** 2026-03-02 17:30 CST  
**Phase:** Phase 1 - Follow + Like  
**Strategy:** Build awareness before email outreach

---

## 📊 **Execution Plan**

**Total Actions:** 9 actions
- **3 Follows** (municipalities with verified X handles)
- **6 Likes** (2 per municipality)
- **Delays:** 15-25 seconds random between each action
- **Estimated Time:** 3-4 minutes

**Rate Limits:**
- Follows: 3/4 (within daily limit)
- Likes: 6/8 (within daily limit)

---

## 🎯 **Actions to Execute**

### **Action 1: Follow @MuniLiberia** (Priority 1)

**Target:**
```json
{
  "action": "follow",
  "handle": "@MuniLiberia",
  "municipality": "Liberia",
  "mayor": "José Javier Calvo Darcia",
  "reason": "PRIMARY ALYGN TARGET - Airport crisis coordination"
}
```

**Context:**
- 167 flights canceled (Nov 2024)
- 30,000 passengers affected
- $60M tourism loss
- 22,000 jobs lost

**X API Call:**
```bash
POST /2/users/:id/following
{
  "target_user_id": "FETCH_FROM_X_API"
}
```

**Why First:** Liberia is Alygn's primary target municipality

---

### **Action 2-3: Like 2 Tweets from @MuniLiberia**

**Target:**
```json
{
  "action": "like",
  "handle": "@MuniLiberia",
  "municipality": "Liberia",
  "tweets_to_like": 2,
  "search_query": "from:@MuniLiberia (airport OR turismo OR Liberia)"
}
```

**X API Call:**
```bash
# First, search for recent tweets
GET /2/tweets/search/recent?query=from:@MuniLiberia&max_results=5

# Then like each tweet
POST /2/users/:id/likes
{
  "tweet_id": "FETCH_FROM_SEARCH"
}
```

**Delay:** 15-25 seconds after follow

---

### **Action 4: Follow @MuniSanJoseCR** (Priority 2)

**Target:**
```json
{
  "action": "follow",
  "handle": "@MuniSanJoseCR",
  "municipality": "San José",
  "mayor": "Luis Diego Miranda Méndez",
  "reason": "Capital city - highest impact for AI governance"
}
```

**Context:**
- 288,054 population (largest in CR)
- Crime rates: #1 voter concern 2026
- Smart city initiatives
- Traffic congestion (120 complaints in 2024)

**X API Call:**
```bash
POST /2/users/:id/following
{
  "target_user_id": "FETCH_FROM_X_API"
}
```

---

### **Action 5-6: Like 2 Tweets from @MuniSanJoseCR**

**Target:**
```json
{
  "action": "like",
  "handle": "@MuniSanJoseCR",
  "municipality": "San José",
  "tweets_to_like": 2,
  "search_query": "from:@MuniSanJoseCR (seguridad OR tráfico OR infraestructura)"
}
```

**X API Call:**
```bash
GET /2/tweets/search/recent?query=from:@MuniSanJoseCR&max_results=5

POST /2/users/:id/likes
{
  "tweet_id": "FETCH_FROM_SEARCH"
}
```

**Delay:** 15-25 seconds after follow

---

### **Action 7: Follow @MuniHeredia** (Priority 3)

**Target:**
```json
{
  "action": "follow",
  "handle": "@MuniHeredia",
  "municipality": "Heredia",
  "mayor": "Ángela Aguilar Vargas",
  "reason": "Tech hub - Intel, Movate AI facilities"
}
```

**Context:**
- Intel $1.2B reinvestment
- Movate AI facility (300 jobs by end-2025)
- Costa Rica ranked #5 in LatAm AI Index 2025
- AI talent shortage

**X API Call:**
```bash
POST /2/users/:id/following
{
  "target_user_id": "FETCH_FROM_X_API"
}
```

---

### **Action 8-9: Like 2 Tweets from @MuniHeredia**

**Target:**
```json
{
  "action": "like",
  "handle": "@MuniHeredia",
  "municipality": "Heredia",
  "tweets_to_like": 2,
  "search_query": "from:@MuniHeredia (tecnología OR innovación OR Intel)"
}
```

**X API Call:**
```bash
GET /2/tweets/search/recent?query=from:@MuniHeredia&max_results=5

POST /2/users/:id/likes
{
  "tweet_id": "FETCH_FROM_SEARCH"
}
```

**Delay:** 15-25 seconds after follow

---

## ⏱️ **Execution Timeline**

```
T+0s:   Follow @MuniLiberia
T+20s:  Like tweet 1 from @MuniLiberia
T+40s:  Like tweet 2 from @MuniLiberia
T+60s:  Follow @MuniSanJoseCR
T+80s:  Like tweet 1 from @MuniSanJoseCR
T+100s: Like tweet 2 from @MuniSanJoseCR
T+120s: Follow @MuniHeredia
T+140s: Like tweet 1 from @MuniHeredia
T+160s: Like tweet 2 from @MuniHeredia
```

**Total Time:** ~2 minutes 40 seconds (with 20s average delays)

---

## 📋 **What to Send to X API**

### **Step 1: Get User IDs**
```bash
# Get user ID for @MuniLiberia
GET /2/users/by/username/MuniLiberia
Response: {"data": {"id": "1234567890", "name": "Municipalidad de Liberia"}}

# Get user ID for @MuniSanJoseCR
GET /2/users/by/username/MuniSanJoseCR
Response: {"data": {"id": "2345678901", "name": "Municipalidad de San José"}}

# Get user ID for @MuniHeredia
GET /2/users/by/username/MuniHeredia
Response: {"data": {"id": "3456789012", "name": "Municipalidad de Heredia"}}
```

### **Step 2: Follow Users**
```bash
# Follow @MuniLiberia
POST /2/users/:my_user_id/following
{
  "target_user_id": "1234567890"
}

# Follow @MuniSanJoseCR
POST /2/users/:my_user_id/following
{
  "target_user_id": "2345678901"
}

# Follow @MuniHeredia
POST /2/users/:my_user_id/following
{
  "target_user_id": "3456789012"
}
```

### **Step 3: Search & Like Tweets**
```bash
# Search tweets from @MuniLiberia
GET /2/tweets/search/recent?query=from:MuniLiberia&max_results=5
Response: {
  "data": [
    {"id": "tweet1", "text": "..."},
    {"id": "tweet2", "text": "..."}
  ]
}

# Like tweets
POST /2/users/:my_user_id/likes
{
  "tweet_id": "tweet1"
}

POST /2/users/:my_user_id/likes
{
  "tweet_id": "tweet2"
}
```

(Repeat for each municipality)

---

## ✅ **Success Criteria**

**After Execution:**
- ✅ Following 3 municipalities
- ✅ Liked 6 tweets total (2 per municipality)
- ✅ No rate limit errors
- ✅ No spam flags
- ✅ Account status: normal

**Expected Response from X API:**
```json
{
  "data": {
    "following": true,
    "pending_follow": false
  }
}
```

---

## 🎯 **Phase 2 Preview (Quote + Reply)**

**After Phase 1 complete (1-2 days later):**

**Quote Tweet for Liberia:**
```
Important perspective from Liberia. Governance legitimacy is the 
infrastructure that enables coordination without centralization. 
#AIGovernance

more at @aialygn
```

**Reply to San José:**
```
Great to see San José's initiatives in public security. AI 
governance frameworks can help ensure these systems remain 
accountable as they scale. #AIGovernance
```

**Phase 2 will be generated after Phase 1 completes.**

---

**Generated by:** Wobblus 🔧  
**Date:** 2026-03-02 17:30 CST  
**Status:** ✅ **READY TO SEND TO X API**
