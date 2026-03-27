# Discord Report Examples

Complete examples of Discord dry-run reports for every stage and entity type.

---

## Table of Contents

1. [VC Discovery](#vc-discovery)
2. [VC Validate](#vc-validate)
3. [VC Research](#vc-research)
4. [VC Personalize](#vc-personalize)
5. [VC Send](#vc-send)
6. [Municipal Discovery](#municipal-discovery)
7. [Municipal Validate](#municipal-validate)
8. [Municipal Research](#municipal-research)
9. [Municipal Personalize](#municipal-personalize)
10. [Municipal Send](#municipal-send)

---

## VC Discovery

````markdown
🧪 **Pre-Production Dry-Run Report**
📅 2026-03-27 10:00:00 UTC
🎯 VC Discover (3 entities)

📡 **API Calls**

- ✅ **Perplexity API**: success (1.2s)
  - Request: Query: "AI safety venture capital", Limit: 10
  - Response: Found 8 VC firms with AI safety focus

📊 **Data Retrieved** (3 entities)

**Entity 1: AI Safety Ventures**

```json
{
  "id": "entity-mmxx7okp-1jojna",
  "name": "AI Safety Ventures",
  "email": "contact@aisafetyvc.com",
  "website": "https://aisafetyvc.com",
  "location": { "city": "San Francisco", "state": "CA", "country": "US" },
  "typeData": {
    "firmType": "vc",
    "stageFocus": ["seed", "series-a"],
    "sectorFocus": ["AI safety", "governance"],
    "relevanceScore": 85
  }
}
```
````

**Entity 2: Frontier Capital**

```json
{
  "id": "entity-mmxx7okp-92p5q9",
  "name": "Frontier Capital",
  "email": "investors@frontiercap.com",
  "website": "https://frontiercap.com",
  "location": { "city": "Boston", "state": "MA", "country": "US" },
  "typeData": {
    "firmType": "vc",
    "stageFocus": ["series-a", "series-b"],
    "sectorFocus": ["frontier tech", "AI"],
    "relevanceScore": 78
  }
}
```

_... and 1 more entity_

**Key Fields Populated:**

- ✅ Name, Email, Website
- ✅ Location data
- ✅ Firm type, Stage focus, Sector focus
- ✅ Relevance score

💾 **Database Simulation**

- **Notion**: Would create 3 pages, update 0
  - Database: Outreach Pipeline
  - Simulated file: `data/dry-run/notion-vc-2026-03-27.json`
- **Supabase**: Would insert 3 rows
  - Tables: municipalities
  - Simulated file: `data/dry-run/supabase-vc-2026-03-27.json`

✅ **Validation Results**
No email validation performed in discovery stage

🚀 **Next Steps**

- **In Production:**

  - 3 VC firms would be discovered and stored in the database.

- **Recommendations:**
  - ✅ Data looks complete - proceed to validation

📝 **Action Items:**

- [ ] Run: --type=vc --action=validate

📄 **Full Data:**

- State file: `$HOME/.openclaw/workspace/reports/alygn/vc-discover/alygn-vc-discovered-2026-03-27.json`

````

---

## VC Validate

```markdown
🧪 **Pre-Production Dry-Run Report**
📅 2026-03-27 10:15:00 UTC
🎯 VC Validate (3 entities)

📡 **API Calls**
- ✅ **ZeroBounce API**: success (0.8s)
  - Request: Validate 3 email addresses
  - Response: 2 valid, 1 risky

📊 **Data Retrieved** (3 entities)

**Entity 1: AI Safety Ventures**
```json
{
  "id": "entity-mmxx7okp-1jojna",
  "name": "AI Safety Ventures",
  "email": "contact@aisafetyvc.com",
  "emailValidation": {
    "result": "valid",
    "confidence": 95,
    "validator": "zerobounce"
  }
}
````

**Entity 2: Frontier Capital**

```json
{
  "id": "entity-mmxx7okp-92p5q9",
  "name": "Frontier Capital",
  "email": "investors@frontiercap.com",
  "emailValidation": {
    "result": "valid",
    "confidence": 92,
    "validator": "zerobounce"
  }
}
```

_... and 1 more entity_

**Key Fields Populated:**

- ✅ Name, Email, Website
- ✅ Location data
- ✅ Firm type, Stage focus, Sector focus
- ✅ Relevance score

💾 **Database Simulation**

- **Notion**: Would create 0 pages, update 3
  - Database: Outreach Pipeline
  - Simulated file: `data/dry-run/notion-vc-2026-03-27.json`
- **Supabase**: Would insert 0 rows
  - Tables: municipalities
  - Simulated file: `data/dry-run/supabase-vc-2026-03-27.json`

✅ **Validation Results**

| Email                       | Status   | Confidence | Validator  |
| --------------------------- | -------- | ---------- | ---------- |
| <contact@aisafetyvc.com>    | ✅ valid | 95%        | zerobounce |
| <investors@frontiercap.com> | ✅ valid | 92%        | zerobounce |
| <info@uncommonvc.io>        | ⚠️ risky | 65%        | zerobounce |

**Issues Found:**

- ⚠️ <info@uncommonvc.io>: Catch-all domain detected

🚀 **Next Steps**

- **In Production:**

  - 3 email addresses would be validated using configured validator.

- **Recommendations:**
  - ⚠️ 1 risky emails found - consider validation options

📝 **Action Items:**

- [ ] Run: --type=vc --action=research

📄 **Full Data:**

- State file: `$HOME/.openclaw/workspace/reports/alygn/vc-validate/alygn-vc-validated-2026-03-27.json`

````

---

## VC Research

```markdown
🧪 **Pre-Production Dry-Run Report**
📅 2026-03-27 10:30:00 UTC
🎯 VC Research (3 entities)

📡 **API Calls**
- ✅ **Perplexity API**: success (2.1s)
  - Request: Research: AI Safety Ventures
  - Response: Portfolio analysis complete
- ✅ **Perplexity API**: success (1.8s)
  - Request: Research: Frontier Capital
  - Response: Investment thesis retrieved
- ✅ **Perplexity API**: success (1.5s)
  - Request: Research: Uncommon VC
  - Response: Partner information found

📊 **Data Retrieved** (3 entities)

**Entity 1: AI Safety Ventures**
```json
{
  "id": "entity-mmxx7okp-1jojna",
  "name": "AI Safety Ventures",
  "email": "contact@aisafetyvc.com",
  "typeData": {
    "firmType": "vc",
    "partners": [
      { "name": "Dr. Sarah Chen", "title": "Managing Partner" }
    ],
    "recentInvestments": [
      { "company": "SafeAI Co", "date": "2025-12", "stage": "seed" }
    ],
    "painPoints": ["AI alignment", "governance frameworks"]
  },
  "researchNotes": "Leading AI safety VC with strong academic connections..."
}
````

**Entity 2: Frontier Capital**

```json
{
  "id": "entity-mmxx7okp-92p5q9",
  "name": "Frontier Capital",
  "email": "investors@frontiercap.com",
  "typeData": {
    "firmType": "vc",
    "aum": 500000000,
    "checkSizeMin": 1000000,
    "checkSizeMax": 10000000,
    "painPoints": ["portfolio governance", "risk management"]
  }
}
```

_... and 1 more entity_

**Key Fields Populated:**

- ✅ Name, Email, Website
- ✅ Location data
- ✅ Firm type, Stage focus, Sector focus
- ✅ Relevance score

💾 **Database Simulation**

- **Notion**: Would create 0 pages, update 3
  - Database: Outreach Pipeline
  - Simulated file: `data/dry-run/notion-vc-2026-03-27.json`
- **Supabase**: Would insert 0 rows
  - Tables: municipalities
  - Simulated file: `data/dry-run/supabase-vc-2026-03-27.json`

✅ **Validation Results**
Emails validated in previous stage
No new validation in research stage

🚀 **Next Steps**

- **In Production:**

  - 3 VC firms would be enriched with research data.

- **Recommendations:**
  - ✅ Research complete - proceed to personalization

📝 **Action Items:**

- [ ] Run: --type=vc --action=personalize

📄 **Full Data:**

- State file: `$HOME/.openclaw/workspace/reports/alygn/vc-research/alygn-vc-researched-2026-03-27.json`

````

---

## VC Personalize

```markdown
🧪 **Pre-Production Dry-Run Report**
📅 2026-03-27 10:45:00 UTC
🎯 VC Personalize (2 entities)

📡 **API Calls**
- ✅ **Perplexity API**: success (1.5s)
  - Request: Generate personalization for AI Safety Ventures
- ✅ **Notion API**: skipped (dry-run)
  - Would create 2 pages

📊 **Data Retrieved** (2 entities)

**Entity 1: AI Safety Ventures**
```json
{
  "id": "entity-mmxx7okp-1jojna",
  "name": "AI Safety Ventures",
  "email": "contact@aisafetyvc.com",
  "draftStatus": "Drafted",
  "personalizationContext": {
    "subject": "AI Safety Ventures: Governance Solutions for Portfolio Companies",
    "variant": "governance",
    "language": "en",
    "customHook": "Your recent investment in SafeAI Co shows your commitment..."
  }
}
````

**Entity 2: Frontier Capital**

```json
{
  "id": "entity-mmxx7okp-92p5q9",
  "name": "Frontier Capital",
  "email": "investors@frontiercap.com",
  "draftStatus": "Drafted",
  "personalizationContext": {
    "subject": "Frontier Capital: AI Governance for Your Portfolio",
    "variant": "governance",
    "language": "en",
    "customHook": "With $500M AUM, governance at scale matters..."
  }
}
```

**Key Fields Populated:**

- ✅ Name, Email, Website
- ✅ Location data
- ✅ Firm type, Stage focus, Sector focus
- ✅ Relevance score

💾 **Database Simulation**

- **Notion**: Would create 2 pages, update 0
  - Database: Outreach Pipeline
  - Simulated file: `data/dry-run/notion-vc-2026-03-27.json`
- **Supabase**: Would insert 2 rows
  - Tables: outreach_emails
  - Simulated file: `data/dry-run/supabase-vc-2026-03-27.json`

✅ **Validation Results**
Emails validated in previous stage
No new validation in personalize stage

🚀 **Next Steps**

- **In Production:**

  - 2 personalized emails would be generated and saved as drafts.

- **Recommendations:**
  - ✅ Personalization complete - awaiting approval

📝 **Action Items:**

- [ ] Review drafts in Notion
- [ ] Approve/reject each draft
- [ ] Run send action with approved IDs

📄 **Full Data:**

- State file: `$HOME/.openclaw/workspace/reports/alygn/vc-personalized/alygn-vc-personalized-2026-03-27.json`

````

---

## VC Send

```markdown
🧪 **Pre-Production Dry-Run Report**
📅 2026-03-27 11:00:00 UTC
🎯 VC Send (2 entities)

📡 **API Calls**
- ⏸️ **Smartlead API**: skipped (dry-run)
  - Would send 2 emails
- ⏸️ **Notion API**: skipped (dry-run)
  - Would update 2 pages

📊 **Data Retrieved** (2 entities)

**Entity 1: AI Safety Ventures**
```json
{
  "id": "entity-mmxx7okp-1jojna",
  "name": "AI Safety Ventures",
  "email": "contact@aisafetyvc.com",
  "draftStatus": "Approved",
  "personalizationContext": {
    "subject": "AI Safety Ventures: Governance Solutions for Portfolio Companies",
    "variant": "governance"
  }
}
````

**Entity 2: Frontier Capital**

```json
{
  "id": "entity-mmxx7okp-92p5q9",
  "name": "Frontier Capital",
  "email": "investors@frontiercap.com",
  "draftStatus": "Approved",
  "personalizationContext": {
    "subject": "Frontier Capital: AI Governance for Your Portfolio",
    "variant": "governance"
  }
}
```

**Send Filter Applied:**

- Draft Status: `Approved`
- Send List: `entity-mmxx7okp-1jojna, entity-mmxx7okp-92p5q9`
- Match: 2/2 entities passed filters

**Key Fields Populated:**

- ✅ Name, Email, Website
- ✅ Location data
- ✅ Firm type, Stage focus, Sector focus
- ✅ Relevance score

💾 **Database Simulation**

- **Notion**: Would create 0 pages, update 2
  - Database: Outreach Pipeline
  - Simulated file: `data/dry-run/notion-vc-2026-03-27.json`
- **Supabase**: Would insert 2 rows
  - Tables: outreach_emails, municipalities
  - Simulated file: `data/dry-run/supabase-vc-2026-03-27.json`

✅ **Validation Results**

| Email                       | Status   | Last Sent |
| --------------------------- | -------- | --------- |
| <contact@aisafetyvc.com>    | ✅ Ready | Never     |
| <investors@frontiercap.com> | ✅ Ready | Never     |

🚀 **Next Steps**

- **In Production:**

  - 2 emails would be sent via Smartlead/SMTP.

- **Recommendations:**
  - ✅ All filters passed - ready to send
  - ✅ Drafts approved by human review

📝 **Action Items:**

- [ ] Final review: Check subject lines
- [ ] Run: --action=send --dry-run=false

📄 **Full Data:**

- State file: `$HOME/.openclaw/workspace/reports/alygn/vc-sent/alygn-vc-sent-2026-03-27.json`

````

---

## Municipal Discovery

```markdown
🧪 **Pre-Production Dry-Run Report**
📅 2026-03-27 09:00:00 UTC
🎯 Municipal Discover (5 entities)

📡 **API Calls**
- ✅ **Internal API**: success (0.1s)
  - Request: Load Costa Rica cantones
  - Response: Retrieved 82 cantones from database

📊 **Data Retrieved** (5 entities)

**Entity 1: Municipalidad de San José**
```json
{
  "id": "entity-mun-1a2b3c",
  "name": "Municipalidad de San José",
  "email": "info@msj.go.cr",
  "website": "https://www.munisanjose.go.cr",
  "location": { "city": "San José", "state": "San José", "country": "Costa Rica" },
  "typeData": {
    "governmentType": "city",
    "population": 288054,
    "province": "San José",
    "trAigaRelevant": true
  }
}
````

**Entity 2: Municipalidad de Alajuela**

```json
{
  "id": "entity-mun-4d5e6f",
  "name": "Municipalidad de Alajuela",
  "email": "info@muni.go.cr",
  "website": "https://www.munialajuela.go.cr",
  "location": {
    "city": "Alajuela",
    "state": "Alajuela",
    "country": "Costa Rica"
  },
  "typeData": {
    "governmentType": "city",
    "population": 254000,
    "province": "Alajuela",
    "trAigaRelevant": true
  }
}
```

_... and 3 more entities_

**Key Fields Populated:**

- ✅ Name, Email, Website
- ✅ Location data
- ✅ Government type, Population, Province
- ✅ Pain points, Key contacts

💾 **Database Simulation**

- **Notion**: Would create 5 pages, update 0
  - Database: Outreach Pipeline
  - Simulated file: `data/dry-run/notion-municipal-2026-03-27.json`
- **Supabase**: Would insert 5 rows
  - Tables: municipalities
  - Simulated file: `data/dry-run/supabase-municipal-2026-03-27.json`

✅ **Validation Results**
No email validation performed in discovery stage

🚀 **Next Steps**

- **In Production:**

  - 5 municipalities would be discovered and stored in the database.

- **Recommendations:**
  - ✅ Data looks complete - proceed to validation

📝 **Action Items:**

- [ ] Run: --type=municipal --action=validate

📄 **Full Data:**

- State file: `$HOME/.openclaw/workspace/reports/alygn/muni-discover/alygn-municipal-discovered-2026-03-27.json`

````

---

## Municipal Validate

```markdown
🧪 **Pre-Production Dry-Run Report**
📅 2026-03-27 09:15:00 UTC
🎯 Municipal Validate (5 entities)

📡 **API Calls**
- ✅ **Regex-MX Validator**: success (0.5s)
  - Request: Validate 5 email addresses
  - Response: 4 valid, 1 invalid

📊 **Data Retrieved** (5 entities)

**Entity 1: Municipalidad de San José**
```json
{
  "id": "entity-mun-1a2b3c",
  "name": "Municipalidad de San José",
  "email": "info@msj.go.cr",
  "emailValidation": {
    "result": "valid",
    "confidence": 85,
    "validator": "regex-mx"
  }
}
````

**Entity 2: Municipalidad de Alajuela**

```json
{
  "id": "entity-mun-4d5e6f",
  "name": "Municipalidad de Alajuela",
  "email": "info@muni.go.cr",
  "emailValidation": {
    "result": "valid",
    "confidence": 85,
    "validator": "regex-mx"
  }
}
```

_... and 3 more entities_

**Key Fields Populated:**

- ✅ Name, Email, Website
- ✅ Location data
- ✅ Government type, Population, Province
- ✅ Pain points, Key contacts

💾 **Database Simulation**

- **Notion**: Would create 0 pages, update 5
  - Database: Outreach Pipeline
  - Simulated file: `data/dry-run/notion-municipal-2026-03-27.json`
- **Supabase**: Would insert 0 rows
  - Tables: municipalities
  - Simulated file: `data/dry-run/supabase-municipal-2026-03-27.json`

✅ **Validation Results**

| Email                    | Status     | Confidence | Validator |
| ------------------------ | ---------- | ---------- | --------- |
| <info@msj.go.cr>         | ✅ valid   | 85%        | regex-mx  |
| <info@muni.go.cr>        | ✅ valid   | 85%        | regex-mx  |
| <contacto@heredia.go.cr> | ✅ valid   | 85%        | regex-mx  |
| <alcaldia@cartago.go.cr> | ✅ valid   | 85%        | regex-mx  |
| <info@puntarenas.com>    | ❌ invalid | 0%         | regex-mx  |

**Issues Found:**

- ❌ <info@puntarenas.com>: Domain has no MX records

🚀 **Next Steps**

- **In Production:**

  - 5 email addresses would be validated using configured validator.

- **Recommendations:**
  - ❌ 1 invalid emails found - review before proceeding

📝 **Action Items:**

- [ ] Review invalid email <info@puntarenas.com>
- [ ] Run: --type=municipal --action=research

📄 **Full Data:**

- State file: `$HOME/.openclaw/workspace/reports/alygn/muni-validate/alygn-municipal-validated-2026-03-27.json`

````

---

## Municipal Research

```markdown
🧪 **Pre-Production Dry-Run Report**
📅 2026-03-27 09:30:00 UTC
🎯 Municipal Research (4 entities)

📡 **API Calls**
- ✅ **Perplexity API**: success (1.8s)
  - Request: Research: Municipio de San José initiatives
- ✅ **Perplexity API**: success (1.5s)
  - Request: Research: Municipio de Alajuela
- ✅ **Perplexity API**: success (1.4s)
  - Request: Research: Municipio de Heredia
- ✅ **Perplexity API**: success (1.6s)
  - Request: Research: Municipio de Cartago

📊 **Data Retrieved** (4 entities)

**Entity 1: Municipalidad de San José**
```json
{
  "id": "entity-mun-1a2b3c",
  "name": "Municipalidad de San José",
  "email": "info@msj.go.cr",
  "typeData": {
    "governmentType": "city",
    "population": 288054,
    "province": "San José",
    "trAigaRelevant": true,
    "painPoints": ["gobernanza de IA", "transformación digital"],
    "keyContacts": [
      { "name": "Diego Miranda", "title": "Alcalde", "isDecisionMaker": true }
    ],
    "initiatives": [
      { "name": "San José Inteligente", "description": "Smart city project", "status": "active" }
    ]
  }
}
````

**Entity 2: Municipalidad de Alajuela**

```json
{
  "id": "entity-mun-4d5e6f",
  "name": "Municipalidad de Alajuela",
  "email": "info@muni.go.cr",
  "typeData": {
    "governmentType": "city",
    "population": 254000,
    "province": "Alajuela",
    "trAigaRelevant": true,
    "painPoints": ["modernización", "transparencia"],
    "keyContacts": [
      {
        "name": "Fernando Ramírez",
        "title": "Alcalde",
        "isDecisionMaker": true
      }
    ]
  }
}
```

_... and 2 more entities_

**Key Fields Populated:**

- ✅ Name, Email, Website
- ✅ Location data
- ✅ Government type, Population, Province
- ✅ Pain points, Key contacts

💾 **Database Simulation**

- **Notion**: Would create 0 pages, update 4
  - Database: Outreach Pipeline
  - Simulated file: `data/dry-run/notion-municipal-2026-03-27.json`
- **Supabase**: Would insert 0 rows
  - Tables: municipalities
  - Simulated file: `data/dry-run/supabase-municipal-2026-03-27.json`

✅ **Validation Results**
Emails validated in previous stage
No new validation in research stage

🚀 **Next Steps**

- **In Production:**

  - 4 municipalities would be enriched with research data.

- **Recommendations:**
  - ✅ Research complete - proceed to personalization

📝 **Action Items:**

- [ ] Run: --type=municipal --action=personalize

📄 **Full Data:**

- State file: `$HOME/.openclaw/workspace/reports/alygn/muni-research/alygn-municipal-researched-2026-03-27.json`

````

---

## Municipal Personalize

```markdown
🧪 **Pre-Production Dry-Run Report**
📅 2026-03-27 09:45:00 UTC
🎯 Municipal Personalize (4 entities)

📡 **API Calls**
- ✅ **Perplexity API**: success (1.2s)
  - Request: Generate Spanish personalization for San José
- ✅ **Notion API**: skipped (dry-run)
  - Would create 4 pages

📊 **Data Retrieved** (4 entities)

**Entity 1: Municipalidad de San José**
```json
{
  "id": "entity-mun-1a2b3c",
  "name": "Municipalidad de San José",
  "email": "info@msj.go.cr",
  "draftStatus": "Drafted",
  "typeData": {
    "painPoints": ["gobernanza de IA", "transformación digital"],
    "keyContacts": [{ "name": "Diego Miranda", "title": "Alcalde", "isDecisionMaker": true }]
  },
  "personalizationContext": {
    "subject": "Apoyando la transformación digital de San José",
    "variant": "traiga",
    "language": "es",
    "customHook": "Su iniciativa San José Inteligente muestra liderazgo..."
  }
}
````

**Entity 2: Municipalidad de Alajuela**

```json
{
  "id": "entity-mun-4d5e6f",
  "name": "Municipalidad de Alajuela",
  "email": "info@muni.go.cr",
  "draftStatus": "Drafted",
  "typeData": {
    "painPoints": ["modernización", "transparencia"],
    "keyContacts": [
      {
        "name": "Fernando Ramírez",
        "title": "Alcalde",
        "isDecisionMaker": true
      }
    ]
  },
  "personalizationContext": {
    "subject": "Modernización digital para Alajuela",
    "variant": "traiga",
    "language": "es",
    "customHook": "Como líder en modernización municipal..."
  }
}
```

_... and 2 more entities_

**Key Fields Populated:**

- ✅ Name, Email, Website
- ✅ Location data
- ✅ Government type, Population, Province
- ✅ Pain points, Key contacts

💾 **Database Simulation**

- **Notion**: Would create 4 pages, update 0
  - Database: Outreach Pipeline
  - Simulated file: `data/dry-run/notion-municipal-2026-03-27.json`
- **Supabase**: Would insert 4 rows
  - Tables: outreach_emails
  - Simulated file: `data/dry-run/supabase-municipal-2026-03-27.json`

✅ **Validation Results**
Emails validated in previous stage
No new validation in personalize stage

🚀 **Next Steps**

- **In Production:**

  - 4 personalized emails (Spanish) would be generated and saved as drafts.

- **Recommendations:**
  - ✅ Personalization complete - awaiting approval
  - ✅ Spanish language templates applied correctly

📝 **Action Items:**

- [ ] Review drafts in Notion
- [ ] Approve/reject each draft
- [ ] Run send action with approved IDs

📄 **Full Data:**

- State file: `$HOME/.openclaw/workspace/reports/alygn/muni-personalize/alygn-municipal-personalized-2026-03-27.json`

````

---

## Municipal Send

```markdown
🧪 **Pre-Production Dry-Run Report**
📅 2026-03-27 10:00:00 UTC
🎯 Municipal Send (3 entities)

📡 **API Calls**
- ⏸️ **Smartlead API**: skipped (dry-run)
  - Would send 3 emails
- ⏸️ **Notion API**: skipped (dry-run)
  - Would update 3 pages

📊 **Data Retrieved** (3 entities)

**Entity 1: Municipalidad de San José**
```json
{
  "id": "entity-mun-1a2b3c",
  "name": "Municipalidad de San José",
  "email": "info@msj.go.cr",
  "draftStatus": "Approved",
  "personalizationContext": {
    "subject": "Apoyando la transformación digital de San José",
    "variant": "traiga",
    "language": "es"
  }
}
````

**Entity 2: Municipalidad de Alajuela**

```json
{
  "id": "entity-mun-4d5e6f",
  "name": "Municipalidad de Alajuela",
  "email": "info@muni.go.cr",
  "draftStatus": "Approved",
  "personalizationContext": {
    "subject": "Modernización digital para Alajuela",
    "variant": "traiga",
    "language": "es"
  }
}
```

_... and 1 more entity_

**Send Filter Applied:**

- Draft Status: `Approved`
- Send List: `entity-mun-1a2b3c, entity-mun-4d5e6f, entity-mun-7g8h9i`
- Match: 3/4 entities passed filters
- Filtered out: 1 entity (Draft Status: Drafted)

**Key Fields Populated:**

- ✅ Name, Email, Website
- ✅ Location data
- ✅ Government type, Population, Province
- ✅ Pain points, Key contacts

💾 **Database Simulation**

- **Notion**: Would create 0 pages, update 3
  - Database: Outreach Pipeline
  - Simulated file: `data/dry-run/notion-municipal-2026-03-27.json`
- **Supabase**: Would insert 3 rows
  - Tables: outreach_emails, municipalities
  - Simulated file: `data/dry-run/supabase-municipal-2026-03-27.json`

✅ **Validation Results**

| Email                    | Status   | Last Sent |
| ------------------------ | -------- | --------- |
| <info@msj.go.cr>         | ✅ Ready | Never     |
| <info@muni.go.cr>        | ✅ Ready | Never     |
| <contacto@heredia.go.cr> | ✅ Ready | Never     |

🚀 **Next Steps**

- **In Production:**

  - 3 emails would be sent via Smartlead/SMTP.

- **Recommendations:**
  - ✅ All filters passed - ready to send
  - ✅ Drafts approved by human review
  - ℹ️ 1 entity skipped (not approved)

📝 **Action Items:**

- [ ] Final review: Check subject lines
- [ ] Run: --action=send --dry-run=false

📄 **Full Data:**

- State file: `$HOME/.openclaw/workspace/reports/alygn/muni-sent/alygn-municipal-sent-2026-03-27.json`

---

## Emoji Quick Reference

| Emoji | Meaning        | Usage                      |
| ----- | -------------- | -------------------------- |
| 🧪    | Dry-Run        | Report header              |
| 📅    | Timestamp      | Report timestamp           |
| 🎯    | Target         | Entity count               |
| 📡    | API Calls      | External API calls section |
| 📊    | Data           | Entities data section      |
| 💾    | Database       | Simulated writes           |
| ✅    | Success/Valid  | Positive status            |
| ⚠️    | Warning/Risky  | Caution status             |
| ❌    | Failed/Invalid | Negative status            |
| ⏸️    | Skipped        | Dry-run skip               |
| 🚀    | Next Steps     | Production summary         |
| 📝    | Action Items   | Checklist                  |
| 📄    | Full Data      | File references            |

---
