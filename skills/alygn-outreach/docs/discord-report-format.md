# Discord Dry-Run Report Format

## Overview

When `--dry-run` + `USE_DIRECT_API=true` is used, a detailed report is sent to Discord for visibility and verification before production execution.

## Report Structure

### 1. Header Section

```markdown
🧪 **Pre-Production Dry-Run Report**
📅 {timestamp}
🎯 {Entity Type} {Action} ({count} entities)
```

**Fields:**

- `timestamp`: ISO 8601 format with timezone (e.g., `2026-03-27 10:00 UTC`)
- `Entity Type`: `VC` or `Municipal`
- `Action`: `Discover`, `Validate`, `Research`, `Personalize`, or `Send`
- `count`: Number of entities processed

### 2. API Calls Section

Documents all external API calls made during the dry-run.

```markdown
📡 **API Calls**
| API | Status | Duration | Details |
|-----|--------|----------|---------|
| Perplexity API | ✅ Success | 1.2s | Query: "AI safety venture capital" |
| ZeroBounce API | ✅ Success | 0.8s | 5 emails validated |
```

**For each API call:**

- API name
- Status (✅ Success / ⚠️ Partial / ❌ Failed)
- Duration in seconds
- Sanitized request details (no API keys, credentials, or PII)
- Response summary (truncated if large)

### 3. Data Retrieved Section

Shows sample data for the first 2-3 entities.

````markdown
📊 **Data Retrieved** (2 entities)

**Entity 1: {name}**

```json
{
  "id": "entity-xxx",
  "name": "AI Safety Ventures",
  "email": "contact@aisafetyvc.com",
  "website": "https://aisafetyvc.com",
  "location": {
    "city": "San Francisco",
    "state": "CA",
    "country": "US"
  }
}
```
````

**Key Fields Populated:**

- ✅ Name, Email, Website
- ✅ Location data
- ✅ {type-specific fields}

````

**Key fields by entity type:**

**VC:**
- Firm type
- Stage focus
- Sector focus
- Relevance score

**Municipal:**
- Government type
- Population
- Province
- Pain points

### 4. Database Simulation Section

Shows simulated writes when in dry-run mode.

```markdown
💾 **Database Simulation**
- **Notion**: `data/dry-run/notion-vc-2026-03-27.json`
  - Would create: 2 pages
  - Database: Outreach Pipeline
- **Supabase**: `data/dry-run/supabase-vc-2026-03-27.json`
  - Would insert: 2 rows into `municipalities`
  - Would insert: 2 rows into `outreach_emails`
````

### 5. Validation Section

Email validation results (when applicable).

```markdown
✅ **Validation Results**
| Email | Status | Confidence | Validator |
|-------|--------|------------|-----------|
| contact@aisafetyvc.com | ✅ Valid | 95% | zerobounce |
| info@example.com | ⚠️ Risky | 60% | regex-mx |
| bad@invalid.xyz | ❌ Invalid | 0% | zerobounce |

**Issues Found:**

- 1 email marked as risky (low confidence)
```

### 6. Next Steps Section

Clear guidance on what would happen in production.

```markdown
🚀 **Next Steps**

- **In Production:**

  - 2 emails would be sent via Smartlead
  - 2 Notion pages would be updated with "Sent" status
  - 2 Supabase records would be created

- **Recommendations:**

  - ✅ Validation passed - ready to proceed
  - ⚠️ Review risky email before sending

- **Action Items:**
  - [ ] Approve draft in Notion
  - [ ] Run: `--action=send --dry-run=false`
```

## Full Example: VC Discovery

````markdown
🧪 **Pre-Production Dry-Run Report**
📅 2026-03-27 10:00 UTC
🎯 VC Discover (2 entities)

📡 **API Calls**
| API | Status | Duration | Details |
|-----|--------|----------|---------|
| Perplexity API | ✅ Success | 1.2s | Query: "AI safety venture capital" |

📊 **Data Retrieved**

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

**Key Fields Populated:**

- ✅ Name, Email, Website
- ✅ Location data
- ✅ Firm type, Stage focus, Sector focus
- ✅ Relevance score

💾 **Database Simulation**

- **Notion**: Would create 2 pages in "Outreach Pipeline" database
- **Supabase**: Would insert 2 rows into `vcs` table
- **State file**: `$HOME/.openclaw/workspace/reports/alygn/vc-discover/alygn-vc-discovered-2026-03-27.json`

✅ **Validation Results**

- No email validation performed in discovery stage

🚀 **Next Steps**

- **In Production:**

  - 2 VC firms would be discovered and stored
  - 2 Notion pages would be created with "discovered" status
  - Proceed to validation stage

- **Recommendations:**

  - ✅ Data looks complete - proceed to validation

- **Action Items:**
  - [ ] Run: `--action=validate --input=$HOME/.openclaw/workspace/reports/alygn/vc-discover/alygn-vc-discovered-2026-03-27.json`

````

## Full Example: VC Send

```markdown
🧪 **Pre-Production Dry-Run Report**
📅 2026-03-27 14:30 UTC
🎯 VC Send (2 entities)

📡 **API Calls**
| API | Status | Duration | Details |
|-----|--------|----------|---------|
| Smartlead API | ⏸️ Skipped (dry-run) | - | Would send 2 emails |
| Notion API | ⏸️ Skipped (dry-run) | - | Would update 2 pages |

📊 **Data Retrieved**

**Entity 1: AI Safety Ventures**
```json
{
  "id": "entity-mmxx7okp-1jojna",
  "name": "AI Safety Ventures",
  "email": "contact@aisafetyvc.com",
  "draftStatus": "Approved",
  "personalizationContext": {
    "subject": "AI Safety Ventures: Governance Solutions",
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
    "subject": "Frontier Capital: AI Governance",
    "variant": "governance"
  }
}
```

