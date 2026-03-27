# Wave Date Tracking System Specification

**Version:** 1.0  
**Date:** 2026-03-26  
**Status:** Draft  
**Owner:** Alygn VC & Municipal Outreach System

---

## Overview

The Wave Date Tracking System provides batch-level tracking for outreach campaigns, enabling precise scheduling, state management, and recovery workflows for both Venture Capital (VC) and Municipal outreach operations.

**⚠️ CRITICAL:** VC and Municipal workflows are **completely isolated**. Each type has:
- Separate cronjob schedules (no overlap)
- Separate wave files in dedicated directories (`/tmp/waves/vc/` vs `/tmp/waves/municipal/`)
- Separate databases (Notion for VC, Supabase for Municipal)
- Separate job functions (vcSendJob vs municipalSendJob)

**No mixing between types.** A VC cronjob will never touch a Municipal wave file, and vice versa.

---

## 1. JSON Schema Definitions

### 1.1 Wave File Schema

**File Locations:**
- VC waves: `/tmp/waves/vc/wave-{date}-vc.json`
- Municipal waves: `/tmp/waves/municipal/wave-{date}-municipal.json`

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Alygn Outreach Wave",
  "description": "Batch tracking file for VC and Municipal outreach campaigns",
  "type": "object",
  "required": ["waveId", "waveDate", "createdAt", "type", "status", "batch"],
  "properties": {
    "waveId": {
      "type": "string",
      "description": "Unique wave identifier",
      "pattern": "^wave-[0-9]{4}-[0-9]{2}-[0-9]{2}-(vc|municipal)$",
      "example": "wave-2026-03-27-vc"
    },
    "waveDate": {
      "type": "string",
      "description": "Scheduled send date for this wave",
      "format": "date",
      "example": "2026-03-27"
    },
    "createdAt": {
      "type": "string",
      "description": "ISO 8601 timestamp when wave was created",
      "format": "date-time",
      "example": "2026-03-26T22:00:00Z"
    },
    "type": {
      "type": "string",
      "enum": ["vc", "municipal"],
      "description": "Outreach campaign type"
    },
    "status": {
      "type": "string",
      "enum": ["researched", "drafted", "approved", "sent", "failed", "partial"],
      "description": "Current state of the wave"
    },
    "sentAt": {
      "type": ["string", "null"],
      "description": "ISO 8601 timestamp when wave was sent",
      "format": "date-time",
      "example": "2026-03-27T14:00:00Z"
    },
    "batch": {
      "type": "array",
      "description": "List of outreach targets in this wave",
      "items": {
        "$ref": "#/definitions/BatchEntry"
      }
    },
    "metadata": {
      "type": "object",
      "description": "Additional wave metadata",
      "properties": {
        "createdBy": {
          "type": "string",
          "description": "Agent or user who created the wave"
        },
        "totalTargets": {
          "type": "integer",
          "description": "Total number of targets in wave"
        },
        "successCount": {
          "type": "integer",
          "description": "Number of successfully sent emails"
        },
        "failCount": {
          "type": "integer",
          "description": "Number of failed sends"
        },
        "emailVariant": {
          "type": "string",
          "enum": ["governance", "technical"],
          "description": "Email template variant used"
        },
        "notes": {
          "type": "string",
          "description": "Human-readable notes about this wave"
        }
      }
    }
  },
  "definitions": {
    "BatchEntry": {
      "type": "object",
      "required": ["entityId", "name", "email", "status"],
      "properties": {
        "entityId": {
          "type": "string",
          "description": "Reference to entity in database",
          "pattern": "^(vc-[a-z0-9-]+|muni-[a-z0-9-]+)$"
        },
        "name": {
          "type": "string",
          "description": "Display name of the target"
        },
        "email": {
          "type": "string",
          "description": "Primary contact email",
          "format": "email"
        },
        "painPoints": {
          "type": "array",
          "description": "Identified pain points for personalization",
          "items": {
            "type": "object",
            "properties": {
              "problem": {
                "type": "string",
                "description": "Problem statement"
              },
              "relevance": {
                "type": "string",
                "description": "Why this matters to the target"
              },
              "solution": {
                "type": "string",
                "description": "How Alygn addresses this"
              }
            }
          }
        },
        "personalization": {
          "type": "object",
          "description": "Dynamic personalization data",
          "properties": {
            "subjectLine": {
              "type": "string",
              "description": "Generated subject line"
            },
            "openingHook": {
              "type": "string",
              "description": "Personalized opening paragraph"
            },
            "portfolioReference": {
              "type": "string",
              "description": "Relevant portfolio company mention"
            },
            "investmentThesisQuote": {
              "type": "string",
              "description": "Quote from VC's stated thesis"
            }
          }
        },
        "status": {
          "type": "string",
          "enum": ["pending", "drafted", "queued", "sent", "delivered", "failed", "bounced", "replied"],
          "description": "Individual entry status"
        },
        "sentAt": {
          "type": ["string", "null"],
          "format": "date-time",
          "description": "When this specific email was sent"
        },
        "error": {
          "type": ["object", "null"],
          "description": "Error details if failed",
          "properties": {
            "code": {
              "type": "string",
              "description": "Error code"
            },
            "message": {
              "type": "string",
              "description": "Error message"
            },
            "timestamp": {
              "type": "string",
              "format": "date-time",
              "description": "When error occurred"
            }
          }
        }
      }
    }
  }
}
```

### 1.2 Example Wave File

```json
{
  "waveId": "wave-2026-03-27-vc",
  "waveDate": "2026-03-27",
  "createdAt": "2026-03-26T22:00:00Z",
  "type": "vc",
  "status": "drafted",
  "sentAt": null,
  "batch": [
    {
      "entityId": "vc-ai-safety-fund",
      "name": "Dr. Sarah Chen",
      "email": "sarah@aisafetyfund.vc",
      "painPoints": [
        {
          "problem": "AI labs lack neutral coordination infrastructure",
          "relevance": "Portfolio company Anthropic recently faced coordination challenges",
          "solution": "ALYGN provides pre-built governance architecture for cross-lab coordination"
        }
      ],
      "personalization": {
        "subjectLine": "Governance infrastructure for AGI coordination",
        "openingHook": "Given your investment in AI safety infrastructure...",
        "portfolioReference": "Anthropic",
        "investmentThesisQuote": "Building the foundations for safe AGI"
      },
      "status": "drafted",
      "sentAt": null,
      "error": null
    }
  ],
  "metadata": {
    "createdBy": "vc-discovery-agent",
    "totalTargets": 12,
    "successCount": 0,
    "failCount": 0,
    "emailVariant": "governance",
    "notes": "High-priority batch targeting AI safety focused VCs"
  }
}
```

---

## 2. State Machine Documentation

### 2.1 Wave State Transitions

```
                    ┌─────────────────┐
                    │    researched   │ ←── EOD Research creates wave
                    │   (wave file)   │
                    └────────┬────────┘
                             │ Morning Draft
                             ▼
                    ┌─────────────────┐
              ┌────→│    drafted      │ ←── Email HTML generated
              │     │ (personalized)  │
              │     └────────┬────────┘
              │              │ Review/Approval
              │              ▼
              │     ┌─────────────────┐
              │     │    approved     │ ←── Ready to send
              │     │  (final review)   │
              │     └────────┬────────┘
              │              │ Send Campaign
              │              ▼
              │     ┌─────────────────┐
              └─────│      sent       │ ←── Emails dispatched
                    │  (completion)   │
                    └────────┬────────┘
                             │
           ┌─────────────────┼─────────────────┐
           │                 │                 │
           ▼                 ▼                 ▼
    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
    │   partial   │    │   failed    │    │  (end)      │
    │ (recovery)  │    │ (manual fix)│    │             │
    └──────┬──────┘    └──────┬──────┘    └─────────────┘
           │                  │
           │                  │ Afternoon Recovery
           │                  ▼
           │         ┌─────────────────┐
           │         │    recovered    │
           │         │ (reprocessed)   │
           │         └────────┬────────┘
           │                  │
           └──────────────────┘
