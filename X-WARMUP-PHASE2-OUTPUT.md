# X/Twitter Warmup Phase 2 - Output for API

**Date:** 2026-03-02 17:55 CST  
**Phase:** Phase 2 - Quote Tweet + Strategic Reply  
**Strategy:** Add value with Alygn perspective (NO selling)  
**Prerequisite:** Phase 1 complete (followed + liked 1-2 days ago)

---

## 📊 **Execution Plan**

**Total Actions:** 4 actions
- **2 Quote Tweets** (municipalities with active X presence)
- **2 Strategic Replies** (to ongoing conversations)
- **Delays:** 15-25 seconds random between each action
- **Estimated Time:** 2-3 minutes

**Rate Limits:**
- Quotes: 2/4 (within daily limit)
- Replies: 2/6 (within daily limit)

**Timing:**
- Execute 1-2 days AFTER Phase 1
- Allows municipalities to notice the follow
- Builds familiarity before quote/reply

---

## 🎯 **Content to Post**

### **Quote Tweet 1: Liberia (Priority 1)**

**Context:**
- Municipality: Liberia, Guanacaste
- Mayor: José Javier Calvo Darcia
- Crisis: Airport closures, tourism decline
- Research: 167 flights canceled, $60M loss, 22k jobs

**Target Tweet:**
```
Search for: from:@MuniLiberia (airport OR turismo OR crisis)
Select: Most recent tweet about airport or tourism
```

**Quote Tweet Content (Spanish):**
```
Perspectiva importante de Liberia. La legitimidad de la 
gobernanza es la infraestructura que habilita la coordinación 
sin centralización.

Los desafíos del aeropuerto requieren marcos de coordinación 
multi-stakeholder preparados ANTES de la crisis, no improvisados 
durante la emergencia.

#aialygn #GobernanzaIA #Liberia
```

**Why This Content:**
- ✅ References specific crisis (airport)
- ✅ Uses proposal language ("gobernanza", "coordinación")
- ✅ Adds value (preparedness vs improvisation)
- ✅ NO selling ("check out Alygn")
- ✅ Spanish (official language)
- ✅ Formal but accessible tone

**X API Payload:**
```json
POST /2/tweets
{
  "text": "Perspectiva importante de Liberia. La legitimidad de la gobernanza es la infraestructura que habilita la coordinación sin centralización.\n\nLos desafíos del aeropuerto requieren marcos de coordinación multi-stakeholder preparados ANTES de la crisis, no improvisados durante la emergencia.\n\n#aialygn #GobernanzaIA #Liberia",
  "quote_tweet_id": "TWEET_ID_FROM_SEARCH"
}
```

---

### **Quote Tweet 2: Heredia (Priority 2)**

**Context:**
- Municipality: Heredia
- Mayor: Ángela Aguilar Vargas
- Context: Tech hub, Intel $1.2B, Movate AI facility
- Research: AI talent shortage, cybersecurity, infrastructure gaps

**Target Tweet:**
```
Search for: from:@MuniHeredia (tecnología OR innovación OR Intel OR IA)
Select: Most recent tweet about technology or innovation
```

**Quote Tweet Content (Spanish):**
```
Excelente ver el liderazgo de Heredia en tecnología e innovación. 
La Inteligencia Artificial requiere gobernanza institucional, 
no solo infraestructura técnica.

Los marcos de coordinación neutral permiten a municipalidades 
como Heredia escalar sistemas de IA con rendición de cuentas 
y supervisión independiente.

#aialygn #GobernanzaIA #Heredia #Innovación
```

**Why This Content:**
- ✅ Acknowledges leadership (positive reinforcement)
- ✅ Distinguishes governance from technology
- ✅ Mentions specific value (accountability, oversight)
- ✅ NO selling
- ✅ Spanish
- ✅ References specific context (Heredia tech hub)

**X API Payload:**
```json
POST /2/tweets
{
  "text": "Excelente ver el liderazgo de Heredia en tecnología e innovación. La Inteligencia Artificial requiere gobernanza institucional, no solo infraestructura técnica.\n\nLos marcos de coordinación neutral permiten a municipalidades como Heredia escalar sistemas de IA con rendición de cuentas y supervisión independiente.\n\n#aialygn #GobernanzaIA #Heredia #Innovación",
  "quote_tweet_id": "TWEET_ID_FROM_SEARCH"
}
```

---

### **Reply 1: San José (Priority 3)**

**Context:**
- Municipality: San José (capital)
- Mayor: Luis Diego Miranda Méndez
- Issues: Crime rates, traffic, smart city initiatives
- Research: 120 complaints about infrastructure, crime #1 voter concern

**Target Tweet:**
```
Search for: from:@MuniSanJoseCR (seguridad OR tráfico OR infraestructura OR tecnología)
Select: Tweet with ongoing conversation (has replies)
```

**Reply Content (Spanish):**
```
@MuniSanJoseCR Es alentador ver las iniciativas de seguridad 
ciudadana. Los sistemas de IA para vigilancia y gestión urbana 
requieren marcos de gobernanza que aseguren rendición de cuentas 
sin centralizar control.

La coordinación entre departamentos municipales es clave para 
implementar tecnología con legitimidad institucional.

#aialygn #GobernanzaIA
```

