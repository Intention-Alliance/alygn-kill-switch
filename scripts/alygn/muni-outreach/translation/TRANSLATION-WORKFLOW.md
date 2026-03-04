# Multi-Agent Translation & Quality Assurance System

**Date:** 2026-03-02 16:50 CST  
**Status:** ✅ **DESIGNED - READY FOR IMPLEMENTATION**

---

## 🎯 **System Architecture**

### **Two-Agent QA Loop**

```
┌─────────────────────────────────────────────────────────────┐
│                    TRANSLATION WORKFLOW                      │
└─────────────────────────────────────────────────────────────┘

         ┌─────────────────┐
         │  BASE CONTENT   │
         │  (English)      │
         └────────┬────────┘
                  │
                  ▼
         ┌─────────────────┐
         │  SUB-AGENT 1    │
         │  "Translator"   │
         │  IQ: 140        │
         │  Specialty:     │
         │  Translation,   │
         │  Localization   │
         └────────┬────────┘
                  │
                  │ Output: Draft Translation
                  │ (Target Language)
                  ▼
         ┌─────────────────┐
         │  SUB-AGENT 2    │
         │  "Reviewer"     │
         │  IQ: 140        │
         │  Specialty:     │
         │  Quality        │
         │  Assurance,     │
         │  Cultural       │
         │  Adaptation     │
         └────────┬────────┘
                  │
         ┌────────┴────────┐
         │                 │
    ✅ PASS          ❌ REJECT
         │                 │
         │                 │ Return to Agent 1
         │                 │ with feedback
         ▼                 ▼
┌─────────────────┐ ┌──────────────┐
│  FINAL OUTPUT   │ │  REVISION    │
│  (Approved)     │ │  LOOP        │
│  Send to Main   │ │  (Max 3      │
│  Agent          │ │  iterations) │
└─────────────────┘ └──────────────┘
```

---

## 🤖 **Sub-Agent Definitions**

### **Sub-Agent 1: "Translator"**

**Role:** Professional Translation & Localization

**System Prompt:**
```
You are a professional translator and localization specialist 
with IQ 140 and high emotional intelligence.

**Specialization:**
- Translation (English → Target Language)
- Localization (cultural adaptation, not just translation)
- Municipal/government communication
- Legal and formal document translation

**Quality Standards:**
- Maintain original meaning and intent
- Adapt to cultural context (not literal translation)
- Use formal register for government communications
- Preserve technical terminology accuracy
- Ensure readability in target language

**Output Format:**
{
  "original_text": "...",
  "translated_text": "...",
  "target_language": "es|fr|de|...",
  "translation_notes": ["..."],
  "cultural_adaptations": ["..."],
  "confidence_score": 0.0-1.0
}
```

**Capabilities:**
- ✅ Translate emails, X posts, documents
- ✅ Adapt cultural references
- ✅ Maintain formal register
- ✅ Preserve technical accuracy
- ✅ Provide translation notes

---

### **Sub-Agent 2: "Reviewer"**

**Role:** Quality Assurance & Cultural Validation

**System Prompt:**
```
You are a quality assurance specialist and cultural consultant 
with IQ 140 and high emotional intelligence.

**Specialization:**
- Translation quality review
- Cultural appropriateness validation
- Government communication standards
- Legal compliance (EU, GDPR, etc.)

**Review Criteria:**
1. **Accuracy:** Does translation preserve original meaning?
2. **Fluency:** Is it natural in target language?
3. **Cultural Fit:** Is it appropriate for target culture?
4. **Formality:** Is register appropriate for government?
5. **Compliance:** Does it meet legal requirements (EU, etc.)?
6. **Consistency:** Is terminology consistent?

**Output Format:**
{
  "review_status": "PASS|REJECT",
  "quality_score": 0.0-1.0,
  "issues_found": ["..."],
  "suggestions": ["..."],
  "cultural_notes": ["..."],
  "compliance_check": {
    "gdpr": true|false,
    "formal_register": true|false,
    "cultural_appropriate": true|false
  },
  "revision_required": true|false,
  "revision_notes": "..."
}
```

**Capabilities:**
- ✅ Review translation quality
- ✅ Validate cultural appropriateness
- ✅ Check legal compliance
- ✅ Provide constructive feedback
- ✅ Approve or request revision

---

## 🔄 **Revision Loop Process**

### **Iteration 1:**
```
Translator → Draft Translation → Reviewer → REJECT (with feedback)
                                                      ↓
                                              Translator (revision)
```

### **Iteration 2:**
```
Translator → Revised Translation → Reviewer → REJECT (with feedback)
                                                      ↓
                                              Translator (revision)
```

### **Iteration 3:**
```
Translator → Final Revision → Reviewer → PASS ✅
                                           ↓
                                   Output to Main Agent
```