```

### 2.2 State Definitions

| State | Description | Entry Trigger | Exit Actions |
|-------|-------------|---------------|--------------|
| **researched** | Initial state after discovery | EOD Research job creates wave file with targets | Batch created, ready for drafting |
| **drafted** | Emails personalized and generated | Morning Draft job processes wave | HTML emails written to disk |
| **approved** | Final review complete | Manual approval or auto-approve after validation | Queue for sending |
| **sent** | All emails dispatched successfully | Hourly send job completes batch | Update Notion/Supabase records |
| **partial** | Some emails sent, some failed | Send job encounters soft failures | Queue for recovery |
| **failed** | Critical error, no emails sent | Send job encounters hard failure | Manual intervention required |
| **recovered** | Failed entries reprocessed | Afternoon Recovery job | Retry failed sends |

### 2.3 Entry State Transitions

Each batch entry has its own state machine:

```
pending → drafted → queued → sent → delivered
   │         │        │       │        │
   │         │        │       │        └── Email confirmed delivered
   │         │        │       └── SMTP accepted
   │         │        └── In send queue
   │         └── HTML generated, personalized
   └── Initial state in researched wave

Any state can transition to:
   failed (on error) → recovered (on retry)
   bounced (delivery failure)
   replied (reply received)
```

---

## 3. File Naming Conventions

### 3.1 Wave File Naming

**Pattern:** `wave-{date}-{type}.json`

| Component | Format | Example |
|-----------|--------|---------|
| Prefix | `wave-` | Fixed |
| Date | `YYYY-MM-DD` | `2026-03-27` |
| Type | `vc` or `municipal` | Campaign type |
| Extension | `.json` | JSON format |

**Examples:**
- `wave-2026-03-27-vc.json` — VC outreach for March 27, 2026
- `wave-2026-03-28-municipal.json` — Municipal outreach for March 28, 2026

### 3.2 Directory Structure

**CRITICAL:** Wave files are completely isolated by type. Each type has its own subdirectory.

```
/tmp/waves/
├── vc/
│   ├── wave-2026-03-27-vc.json          # Active VC wave
│   ├── emails/                           # Generated VC emails
│   │   └── sarah@aisafetyfund.vc.html
│   └── queue/                            # Pending send queue
├── municipal/
│   ├── wave-2026-03-28-municipal.json    # Active Municipal wave
│   ├── emails/                           # Generated Municipal emails
│   └── queue/
├── archive/
│   ├── vc/
│   │   ├── wave-2026-03-25-vc.json
│   │   └── wave-2026-03-26-vc.json
│   └── municipal/
│       ├── wave-2026-03-25-municipal.json
│       └── wave-2026-03-26-municipal.json
└── failed/
    ├── vc/
    │   └── wave-2026-03-20-vc.failed.json
    └── municipal/
        └── wave-2026-03-20-municipal.failed.json