**Why This Content:**
- ✅ Addresses mayor directly (@MuniSanJoseCR)
- ✅ Specific to context (security, urban management)
- ✅ Adds governance perspective (accountability without centralization)
- ✅ NO selling
- ✅ Spanish
- ✅ Conversational but professional tone

**X API Payload:**
```json
POST /2/tweets
{
  "text": "@MuniSanJoseCR Es alentador ver las iniciativas de seguridad ciudadana. Los sistemas de IA para vigilancia y gestión urbana requieren marcos de gobernanza que aseguren rendición de cuentas sin centralizar control.\n\nLa coordinación entre departamentos municipales es clave para implementar tecnología con legitimidad institucional.\n\n#aialygn #GobernanzaIA",
  "reply": {
    "in_reply_to_tweet_id": "TWEET_ID_FROM_SEARCH"
  }
}
```

---

### **Reply 2: Cartago (Priority 4)**

**Context:**
- Municipality: Cartago
- Mayor: Mario Redondo Poveda
- Issues: Infrastructure delays, landfill crisis, bridge conditions
- Research: 70% bridges in poor condition, waste management crisis

**Target Tweet:**
```
Search for: from:@MuniCartago OR from:MuniCartago (infraestructura OR residuos OR desarrollo)
Select: Tweet about infrastructure or development
```

**Reply Content (Spanish):**
```
@MuniCartago Los desafíos de infraestructura en Cartago ilustran 
por qué la coordinación institucional no puede ser improvisada. 

Los sistemas de IA para monitoreo de infraestructura y gestión 
de residuos requieren protocolos de emergencia y marcos de 
coordinación preparados ANTES de que fallen los sistemas.

#aialygn #GobernanzaIA #Cartago
```

**Why This Content:**
- ✅ Addresses municipality directly
- ✅ Specific to researched issues (infrastructure, waste)
- ✅ Ties to Alygn value (preparedness, emergency protocols)
- ✅ NO selling
- ✅ Spanish
- ✅ Professional, value-add tone

**X API Payload:**
```json
POST /2/tweets
{
  "text": "@MuniCartago Los desafíos de infraestructura en Cartago ilustran por qué la coordinación institucional no puede ser improvisada.\n\nLos sistemas de IA para monitoreo de infraestructura y gestión de residuos requieren protocolos de emergencia y marcos de coordinación preparados ANTES de que fallen los sistemas.\n\n#aialygn #GobernanzaIA #Cartago",
  "reply": {
    "in_reply_to_tweet_id": "TWEET_ID_FROM_SEARCH"
  }
}
```

---

## ⏱️ **Execution Timeline**

```
T+0s:   POST Quote Tweet 1 (Liberia)
        - Search for tweet from @MuniLiberia
        - Quote with Alygn perspective
        - Wait 15-25s (random: 20s)

T+20s:  POST Quote Tweet 2 (Heredia)
        - Search for tweet from @MuniHeredia
        - Quote with governance perspective
        - Wait 15-25s (random: 18s)

T+38s:  POST Reply 1 (San José)
        - Search for conversation from @MuniSanJoseCR
        - Reply with value-add perspective
        - Wait 15-25s (random: 22s)

T+60s:  POST Reply 2 (Cartago)
        - Search for tweet from @MuniCartago
        - Reply with infrastructure context
        - Done!
```

**Total Time:** ~1 minute (with delays)

---

## 📋 **What to Send to X API**

### **Step 1: Search for Target Tweets**

```bash
# Search for Liberia tweet
GET /2/tweets/search/recent?query=from:MuniLiberia%20(airport%20OR%20turismo)&max_results=5

# Search for Heredia tweet
GET /2/tweets/search/recent?query=from:MuniHeredia%20(tecnología%20OR%20innovación%20OR%20Intel)&max_results=5

# Search for San José conversation
GET /2/tweets/search/recent?query=from:MuniSanJoseCR%20(seguridad%20OR%20tráfico)&max_results=5

# Search for Cartago tweet
GET /2/tweets/search/recent?query=from:MuniCartago%20(infraestructura%20OR%20residuos)&max_results=5
```

### **Step 2: Post Quote Tweets**

```bash
# Quote Tweet 1: Liberia
POST /2/tweets
{
  "text": "Perspectiva importante de Liberia. La legitimidad de la gobernanza es la infraestructura que habilita la coordinación sin centralización.\n\nLos desafíos del aeropuerto requieren marcos de coordinación multi-stakeholder preparados ANTES de la crisis, no improvisados durante la emergencia.\n\n#aialygn #GobernanzaIA #Liberia",
  "quote_tweet_id": "1234567890"  // From search results
}

# Quote Tweet 2: Heredia
POST /2/tweets
{
  "text": "Excelente ver el liderazgo de Heredia en tecnología e innovación. La Inteligencia Artificial requiere gobernanza institucional, no solo infraestructura técnica.\n\nLos marcos de coordinación neutral permiten a municipalidades como Heredia escalar sistemas de IA con rendición de cuentas y supervisión independiente.\n\n#aialygn #GobernanzaIA #Heredia #Innovación",
  "quote_tweet_id": "2345678901"  // From search results
}
```