**Max Iterations:** 3 (prevents infinite loops)

**Escalation:** If 3 iterations fail → Flag for human review

---

## 📋 **Workflow Definition (Lobster)**

### **File:** `.lobster/translation-qa.lobster`

```yaml
name: translation-qa
description: Multi-agent translation quality assurance workflow
metadata:
  version: "1.0"
  agents: 2

steps:
  # Phase 1: Translate
  - id: phase1-translate
    command: >
      openclaw sessions spawn 
      --runtime=subagent 
      --mode=run 
      --task="Translate the following content from English to {TARGET_LANGUAGE}: 
      {CONTENT}. 
      You are a professional translator with IQ 140. 
      Output JSON with translation, notes, and confidence score."
    description: "Sub-Agent 1: Translate content"
    output:
      file: /tmp/translation-draft.json

  # Phase 2: Review
  - id: phase2-review
    command: >
      openclaw sessions spawn 
      --runtime=subagent 
      --mode=run 
      --task="Review this translation for quality, cultural fit, and compliance: 
      {TRANSLATION_DRAFT}. 
      You are a QA specialist with IQ 140. 
      Output JSON with PASS/REJECT status and feedback."
    description: "Sub-Agent 2: Review translation"
    output:
      file: /tmp/translation-review.json

  # Phase 3: Decision
  - id: phase3-decision
    command: >
      node scripts/alygn/muni-outreach/translation/translation-decision.js 
      --review=/tmp/translation-review.json 
      --draft=/tmp/translation-draft.json
    description: "Decide: Approve or Request Revision"
    
  # Phase 4: Revision Loop (if needed)
  - id: phase4-revision
    command: >
      openclaw sessions spawn 
      --runtime=subagent 
      --mode=run 
      --task="Revise translation based on reviewer feedback: 
      {FEEDBACK}. 
      Original: {ORIGINAL}. 
      Previous draft: {PREVIOUS_DRAFT}.
      You are a professional translator with IQ 140."
    description: "Sub-Agent 1: Revise translation"
    after: phase3-decision
    condition: "revision_required == true"
    max_iterations: 3
    output:
      file: /tmp/translation-revision.json

  # Phase 5: Final Output
  - id: phase5-output
    command: >
      node scripts/alygn/muni-outreach/translation/finalize-translation.js 
      --approved=/tmp/translation-review.json
    description: "Finalize approved translation"
    after: phase3-decision
    condition: "revision_required == false"
    output:
      file: /tmp/translation-final.json

# Error handling
on_error:
  notify: discord
  channel: "1466532145257255004"
  escalate_to_human: true

# Resumability
resume:
  enabled: true
  token_file: /tmp/translation-resume-token.json
```

---

## 📁 **File Structure**

```
scripts/alygn/muni-outreach/translation/
├── TRANSLATION-WORKFLOW.md          ✅ This document
├── translator-agent.js               ⏳ Sub-Agent 1 (Translator)
├── reviewer-agent.js                 ⏳ Sub-Agent 2 (Reviewer)
├── translation-decision.js           ⏳ Decision logic
├── finalize-translation.js           ⏳ Final output formatting
└── templates/
    ├── es/
    │   ├── governance-email.txt
    │   └── institutional-email.txt
    ├── fr/
    │   ├── governance-email.txt
    │   └── institutional-email.txt
    ├── de/
    │   ├── governance-email.txt
    │   └── institutional-email.txt
    └── en/
        ├── governance-email.txt
        └── institutional-email.txt
```

---

## 🎯 **Usage Examples**

### **Example 1: Translate Email to Spanish**

**Input (English):**
```json
{
  "content": "Dear Mayor, Our alliance enables coordination without centralization...",
  "target_language": "es",
  "context": "Costa Rica municipal outreach",
  "formality": "formal"
}
```

**Process:**
1. Sub-Agent 1 translates to Spanish
2. Sub-Agent 2 reviews (checks: formal register, cultural fit, CR Spanish)
3. If PASS → Output approved translation
4. If REJECT → Return to Agent 1 with feedback

**Output (Spanish):**
```json
{
  "status": "APPROVED",
  "quality_score": 0.95,
  "translated_content": "Estimado Alcalde, Nuestra alianza habilita coordinación sin centralización...",
  "reviewer_notes": ["Formal register correct", "Cultural adaptation appropriate for CR"],
  "compliance": {
    "formal_register": true,
    "cultural_appropriate": true,
    "gdpr_compliant": true
  }
}
```

---

### **Example 2: Translate Email to French (EU Compliance)**

**Input (English):**
```json
{
  "content": "Dear Mayor, Alygn supports coordination...",
  "target_language": "fr",
  "context": "France municipal outreach",
  "formality": "very_formal",
  "compliance": ["gdpr", "eu_regulations"]
}
```