```

**⚠️ Isolation Rule:** VC cronjobs ONLY access `/tmp/waves/vc/`. Municipal cronjobs ONLY access `/tmp/waves/municipal/`. Never cross-reference.

### 3.3 Backup Naming

**Pattern:** `{filename}.{timestamp}.{action}.json`

- `wave-2026-03-27-vc.json.20260326T220000Z.backup`
- `wave-2026-03-27-vc.json.20260327T080000Z.pre-send`

---

## 4. Database Migration Requirements

### 4.1 Notion Database (VC Outreach)

**Database:** VC Outreach Tracker  
**ID:** `2fc33487-4af6-8182-9013-d127ce6778b6`

#### New Properties to Add

| Property | Type | Options/Format | Purpose |
|----------|------|----------------|---------|
| **Wave Date** | Date | ISO date | Scheduled send date |
| **Wave ID** | Text | `wave-YYYY-MM-DD-vc` | Reference to wave file |
| **Batch Status** | Select | `pending`, `queued`, `sent`, `replied`, `failed` | Individual entry status |
| **Wave Status** | Select | `researched`, `drafted`, `approved`, `sent`, `failed` | Aggregate wave status |

#### Migration Script

```javascript
// notion-wave-migration.js
const { Client } = require('@notionhq/client');