### **Step 3: Post Replies**

```bash
# Reply 1: San José
POST /2/tweets
{
  "text": "@MuniSanJoseCR Es alentador ver las iniciativas de seguridad ciudadana. Los sistemas de IA para vigilancia y gestión urbana requieren marcos de gobernanza que aseguren rendición de cuentas sin centralizar control.\n\nLa coordinación entre departamentos municipales es clave para implementar tecnología con legitimidad institucional.\n\n#aialygn #GobernanzaIA",
  "reply": {
    "in_reply_to_tweet_id": "3456789012"  // From search results
  }
}

# Reply 2: Cartago
POST /2/tweets
{
  "text": "@MuniCartago Los desafíos de infraestructura en Cartago ilustran por qué la coordinación institucional no puede ser improvisada.\n\nLos sistemas de IA para monitoreo de infraestructura y gestión de residuos requieren protocolos de emergencia y marcos de coordinación preparados ANTES de que fallen los sistemas.\n\n#aialygn #GobernanzaIA #Cartago",
  "reply": {
    "in_reply_to_tweet_id": "4567890123"  // From search results
  }
}
```

---

## ✅ **Quality Checklist**

**Before Posting, Verify:**

- [ ] Content is 100% Spanish (no English mixed in)
- [ ] References specific municipal issues (not generic)
- [ ] Uses proposal language (gobernanza, coordinación, legitimidad)
- [ ] NO selling ("check out Alygn", "visit our website")
- [ ] Adds value (perspective, insight, not promotion)
- [ ] Hashtags appropriate (#GobernanzaIA, #aialygn)
- [ ] Tone is professional but conversational
- [ ] Mentions mayor/municipality by name where appropriate

---

## 📊 **Expected X API Response**

### **Quote Tweet Response:**
```json
{
  "data": {
    "id": "1234567890123456789",
    "text": "Perspectiva importante de Liberia...",
    "edit_history_tweet_ids": ["1234567890123456789"]
  }
}
```

### **Reply Response:**
```json
{
  "data": {
    "id": "2345678901234567890",
    "text": "@MuniSanJoseCR Es alentador...",
    "edit_history_tweet_ids": ["2345678901234567890"]
  }
}
```

---

## 🎯 **Success Criteria**

**After Phase 2 Complete:**
- ✅ 2 quote tweets posted (Liberia, Heredia)
- ✅ 2 replies posted (San José, Cartago)
- ✅ No rate limit errors
- ✅ No spam flags
- ✅ Content visible on @aialygn profile
- ✅ Municipalities can see engagement

**Metrics to Track:**
- Impressions on quote tweets
- Replies from municipalities
- Follows back from municipalities
- Engagement rate (likes, retweets)

---

## 🔄 **What Happens Next**

### **Phase 3: Email Outreach (1-2 days after Phase 2)**

After X warmup is complete (Phase 1 + Phase 2), proceed with email:

**Email Subject:**
```
Alianza Estratégica para la Salvaguarda Institucional - Liberia
```

**Email Opening:**
```
Estimado Alcalde José Javier Calvo Darcia,

La Municipalidad de Liberia enfrenta desafíos únicos con las 167 
cancelaciones de vuelos y 30,000 pasajeros afectados en noviembre 
2024...

[Reference X engagement if they responded]
```

**Why This Sequence:**
1. Phase 1: Build awareness (follow + like)
2. Phase 2: Add value (quote + reply)
3. Phase 3: Send email (they recognize @aialygn)

**Expected Result:**
- Higher open rates (they've seen @aialygn before)
- Higher reply rates (familiarity built)
- Lower spam complaints (not cold outreach)

---

## ⚠️ **Important Notes**

### **If No Recent Tweets Found:**

If municipality hasn't tweeted recently:
- Skip quote tweet for that municipality
- Focus on reply to older but relevant tweet
- Or wait for them to post something new

### **If They Reply to Your Engagement:**

If municipality replies to your quote/reply:
- ✅ Respond promptly (within 24h)
- ✅ Keep conversation professional
- ✅ NO hard selling
- ✅ Build relationship first

### **If No Engagement from Municipality:**

If they don't notice/respond:
- ✅ Still proceed with email
- ✅ Reference X engagement in email
- ✅ "Following our recent engagement on X..."

---

**Generated by:** Wobblus 🔧  
**Date:** 2026-03-02 17:55 CST  
**Status:** ✅ **READY TO SEND TO X API**

---

## 📝 **Both Phases Summary**

### **Phase 1 (Complete):**
- 3 Follows
- 6 Likes
- Build awareness

### **Phase 2 (Ready):**
- 2 Quote Tweets
- 2 Replies
- Add value

### **Phase 3 (Next):**
- 5 Emails
- Personalized outreach
- Schedule calls

**Total Timeline:** 5-7 days (Phase 1 → Phase 2 → Phase 3)