**Process:**
1. Sub-Agent 1 translates to French (very formal)
2. Sub-Agent 2 reviews (checks: "Monsieur le Maire", GDPR compliance, EU regulations)
3. If GDPR disclaimer missing → REJECT with feedback
4. Agent 1 adds GDPR disclaimer
5. Agent 2 re-reviews → PASS

**Output (French):**
```json
{
  "status": "APPROVED",
  "quality_score": 0.98,
  "translated_content": "Monsieur le Maire, Alygn soutient la coordination...",
  "reviewer_notes": [
    "Formal address correct (Monsieur le Maire)",
    "GDPR disclaimer added",
    "EU compliance verified"
  ],
  "compliance": {
    "formal_register": true,
    "cultural_appropriate": true,
    "gdpr_compliant": true,
    "eu_regulations_compliant": true
  }
}
```

---

## 📊 **Quality Metrics**

### **Translation Quality Score**

**Criteria:**
- **Accuracy (30%):** Preserves original meaning
- **Fluency (25%):** Natural in target language
- **Cultural Fit (25%):** Appropriate for target culture
- **Compliance (20%):** Meets legal/regulatory requirements

**Score Thresholds:**
- ✅ **PASS:** ≥ 0.85
- ⚠️ **REVISION:** 0.70 - 0.84
- ❌ **REJECT:** < 0.70

### **Revision Metrics**

**Track:**
- Number of revisions per translation
- Common rejection reasons
- Average quality score improvement
- Time per iteration

**Goal:**
- Average revisions: ≤ 2
- Final quality score: ≥ 0.90
- Human escalation rate: < 5%

---

## 🔧 **Integration with Municipal Outreach**

### **Updated Workflow**

```
Discovery → Research → Translation QA → Personalization → Verification → Sending
                          ↑
                   Multi-Agent QA Loop
                   (Translator + Reviewer)
```

### **When to Use Translation QA**

**Use Translation QA when:**
- ✅ Target language ≠ English
- ✅ Formal government communication
- ✅ Legal compliance required (EU, etc.)
- ✅ High-stakes outreach (first contact)

**Skip Translation QA when:**
- ⚠️ English is official language (USA, etc.)
- ⚠️ Informal communication (internal only)
- ⚠️ Low-stakes (follow-up, not first contact)

---

## 🎯 **Next Steps**

### **1. Create Sub-Agent Scripts** ⏳
- [ ] `translator-agent.js` (Sub-Agent 1)
- [ ] `reviewer-agent.js` (Sub-Agent 2)
- [ ] `translation-decision.js` (Decision logic)
- [ ] `finalize-translation.js` (Final output)

### **2. Create Translation Templates** ⏳
- [ ] `templates/es/governance-email.txt`
- [ ] `templates/es/institutional-email.txt`
- [ ] `templates/fr/governance-email.txt`
- [ ] `templates/fr/institutional-email.txt`
- [ ] `templates/de/governance-email.txt`
- [ ] `templates/de/institutional-email.txt`

### **3. Create Lobster Workflow** ⏳
- [ ] `.lobster/translation-qa.lobster`
- [ ] Integrate with main municipal outreach workflow

### **4. Test Translation QA** ⏳
- [ ] Test English → Spanish (Costa Rica)
- [ ] Test English → French (France)
- [ ] Test English → German (Germany)
- [ ] Verify quality scores ≥ 0.85
- [ ] Verify revision loop works

---

## ✅ **Benefits**

### **vs DeepL Pro + Native Speaker**

| Aspect | DeepL + Native | Multi-Agent QA | Winner |
|--------|---------------|----------------|--------|
| **Cost** | $$$ (DeepL subscription + native speaker) | $ (AI agents) | ✅ Multi-Agent |
| **Speed** | Hours-Days (human review) | Minutes (AI review) | ✅ Multi-Agent |
| **Consistency** | Variable (depends on reviewer) | Consistent (same criteria) | ✅ Multi-Agent |
| **Scalability** | Limited (human bottleneck) | Unlimited (AI scales) | ✅ Multi-Agent |
| **Quality** | High (native speaker) | High (IQ 140 specialists) | 🤝 Tie |
| **Cultural Nuance** | Excellent (native) | Very Good (trained) | ⚠️ DeepL + Native |
| **Availability** | Business hours | 24/7 | ✅ Multi-Agent |

**Recommendation:** Use Multi-Agent QA for 95% of translations, human native speaker for 5% (highest stakes, legal documents).

---

**Prepared by:** Wobblus 🔧  
**Date:** 2026-03-02 16:50 CST  
**Status:** ✅ **DESIGNED - READY FOR IMPLEMENTATION**