async function addWaveDateColumn() {
  const notion = new Client({ auth: process.env.NOTION_API_KEY });
  const databaseId = '2fc33487-4af6-8182-9013-d127ce6778b6';
  
  await notion.databases.update({
    database_id: databaseId,
    properties: {
      'Wave Date': {
        date: {}
      },
      'Wave ID': {
        rich_text: {}
      },
      'Batch Status': {
        select: {
          options: [
            { name: 'pending', color: 'gray' },
            { name: 'queued', color: 'yellow' },
            { name: 'sent', color: 'blue' },
            { name: 'replied', color: 'green' },
            { name: 'failed', color: 'red' }
          ]
        }
      },
      'Wave Status': {
        select: {
          options: [
            { name: 'researched', color: 'gray' },
            { name: 'drafted', color: 'yellow' },
            { name: 'approved', color: 'purple' },
            { name: 'sent', color: 'green' },
            { name: 'failed', color: 'red' }
          ]
        }
      }
    }
  });
}
```

### 4.2 Supabase Database (Municipal Outreach)

**Table:** `municipal_outreach`

#### Migration: Add Wave Tracking Fields

```sql
-- Migration: Add wave tracking to municipal outreach
-- Date: 2026-03-26

-- Add wave tracking columns
ALTER TABLE municipal_outreach
ADD COLUMN IF NOT EXISTS wave_date DATE,
ADD COLUMN IF NOT EXISTS wave_id VARCHAR(50),
ADD COLUMN IF NOT EXISTS batch_status VARCHAR(20) DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS wave_status VARCHAR(20) DEFAULT 'researched';

-- Add indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_wave_date ON municipal_outreach(wave_date);
CREATE INDEX IF NOT EXISTS idx_wave_id ON municipal_outreach(wave_id);
CREATE INDEX IF NOT EXISTS idx_batch_status ON municipal_outreach(batch_status);

-- Add constraint for valid batch statuses
ALTER TABLE municipal_outreach
ADD CONSTRAINT chk_batch_status 
CHECK (batch_status IN ('pending', 'queued', 'sent', 'replied', 'failed'));

-- Add constraint for valid wave statuses
ALTER TABLE municipal_outreach
ADD CONSTRAINT chk_wave_status 
CHECK (wave_status IN ('researched', 'drafted', 'approved', 'sent', 'failed'));

-- Add trigger to auto-populate wave_id from wave_date
CREATE OR REPLACE FUNCTION generate_wave_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.wave_date IS NOT NULL AND NEW.wave_id IS NULL THEN
    NEW.wave_id := 'wave-' || TO_CHAR(NEW.wave_date, 'YYYY-MM-DD') || '-municipal';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_generate_wave_id