**Send Filter Applied:**

- Draft Status: `Approved`
- Send List: `entity-mmxx7okp-1jojna, entity-mmxx7okp-92p5q9`
- Match: 2/2 entities passed filters

💾 **Database Simulation**

- **Notion**: Would update 2 pages with `Draft Status` = "Sent"
- **Supabase**: Would insert 2 rows into `outreach_emails`
- **Smartlead**: Would create campaign with 2 recipients

✅ **Validation Results**

| Email                       | Status   | Last Sent |
| --------------------------- | -------- | --------- |
| <contact@aisafetyvc.com>    | ✅ Ready | Never     |
| <investors@frontiercap.com> | ✅ Ready | Never     |

🚀 **Next Steps**

- **In Production:**

  - 2 emails would be sent via Smartlead
  - 2 Notion pages would be updated with "Sent" status
  - 2 Supabase records would track the outreach

- **Recommendations:**

  - ✅ All filters passed - ready to send
  - ✅ Drafts approved by human review

- **Action Items:**
  - [ ] Final review: Check subject lines
  - [ ] Run: `--action=send --dry-run=false --draft-status=Approved --email-send-to=entity-mmxx7okp-1jojna,entity-mmxx7okp-92p5q9`

````

## Full Example: Municipal Personalize

```markdown
🧪 **Pre-Production Dry-Run Report**
📅 2026-03-27 11:15 UTC
🎯 Municipal Personalize (2 entities)

📡 **API Calls**
| API | Status | Duration | Details |
|-----|--------|----------|---------|
| Perplexity API | ✅ Success | 1.5s | Research: Municipio de San José |
| Notion API | ⏸️ Skipped (dry-run) | - | Would create 2 pages |

📊 **Data Retrieved**

**Entity 1: Municipalidad de San José**
```json
{
  "id": "entity-mun-1a2b3c",
  "name": "Municipalidad de San José",
  "email": "info@msj.go.cr",
  "location": { "city": "San José", "state": "San José", "country": "Costa Rica" },
  "typeData": {
    "governmentType": "city",
    "population": 288054,
    "province": "San José",
    "trAigaRelevant": true,
    "painPoints": ["gobernanza de IA", "transformación digital"],
    "keyContacts": [{ "name": "Diego Miranda", "title": "Alcalde", "isDecisionMaker": true }]
  },
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
  "location": {
    "city": "Alajuela",
    "state": "Alajuela",
    "country": "Costa Rica"
  },
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
  },
  "personalizationContext": {
    "subject": "Modernización digital para Alajuela",
    "variant": "traiga",
    "language": "es"
  }
}
```

**Key Fields Populated:**

- ✅ Municipality name, Email, Website
- ✅ Province, Population
- ✅ Pain points identified
- ✅ Key contacts with decision maker flag
- ✅ Personalized subject lines generated

💾 **Database Simulation**

- **Notion**: Would create 2 pages with:
  - `Status` = "personalized"
  - `Draft Status` = "Drafted"
  - Personalized email content
- **Supabase**: Would insert 2 rows into `outreach_emails` with draft content

✅ **Validation Results**

- Emails validated in previous stage
- No new validation in personalize stage

🚀 **Next Steps**

- **In Production:**

  - 2 personalized emails would be generated
  - 2 Notion pages would be created with draft status
  - Human review and approval required before send

- **Recommendations:**

  - ✅ Personalization complete - awaiting approval
  - ✅ Spanish language templates applied correctly

- **Action Items:**
  - [ ] Review drafts in Notion
  - [ ] Approve/reject each draft
  - [ ] Run send action with approved IDs

````

## Emoji Reference

| Emoji | Meaning |
|-------|---------|
| 🧪 | Pre-Production Dry-Run |
| 📅 | Timestamp |
| 🎯 | Target/Action |
| 📡 | API Calls |
| 📊 | Data/Results |
| 💾 | Database Operations |
| ✅ | Success/Valid |
| ⚠️ | Warning/Risky |
| ❌ | Failed/Invalid |
| ⏸️ | Skipped |
| 🚀 | Next Steps |
| 📝 | Action Items |
| ⏱️ | Duration |
| 📧 | Email |
| 🏛️ | Municipal |
| 💼 | VC |

## Character Limits

Discord messages have a 2000 character limit. The `DiscordReporter` class should:

1. **Split long reports** into multiple messages if needed
2. **Truncate JSON samples** to show only essential fields
3. **Use tables** for structured data (compact)
4. **Link to full data** via state file paths instead of embedding

**Truncation strategy:**
- Header: Always included
- API Calls: Truncate response details at 200 chars
- Data Samples: Show 2 entities max, limit JSON to 15 lines
- Validation: Show all results (usually small)
- Next Steps: Always included

## Message Splitting

If a report exceeds 2000 characters, split intelligently:

```typescript
// Message 1: Header + API Calls
// Message 2: Data Retrieved (Entity 1)
// Message 3: Data Retrieved (Entity 2) + Database Simulation
// Message 4: Validation + Next Steps
````

## State File References

Always include the state file path so users can inspect full data:

```markdown
📄 **Full Data Available:**

- State file: `$HOME/.openclaw/workspace/reports/alygn/vc-personalized/alygn-vc-personalized-2026-03-27.json`
- Notion simulation: `data/dry-run/notion-vc-2026-03-27.json`
- Supabase simulation: `data/dry-run/supabase-vc-2026-03-27.json`
```