BEFORE INSERT OR UPDATE ON municipal_outreach
FOR EACH ROW
EXECUTE FUNCTION generate_wave_id();
```

### 4.3 Migration Verification

```javascript
// verify-migrations.js
async function verifyMigrations() {
  // Check Notion
  const notionDb = await notion.databases.retrieve({ 
    database_id: '2fc33487-4af6-8182-9013-d127ce6778b6' 
  });
  
  const requiredProps = ['Wave Date', 'Wave ID', 'Batch Status', 'Wave Status'];
  const existingProps = Object.keys(notionDb.properties);
  
  const missingNotion = requiredProps.filter(p => !existingProps.includes(p));
  
  // Check Supabase
  const { data, error } = await supabase
    .from('municipal_outreach')
    .select('wave_date, wave_id, batch_status, wave_status')
    .limit(1);
    
  if (error) {
    console.error('Supabase columns missing:', error);
  }
  
  return {
    notion: missingNotion.length === 0 ? 'OK' : `Missing: ${missingNotion.join(', ')}`,
    supabase: error ? 'FAILED' : 'OK'
  };
}
```

---

## 5. Workflow Integration

**CRITICAL:** VC and Municipal workflows are completely isolated. Each type has its own cron schedule, wave files, and database queries. No mixing between types.

### 5.1 VC Campaign Workflow

#### VC 6:00 PM Research Job

**Schedule:** Daily 6:00 PM CST  
**Action:** Creates `wave-{tomorrow}-vc.json` with status "researched"  
**Database:** Notion VC Outreach Tracker

```javascript
// Creates: wave-{tomorrow}-vc.json with status "researched"
async function vcResearchJob() {
  const tomorrow = getNextBusinessDay();
  const waveId = `wave-${tomorrow}-vc`;
  const waveFile = `/tmp/waves/${waveId}.json`;
  
  // Query Notion for high-priority pending VCs
  const targets = await notion.databases.query({
    database_id: VC_DB_ID,  // 2fc33487-4af6-8182-9013-d127ce6778b6
    filter: {
      and: [
        { property: 'Status', select: { equals: 'Pending' } },
        { property: 'Priority', select: { equals: 'High' } }
      ]
    }
  });
  
  const wave = {
    waveId,
    waveDate: tomorrow,
    createdAt: new Date().toISOString(),
    type: 'vc',
    status: 'researched',
    batch: targets.results.map(vc => ({
      entityId: vc.id,
      name: vc.properties['Contact Person'].title[0].text.content,
      email: vc.properties['Contact Email'].email,
      status: 'pending'
    }))
  };
  
  await fs.writeFile(waveFile, JSON.stringify(wave, null, 2));
}
```

#### VC 9:00 AM Send Job

**Schedule:** Daily 9:00 AM CST  
**Action:** Generates and sends VC emails  
**Updates:** `wave-{today}-vc.json` status to "sent" or "partial"

```javascript
// Processes: wave-{today}-vc.json
async function vcSendJob() {
  const today = getToday();
  const waveFile = `/tmp/waves/wave-${today}-vc.json`;
  
  // Check if wave file exists (may not exist on weekends/holidays)
  if (!fs.existsSync(waveFile)) {
    console.log(`No VC wave for ${today}`);
    return;
  }
  
  const wave = JSON.parse(await fs.readFile(waveFile, 'utf8'));
  
  // Only process if in correct state
  if (wave.status !== 'researched' && wave.status !== 'drafted') {
    console.log(`VC wave already processed: ${wave.status}`);
    return;
  }
  
  for (const entry of wave.batch) {
    if (entry.status !== 'pending' && entry.status !== 'drafted') continue;
    
    try {
      // Generate personalization if not already done
      if (!entry.personalization) {
        entry.personalization = await generateVcPersonalization(entry.entityId);
      }
      
      // Send email
      await sendVcEmail(entry);
      entry.status = 'sent';
      entry.sentAt = new Date().toISOString();
      
    } catch (err) {
      entry.status = 'failed';
      entry.error = {
        code: err.code,
        message: err.message,
        timestamp: new Date().toISOString()
      };
    }
  }
  
  // Update aggregate status
  const failedCount = wave.batch.filter(e => e.status === 'failed').length;
  wave.status = failedCount === 0 ? 'sent' : 'partial';
  wave.metadata.successCount = wave.batch.filter(e => e.status === 'sent').length;
  wave.metadata.failCount = failedCount;
  
  await fs.writeFile(waveFile, JSON.stringify(wave, null, 2));
}
```

#### VC 2:00 PM Recovery Job

**Schedule:** Daily 2:00 PM CST  
**Action:** Retries failed VC sends  
**Updates:** Failed entries in `wave-{today}-vc.json`

```javascript
// Processes: wave-{today}-vc.json - VC only
async function vcRecoveryJob() {
  const today = getToday();
  const waveFile = `/tmp/waves/wave-${today}-vc.json`;
  
  if (!fs.existsSync(waveFile)) return;
  
  const wave = JSON.parse(await fs.readFile(waveFile, 'utf8'));
  
  if (wave.status !== 'partial') {
    console.log(`No VC recovery needed: ${wave.status}`);
    return;
  }
  
  const failedEntries = wave.batch.filter(e => e.status === 'failed');
  
  for (const entry of failedEntries) {
    try {
      await resendVcEmail(entry);
      entry.status = 'sent';
      entry.sentAt = new Date().toISOString();
      entry.error = null;
    } catch (err) {
      entry.error = {
        code: err.code,
        message: err.message,
        timestamp: new Date().toISOString()
      };
    }
  }
  
  // Update wave status
  const remainingFailed = wave.batch.filter(e => e.status === 'failed').length;
  wave.status = remainingFailed === 0 ? 'sent' : 'partial';
  wave.metadata.successCount = wave.batch.filter(e => e.status === 'sent').length;
  wave.metadata.failCount = remainingFailed;
  
  await fs.writeFile(waveFile, JSON.stringify(wave, null, 2));
}
```

---

### 5.2 Municipal Campaign Workflow

#### Municipal 7:00 PM Research Job

**Schedule:** Daily 7:00 PM CST  
**Action:** Creates `wave-{tomorrow}-municipal.json` with status "researched"  
**Database:** Supabase municipal_outreach table

```javascript
// Creates: wave-{tomorrow}-municipal.json with status "researched"
async function municipalResearchJob() {
  const tomorrow = getNextBusinessDay();
  const waveId = `wave-${tomorrow}-municipal`;
  const waveFile = `/tmp/waves/${waveId}.json`;
  
  // Query Supabase for pending municipal targets
  const { data: targets, error } = await supabase
    .from('municipal_outreach')
    .select('*')
    .eq('status', 'pending')
    .eq('priority', 'high')
    .limit(12);  // Max batch size
    
  if (error) throw error;
  
  const wave = {
    waveId,
    waveDate: tomorrow,
    createdAt: new Date().toISOString(),
    type: 'municipal',
    status: 'researched',
    batch: targets.map(muni => ({
      entityId: muni.id,
      name: muni.contact_name,
      email: muni.contact_email,
      status: 'pending'
    }))
  };
  
  await fs.writeFile(waveFile, JSON.stringify(wave, null, 2));
}
```

#### Municipal 10:00 AM Send Job

**Schedule:** Daily 10:00 AM CST  
**Action:** Generates and sends Municipal emails  
**Updates:** `wave-{today}-municipal.json` status to "sent" or "partial"

```javascript
// Processes: wave-{today}-municipal.json
async function municipalSendJob() {
  const today = getToday();
  const waveFile = `/tmp/waves/wave-${today}-municipal.json`;
  
  // Check if wave file exists
  if (!fs.existsSync(waveFile)) {
    console.log(`No municipal wave for ${today}`);
    return;
  }
  
  const wave = JSON.parse(await fs.readFile(waveFile, 'utf8'));
  
  if (wave.status !== 'researched' && wave.status !== 'drafted') {
    console.log(`Municipal wave already processed: ${wave.status}`);
    return;
  }
  
  for (const entry of wave.batch) {
    if (entry.status !== 'pending' && entry.status !== 'drafted') continue;
    
    try {
      // Generate personalization
      if (!entry.personalization) {
        entry.personalization = await generateMuniPersonalization(entry.entityId);
      }
      
      // Send email
      await sendMunicipalEmail(entry);
      entry.status = 'sent';
      entry.sentAt = new Date().toISOString();
      
    } catch (err) {
      entry.status = 'failed';
      entry.error = {
        code: err.code,
        message: err.message,
        timestamp: new Date().toISOString()
      };
    }
  }
  
  const failedCount = wave.batch.filter(e => e.status === 'failed').length;
  wave.status = failedCount === 0 ? 'sent' : 'partial';
  wave.metadata.successCount = wave.batch.filter(e => e.status === 'sent').length;
  wave.metadata.failCount = failedCount;
  
  await fs.writeFile(waveFile, JSON.stringify(wave, null, 2));
}
```

#### Municipal 3:00 PM Recovery Job

**Schedule:** Daily 3:00 PM CST  
**Action:** Retries failed Municipal sends  
**Updates:** Failed entries in `wave-{today}-municipal.json`

```javascript
// Processes: wave-{today}-municipal.json - Municipal only
async function municipalRecoveryJob() {
  const today = getToday();
  const waveFile = `/tmp/waves/wave-${today}-municipal.json`;
  
  if (!fs.existsSync(waveFile)) return;
  
  const wave = JSON.parse(await fs.readFile(waveFile, 'utf8'));
  
  if (wave.status !== 'partial') {
    console.log(`No municipal recovery needed: ${wave.status}`);
    return;
  }
  
  const failedEntries = wave.batch.filter(e => e.status === 'failed');
  
  for (const entry of failedEntries) {
    try {
      await resendMunicipalEmail(entry);
      entry.status = 'sent';
      entry.sentAt = new Date().toISOString();
      entry.error = null;
    } catch (err) {
      entry.error = {
        code: err.code,
        message: err.message,
        timestamp: new Date().toISOString()
      };
    }
  }
  
  const remainingFailed = wave.batch.filter(e => e.status === 'failed').length;
  wave.status = remainingFailed === 0 ? 'sent' : 'partial';
  wave.metadata.successCount = wave.batch.filter(e => e.status === 'sent').length;
  wave.metadata.failCount = remainingFailed;
  
  await fs.writeFile(waveFile, JSON.stringify(wave, null, 2));
}
```

---

## 6. API Endpoints (Future)

### 6.1 Wave Management

```
GET    /api/waves                    # List all waves
GET    /api/waves/{waveId}           # Get specific wave
POST   /api/waves                    # Create new wave
PATCH  /api/waves/{waveId}           # Update wave status
DELETE /api/waves/{waveId}           # Delete wave (archive)

GET    /api/waves/{waveId}/entries   # List batch entries
PATCH  /api/waves/{waveId}/entries/{entryId}  # Update entry status
```

### 6.2 Response Schema

```json
{
  "success": true,
  "data": {
    "waveId": "wave-2026-03-27-vc",
    "status": "sent",
    "stats": {
      "total": 12,
      "sent": 11,
      "failed": 1,
      "replied": 2
    }
  },
  "meta": {
    "timestamp": "2026-03-27T15:00:00Z",
    "version": "1.0"
  }
}
```

---

## 7. Monitoring & Alerts

### 7.1 Health Checks

| Check | Frequency | Action on Failure |
|-------|-----------|-------------------|
| Wave file exists | Hourly | Alert if missing for active date |
| Status consistency | Hourly | Alert if Notion/Supabase out of sync |
| Failed entry threshold | Real-time | Alert if >20% failure rate |

### 7.2 Alert Channels

- **Discord:** `#alygn-vc-outreach-plan` thread
- **WhatsApp:** Andler + Tania immediate alerts

---

## 8. Appendix

### 8.1 Cron Job Summary

**VC Campaign (isolated - Notion database):**

| Job | Schedule | File | Action | Status |
|-----|----------|------|--------|--------|
| VC Research | 6:00 PM CST | Creates `wave-{tomorrow}-vc.json` | Query Notion high-priority pending VCs | `researched` |
| VC Send | 9:00 AM CST | Processes `wave-{today}-vc.json` | Generate/send emails, personalization | `sent` / `partial` |
| VC Recovery | 2:00 PM CST | Updates `wave-{today}-vc.json` | Retry failed VC sends | `sent` / `partial` |

**Municipal Campaign (isolated - Supabase database):**

| Job | Schedule | File | Action | Status |
|-----|----------|------|--------|--------|
| Muni Research | 7:00 PM CST | Creates `wave-{tomorrow}-municipal.json` | Query Supabase high-priority pending | `researched` |
| Muni Send | 10:00 AM CST | Processes `wave-{today}-municipal.json` | Generate/send emails, personalization | `sent` / `partial` |
| Muni Recovery | 3:00 PM CST | Updates `wave-{today}-municipal.json` | Retry failed Municipal sends | `sent` / `partial` |

**⚠️ ISOLATION RULE:** VC and Municipal workflows are completely separate. Each job only touches its own wave file type. No cross-type queries or updates.

### 8.2 Environment Variables

```bash
# Required
WAVES_DIR=/tmp/waves
NOTION_VC_DB_ID=2fc33487-4af6-8182-9013-d127ce6778b6
SUPABASE_MUNI_TABLE=municipal_outreach

# Optional
WAVE_ARCHIVE_DAYS=30  # Auto-archive after N days
MAX_WAVE_SIZE=12       # Max entries per wave
```

---

**Document Version:** 1.0  
**Last Updated:** 2026-03-26  
**Next Review:** 2026-04-26