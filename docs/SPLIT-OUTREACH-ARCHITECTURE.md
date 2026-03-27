# Split Outreach Architecture

## Context: Why Split?

Current monolithic approach (`alygn-muni-outreach.lobster`) suffers from:


1. **Context overflow** — 500+ line workflows exceed token limits
2. **Process violations** — Steps execute out of order or get skipped
3. **Failure propagation** — One failure cascades; no recovery mechanism
4. **Debugging difficulty** — No granular visibility into which step failed

## Core Principle: COMPLETE SEPARATION


**VC and Municipal outreach are 100% separate.**

- 6 independent cronjobs
- Different databases (Notion vs Supabase)
- Different templates (English/governance vs Spanish/traiga)
- Different Discord channels for notifications
- **NEVER mix VC and Municipal in the same lobster**

---

# VC OUTREACH PIPELINE

## Architecture Diagram (VC Only)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      VC DAILY OUTREACH CYCLE                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────┐  6:00 PM                                         │
│  │  VC EVENING RESEARCH │                                                 │
│  │  (Day N)            │  • Query Notion for VCs needing research          │
│  │                     │  • Research partner emails, pain points           │
│  │                     │  • Output: Draft JSON with waveDate=Tomorrow       │
│  │                     │  • Status: "researched"                            │
│  └─────────┬───────────┘                                                    │
│            │                                                                 │
│            ▼                                                                 │
│  ┌─────────────────────┐  9:00 AM (Day N+1)                               │
│  │  VC MORNING DRAFTS  │                                                   │
│  │  (Wave Date = Today)│  • Query: waveDate = today AND status = researched│
│  │                     │  • Generate personalized English email drafts      │
│  │                     │  • Post to VC Discord channel for approval        │
│  │                     │  • Status: "drafted"                              │
│  └─────────┬───────────┘                                                    │
│            │                                                                 │
│            ▼                                                                 │
│  ┌─────────────────────┐  2:00 PM                                         │
│  │  VC AFTERNOON        │                                                   │
│  │  RECOVERY            │  • Query: status = "failed" AND waveDate = today │
│  │  (Handle Failures)   │  • Research alternative partner emails             │
│  │                     │  • Retry send with new email                       │
│  │                     │  • Mark "invalid" if no alternatives               │
│  └─────────────────────┘                                                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Cronjob Schedule (VC)

| Cronjob              | Schedule       | Time    | Purpose                  |
| -------------------- | -------------- | ------- | ------------------------ |
| `alygn-vc-evening`   | `0 18 * * 1-5` | 6:00 PM | Research next VC batch   |
| `alygn-vc-morning`   | `0 9 * * 1-5`  | 9:00 AM | Generate VC email drafts |
| `alygn-vc-afternoon` | `0 14 * * 1-5` | 2:00 PM | Handle VC failures       |

---

# MUNICIPAL OUTREACH PIPELINE

## Architecture Diagram (Municipal Only)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   MUNICIPAL DAILY OUTREACH CYCLE                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────┐  7:00 PM                                         │
│  │  MUNI EVENING        │                                                   │
│  │  RESEARCH (Day N)   │  • Query Supabase for municipalities needing      │
│  │                     │    research                                        │
│  │                     │  • Research mayor emails, pain points             │
│  │                     │  • Output: Draft JSON with waveDate=Tomorrow       │
│  │                     │  • Status: "researched"                           │
│  └─────────┬───────────┘                                                    │
│            │                                                                 │
│            ▼                                                                 │
│  ┌─────────────────────┐  10:00 AM (Day N+1)                              │
│  │  MUNI MORNING       │                                                   │
│  │  DRAFTS             │  • Query: waveDate = today AND status = researched│
│  │  (Wave Date = Today)│  • Generate personalized Spanish email drafts     │
│  │                     │  • Post to Municipal Discord channel for approval  │
│  │                     │  • Status: "drafted"                              │
│  └─────────┬───────────┘                                                    │
│            │                                                                 │
│            ▼                                                                 │
│  ┌─────────────────────┐  3:00 PM                                         │
│  │  MUNI AFTERNOON      │                                                   │
│  │  RECOVERY            │  • Query: status = "failed" AND waveDate = today │
│  │  (Handle Failures)   │  • Research alternative mayor emails              │
│  │                     │  • Retry send with new email                      │
│  │                     │  • Mark "invalid" if no alternatives              │
│  └─────────────────────┘                                                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Cronjob Schedule (Municipal)

| Cronjob                | Schedule       | Time     | Purpose                       |
| ---------------------- | -------------- | -------- | ----------------------------- |
| `alygn-muni-evening`   | `0 19 * * 1-5` | 7:00 PM  | Research next municipal batch |
| `alygn-muni-morning`   | `0 10 * * 1-5` | 10:00 AM | Generate municipal drafts     |
| `alygn-muni-afternoon` | `0 15 * * 1-5` | 3:00 PM  | Handle municipal failures     |

---

# STAGGERED TIMING (Avoid Conflicts)

```
TIME    VC PIPELINE              MUNICIPAL PIPELINE
────    ───────────              ──────────────────
6:00 PM   VC Evening Research ─────────────────────────
7:00 PM ─────────────────── Municipal Evening Research

9:00 AM   VC Morning Drafts ─────────────────────────
10:00 AM─────────────────── Municipal Morning Drafts

2:00 PM   VC Afternoon Recovery
3:00 PM ─────────────────── Municipal Afternoon Recovery
```


**Key separation:**

- VC runs at :00 (9:00, 14:00, 18:00)
- Municipal runs at :00 but different hours (10:00, 15:00, 19:00)
- No overlap in execution windows
- Easy to identify which system has an issue based on execution time

---

# UNIFIED DATA FLOW DIAGRAM

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         COMPLETE SYSTEM OVERVIEW                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ══════════════════════════   VC TRACK   ══════════════════════════       │
│                                                                              │
│   ┌──────────────┐     ┌──────────────┐     ┌──────────────┐              │
│   │   NOTION     │────▶│  VC EVENING  │────▶│   outreach_  │              │
│   │  (VC DB)     │     │  RESEARCH    │     │   drafts/     │              │
│   └──────────────┘     └──────────────┘     │   research/   │              │
│                                              │   vc_*.json   │              │
│                                              └──────┬───────┘              │
│                                                     │                      │
│                                                     ▼                      │
│                                              ┌──────────────┐              │
│                                              │  VC MORNING  │              │
│                                              │  DRAFTS      │              │
│                                              └──────┬───────┘              │
│                                                     │                      │
│                                                     ▼                      │
│                                              ┌──────────────┐              │
│                                              │   DISCORD    │              │
│                                              │ (VC Channel) │              │
│                                              └──────┬───────┘              │
│                                                     │                      │
│                                                     ▼                      │
│                                              ┌──────────────┐              │
│                                              │  VC AFTER-   │              │
│                                              │  NOON RECOV. │              │
│                                              └──────────────┘              │
│                                                                              │
│   ══════════════════════════  MUNI TRACK  ══════════════════════════       │
│                                                                              │
│   ┌──────────────┐     ┌──────────────┐     ┌──────────────┐              │
│   │  SUPABASE    │────▶│  MUNI EVENING│────▶│   outreach_  │              │
│   │ (Muni DB)    │     │  RESEARCH    │     │   drafts/     │              │
│   └──────────────┘     └──────────────┘     │   research/   │              │
│                                              │   muni_*.json│              │
│                                              └──────┬───────┘              │
│                                                     │                      │
│                                                     ▼                      │
│                                              ┌──────────────┐              │
│                                              │  MUNI        │              │
│                                              │  MORNING     │              │
│                                              │  DRAFTS      │              │
│                                              └──────┬───────┘              │
│                                                     │                      │
│                                                     ▼                      │
│                                              ┌──────────────┐              │
│                                              │   DISCORD    │              │
│                                              │ (Muni Channel│              │
│                                              └──────┬───────┘              │
│                                                     │                      │
│                                                     ▼                      │
│                                              ┌──────────────┐              │
│                                              │  MUNI AFTER- │              │
│                                              │  NOON RECOV. │              │
│                                              └──────────────┘              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

# DATABASE SCHEMA UPDATES

## Draft Tracking JSON Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "draftId": {
      "type": "string",
      "description": "Unique draft identifier"
    },
    "entityType": {
      "enum": ["vc", "municipal"],
      "description": "Type of outreach target"
    },
    "entityId": {
      "type": "string",
      "description": "Source database ID (Notion page ID or Supabase row ID)"
    },
    "entityName": {
      "type": "string",
      "description": "Human-readable name"
    },
    "contactEmail": {
      "type": "string",
      "format": "email"
    },
    "contactName": {
      "type": "string",
      "description": "Partner/Mayor name for personalization"
    },
    "waveDate": {
      "type": "string",
      "format": "date",
      "description": "Target send date (YYYY-MM-DD)"
    },
    "status": {
      "enum": [
        "researched",
        "drafted",
        "approved",
        "sent",
        "failed",
        "invalid"
      ],
      "description": "Current workflow status"
    },
    "researchData": {
      "type": "object",
      "properties": {
        "painPoints": {
          "type": "array",
          "items": { "type": "string" }
        },
        "personalizationHooks": {
          "type": "array",
          "items": { "type": "string" }
        },
        "emailPatterns": {
          "type": "array",
          "items": { "type": "string" }
        },
        "researchedAt": {
          "type": "string",
          "format": "date-time"
        }
      }
    },
    "draftData": {
      "type": "object",
      "properties": {
        "subject": { "type": "string" },
        "body": { "type": "string" },
        "variant": { "enum": ["governance", "institutional", "traiga"] }
      }
    },
    "failureInfo": {
      "type": "object",
      "properties": {
        "reason": { "type": "string" },
        "failedAt": { "type": "string", "format": "date-time" },
        "retryCount": { "type": "integer" },
        "alternativeEmails": {
          "type": "array",
          "items": { "type": "string" }
        }
      }
    },
    "metadata": {
      "type": "object",
      "properties": {
        "createdAt": { "type": "string", "format": "date-time" },
        "updatedAt": { "type": "string", "format": "date-time" },
        "sourceLobster": { "type": "string" },
        "notes": { "type": "string" }
      }
    }
  },
  "required": [
    "draftId",
    "entityType",
    "entityId",
    "waveDate",
    "status",
    "metadata"
  ]
}
```

## Draft Files Storage

```
$HOME/.openclaw/workspace/outreach_drafts/
├── research/
│   ├── vc_2026-03-27.json      # VC evening research output
│   └── muni_2026-03-27.json    # Municipal evening research output
├── drafts/
│   ├── vc_2026-03-27.json      # VC morning drafts output
│   └── muni_2026-03-27.json    # Municipal morning drafts output
├── approved/
│   ├── vc_2026-03-27.json      # Post-Discord approval
│   └── muni_2026-03-27.json
└── sent/
    ├── vc_2026-03-27.json      # Post-send confirmation
    └── muni_2026-03-27.json
```

**CRITICAL**: Separate directories by type, NOT by phase. Files named `{vc|muni}_{waveDate}.json`

---

# STATE MANAGEMENT

## Wave-Based State Machine

```
                    ┌─────────────┐
                    │  RESEARCHED │ (post-evening-research)
                    └──────┬──────┘
                           │
                           ▼
                    ┌─────────────┐
          ┌────────▶│   DRAFTED   │ (post-morning-drafts)
          │         └──────┬──────┘
          │                │
          │         ┌──────┴──────┐
          │         │             │
          │         ▼             ▼
          │  ┌──────────┐  ┌──────────┐
          │  │ APPROVED │  │ REJECTED │
          │  └────┬─────┘  └──────────┘
          │       │
          │       ▼
          │  ┌──────────┐
          │  │   SENT   │
          │  └────┬─────┘
          │       │
          │       ▼
          │  ┌──────────┐
          └──│  FAILED  │──────┐
             └──────────┘      │
                    ▲          │ (afternoon-recovery)
                    │          │
                    └──────────┘
                          │
                          ▼

                    ┌──────────┐
                    │  INVALID │
                    └──────────┘
```

## Persistence Points

| Phase              | Persisted Data                           | Storage Location              |
| ------------------ | ---------------------------------------- | ----------------------------- | ----------------------- |
| Evening Research   | `researchData`, status=`researched`      | `outreach_drafts/research/{vc | muni}\_{waveDate}.json` |
| Morning Drafts     | `draftData`, status=`drafted`            | `outreach_drafts/drafts/{vc   | muni}\_{waveDate}.json` |
| Discord Approval   | status=`approved`                        | `outreach_drafts/approved/{vc | muni}\_{waveDate}.json` |
| Afternoon Recovery | `failureInfo`, status=`failed`/`invalid` | `outreach_drafts/sent/{vc     | muni}\_{waveDate}.json` |

## Idempotency Keys

Each lobster run checks:

1. Does `outreach_drafts/research/{type}_{waveDate}.json` exist?
2. Are all entries already status=`researched`?
3. If yes → skip research, continue to drafts

---

# LOBSTER DEFINITIONS

## 1. VC Evening Research

**File:** `.lobster/alygn-vc-evening.lobster`

```yaml
name: alygn-vc-evening
description: Research next day's VC batch
schedule: "0 18 * * 1-5" # 6 PM weekdays
timezone: America/Costa_Rica

metadata:
  type: vc
  phase: research
  wave_date: computed_tomorrow
  output_dir: outreach_drafts/research

steps:
  - id: research-vc-batch
    command: |
      node $HOME/.agents/skills/alygn-outreach/bin/alygn-outreach \
        --type=vc \
        --action=research \
        --limit=10
    description: "Research VCs needing email discovery"
    output:
      file: /tmp/vc-research-temp.json

  - id: compile-vc-drafts
    command: |
      node -e "
        const fs = require('fs');
        const data = JSON.parse(fs.readFileSync('/tmp/vc-research-temp.json', 'utf8'));
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const waveDate = tomorrow.toISOString().split('T')[0];
        
        const drafts = data.entities.map(e => ({
          draftId: 'vc-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
          entityType: 'vc',
          entityId: e.id,
          entityName: e.name,
          contactEmail: e.email,
          contactName: e.typeData?.partners?.[0]?.name || '',
          waveDate,
          status: 'researched',
          researchData: {
            painPoints: e.typeData?.painPoints || [],
            personalizationHooks: e.typeData?.personalizationHooks || [],
            emailPatterns: e.typeData?.emailPatterns || [],
            researchedAt: new Date().toISOString()
          },
          metadata: {
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            sourceLobster: 'alygn-vc-evening'
          }
        }));
        
        fs.writeFileSync(
          'outreach_drafts/research/vc_' + waveDate + '.json',
          JSON.stringify({ waveDate, count: drafts.length, entities: drafts }, null, 2)
        );
        console.log('Created ' + drafts.length + ' VC research drafts for ' + waveDate);
      "
    description: "Compile VC research into draft JSONs"

notifications:
  on_complete:
    channel: discord
    target: "<VC-DISCORD-CHANNEL-ID>"
    message: "✅ VC Evening Research complete. {{count}} VCs ready for tomorrow's drafts."
```

## 2. VC Morning Drafts

**File:** `.lobster/alygn-vc-morning.lobster`

```yaml
name: alygn-vc-morning
description: Generate VC email drafts for today's wave
schedule: "0 9 * * 1-5" # 9 AM weekdays
timezone: America/Costa_Rica

metadata:
  type: vc
  phase: drafts
  wave_date: today

steps:
  - id: load-research-files
    command: |
      TODAY=$(date +%Y-%m-%d)
      RESEARCH_FILE="outreach_drafts/research/vc_$TODAY.json"

      if [ ! -f "$RESEARCH_FILE" ]; then
        echo "No VC research file for today"
        exit 0
      fi
    description: "Check for VC research files from evening"

  - id: generate-vc-drafts
    command: |
      TODAY=$(date +%Y-%m-%d)
      RESEARCH_FILE="outreach_drafts/research/vc_$TODAY.json"

      node -e "
        const fs = require('fs');
        const research = JSON.parse(fs.readFileSync(process.env.RESEARCH_FILE, 'utf8'));
        const { Pipeline } = require('$HOME/.agents/skills/alygn-outreach/src/core/Pipeline.js');
        
        const drafted = [];
        
        for (const entity of research.entities.filter(e => e.status === 'researched')) {
          const pipeline = new Pipeline('vc', {
            personalization: { variant: 'governance' }
          });
          
          const personalized = await pipeline.run('personalize', {
            entity,
            researchData: entity.researchData
          });
          
          entity.status = 'drafted';
          entity.draftData = {
            subject: personalized.subject,
            body: personalized.body,
            variant: 'governance'
          };
          entity.metadata.updatedAt = new Date().toISOString();
          entity.metadata.sourceLobster = 'alygn-vc-morning';
          
          drafted.push(entity);
        }
        
        fs.writeFileSync(
          'outreach_drafts/drafts/vc_' + process.env.TODAY + '.json',
          JSON.stringify({ waveDate: process.env.TODAY, count: drafted.length, entities: drafted }, null, 2)
        );
        
        console.log('Drafted ' + drafted.length + ' VC emails');
      "
    env:
      TODAY: computed_today
      RESEARCH_FILE: computed_path
    description: "Generate VC email drafts from research"

  - id: post-to-discord
    command: |
      TODAY=$(date +%Y-%m-%d)
      DRAFT_FILE="outreach_drafts/drafts/vc_$TODAY.json"

      if [ ! -f "$DRAFT_FILE" ]; then
        echo "No VC drafts to post"
        exit 0
      fi

      echo "=== VC DRAFT REVIEW ===" > /tmp/vc-discord-review.md
      echo "" >> /tmp/vc-discord-review.md
      echo "**Date:** $TODAY" >> /tmp/vc-discord-review.md
      echo "" >> /tmp/vc-discord-review.md
      echo "## VC Drafts ($(cat $DRAFT_FILE | jq '.count'))" >> /tmp/vc-discord-review.md
      echo "" >> /tmp/vc-discord-review.md

      cat $DRAFT_FILE | jq -r '.entities[] | "- **" + .entityName + "** (" + .contactEmail + ")\n  Subject: " + .draftData.subject' >> /tmp/vc-discord-review.md
      echo "" >> /tmp/vc-discord-review.md
      echo "React ✅ to approve all, ❌ to reject." >> /tmp/vc-discord-review.md

      cat /tmp/vc-discord-review.md | message --action=send --channel=discord --target="<VC-DISCORD-CHANNEL-ID>"

notifications:
  on_complete:
    channel: discord
    target: "<VC-DISCORD-CHANNEL-ID>"
    message: "📋 VC Morning Drafts ready. {{count}} drafts waiting approval."
```

## 3. VC Afternoon Recovery

**File:** `.lobster/alygn-vc-afternoon.lobster`

```yaml
name: alygn-vc-afternoon
description: Handle failed VC sends from today's wave
schedule: "0 14 * * 1-5" # 2 PM weekdays
timezone: America/Costa_Rica

metadata:
  type: vc
  phase: recovery
  wave_date: today

steps:
  - id: find-failed-sends
    command: |
      TODAY=$(date +%Y-%m-%d)
      SENT_FILE="outreach_drafts/sent/vc_$TODAY.json"

      if [ ! -f "$SENT_FILE" ]; then
        echo "No VC sent file for today"
        exit 0
      fi

      echo "Found failed VC entries:"
      cat $SENT_FILE | jq '.entities[] | select(.status == "failed")'
    description: "Find all failed VC sends from today"

  - id: research-alternatives
    command: |
      TODAY=$(date +%Y-%m-%d)
      SENT_FILE="outreach_drafts/sent/vc_$TODAY.json"

      if [ ! -f "$SENT_FILE" ]; then exit 0; fi

      FAILED=$(cat $SENT_FILE | jq -r '.entities[] | select(.status == "failed") | .entityId')

      for entityId in $FAILED; do
        echo "Researching alternatives for $entityId..."
        
        node $HOME/.agents/skills/alygn-outreach/bin/alygn-outreach \
          --type=vc \
          --action=research \
          --entity-id=$entityId \
          --output=/tmp/vc-recovery-$entityId.json
        
        ALTERNATIVES=$(cat /tmp/vc-recovery-$entityId.json | jq -r '.emails // [] | join(",")')
        
        node -e "
          const fs = require('fs');
          const data = JSON.parse(fs.readFileSync('$SENT_FILE', 'utf8'));
          const entity = data.entities.find(e => e.entityId === '$entityId');
          if (entity) {
            entity.failureInfo.alternativeEmails = '$ALTERNATIVES'.split(',').filter(Boolean);
            entity.failureInfo.retryCount = (entity.failureInfo.retryCount || 0) + 1;
            fs.writeFileSync('$SENT_FILE', JSON.stringify(data, null, 2));
          }
        "
      done
    description: "Research alternative emails for failed VC sends"
    after: find-failed-sends

  - id: attempt-retry
    command: |
      TODAY=$(date +%Y-%m-%d)
      SENT_FILE="outreach_drafts/sent/vc_$TODAY.json"

      if [ ! -f "$SENT_FILE" ]; then exit 0; fi

      ENTITIES=$(cat $SENT_FILE | jq -r '.entities[] | select(.status == "failed" and .failureInfo.alternativeEmails != null and (.failureInfo.alternativeEmails | length) > 0) | .entityId')

      for entityId in $ENTITIES; do
        ALTERNATIVE=$(cat $SENT_FILE | jq -r ".entities[] | select(.entityId == \"$entityId\") | .failureInfo.alternativeEmails[0]")
        
        if [ -n "$ALTERNATIVE" ]; then
          echo "Retrying $entityId with $ALTERNATIVE..."
          
          node $HOME/.agents/skills/alygn-outreach/bin/alygn-outreach \
            --type=vc \
            --action=send \
            --entity-id=$entityId \
            --test-email=$ALTERNATIVE
        fi
      done
    description: "Attempt send with alternative VC emails"
    after: research-alternatives

  - id: mark-permanently-failed
    command: |
      TODAY=$(date +%Y-%m-%d)
      SENT_FILE="outreach_drafts/sent/vc_$TODAY.json"

      if [ ! -f "$SENT_FILE" ]; then exit 0; fi

      node -e "
        const fs = require('fs');
        const data = JSON.parse(fs.readFileSync('$SENT_FILE', 'utf8'));
        
        let permanentlyFailed = 0;
        
        for (const entity of data.entities) {
          if (entity.status === 'failed') {
            const hasAlternatives = entity.failureInfo?.alternativeEmails?.length > 0;
            const maxRetries = 2;
            
            if (!hasAlternatives || entity.failureInfo.retryCount >= maxRetries) {
              entity.status = 'invalid';
              entity.failureInfo.markedInvalidAt = new Date().toISOString();
              entity.metadata.updatedAt = new Date().toISOString();
              permanentlyFailed++;
            }
          }
        }
        
        fs.writeFileSync('$SENT_FILE', JSON.stringify(data, null, 2));
        console.log('Marked ' + permanentlyFailed + ' VC entries as invalid');
      "

notifications:
  on_complete:
    channel: discord
    target: "<VC-DISCORD-CHANNEL-ID>"
    message: "🔧 VC Afternoon Recovery complete. Check report for results."
```

---

## 4. Municipal Evening Research

**File:** `.lobster/alygn-muni-evening.lobster`

```yaml
name: alygn-muni-evening
description: Research next day's municipal batch
schedule: "0 19 * * 1-5" # 7 PM weekdays
timezone: America/Costa_Rica

metadata:
  type: municipal
  phase: research
  wave_date: computed_tomorrow
  output_dir: outreach_drafts/research

steps:
  - id: research-muni-batch
    command: |
      node $HOME/.agents/skills/alygn-outreach/bin/alygn-outreach \
        --type=municipal \
        --action=research \
        --region=costa-rica \
        --limit=10
    description: "Research municipalities needing email discovery"
    output:
      file: /tmp/muni-research-temp.json

  - id: compile-muni-drafts
    command: |
      node -e "
        const fs = require('fs');
        const data = JSON.parse(fs.readFileSync('/tmp/muni-research-temp.json', 'utf8'));
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const waveDate = tomorrow.toISOString().split('T')[0];
        
        const drafts = data.entities.map(e => ({
          draftId: 'muni-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
          entityType: 'municipal',
          entityId: e.id,
          entityName: e.name,
          contactEmail: e.email,
          contactName: e.mayor_name || e.typeData?.contactName || '',
          waveDate,
          status: 'researched',
          researchData: {
            painPoints: e.typeData?.painPoints || e.pain_points || [],
            personalizationHooks: e.typeData?.personalizationHooks || [],
            emailPatterns: e.typeData?.emailPatterns || [],
            researchedAt: new Date().toISOString()
          },
          metadata: {
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            sourceLobster: 'alygn-muni-evening'
          }
        }));
        
        fs.writeFileSync(
          'outreach_drafts/research/muni_' + waveDate + '.json',
          JSON.stringify({ waveDate, count: drafts.length, entities: drafts }, null, 2)
        );
        console.log('Created ' + drafts.length + ' Municipal research drafts for ' + waveDate);
      "
    description: "Compile municipal research into draft JSONs"

notifications:
  on_complete:
    channel: discord
    target: "<MUNI-DISCORD-CHANNEL-ID>"
    message: "✅ Municipal Evening Research complete. {{count}} municipalities ready for tomorrow's drafts."
```

## 5. Municipal Morning Drafts

**File:** `.lobster/alygn-muni-morning.lobster`

```yaml
name: alygn-muni-morning
description: Generate municipal email drafts for today's wave
schedule: "0 10 * * 1-5" # 10 AM weekdays
timezone: America/Costa_Rica

metadata:
  type: municipal
  phase: drafts
  wave_date: today

steps:
  - id: load-research-files
    command: |
      TODAY=$(date +%Y-%m-%d)
      RESEARCH_FILE="outreach_drafts/research/muni_$TODAY.json"

      if [ ! -f "$RESEARCH_FILE" ]; then
        echo "No municipal research file for today"
        exit 0
      fi
    description: "Check for municipal research files from evening"

  - id: generate-muni-drafts
    command: |
      TODAY=$(date +%Y-%m-%d)
      RESEARCH_FILE="outreach_drafts/research/muni_$TODAY.json"

      node -e "
        const fs = require('fs');
        const research = JSON.parse(fs.readFileSync(process.env.RESEARCH_FILE, 'utf8'));
        const { Pipeline } = require('$HOME/.agents/skills/alygn-outreach/src/core/Pipeline.js');
        
        const drafted = [];
        
        for (const entity of research.entities.filter(e => e.status === 'researched')) {
          const pipeline = new Pipeline('municipal', {
            personalization: { variant: 'traiga', language: 'es' }
          });
          
          const personalized = await pipeline.run('personalize', {
            entity,
            researchData: entity.researchData
          });
          
          entity.status = 'drafted';
          entity.draftData = {
            subject: personalized.subject,
            body: personalized.body,
            variant: 'traiga'
          };
          entity.metadata.updatedAt = new Date().toISOString();
          entity.metadata.sourceLobster = 'alygn-muni-morning';
          
          drafted.push(entity);
        }
        
        fs.writeFileSync(
          'outreach_drafts/drafts/muni_' + process.env.TODAY + '.json',
          JSON.stringify({ waveDate: process.env.TODAY, count: drafted.length, entities: drafted }, null, 2)
        );
        
        console.log('Drafted ' + drafted.length + ' Municipal emails');
      "
    env:
      TODAY: computed_today
      RESEARCH_FILE: computed_path
    description: "Generate municipal email drafts from research"

  - id: post-to-discord
    command: |
      TODAY=$(date +%Y-%m-%d)
      DRAFT_FILE="outreach_drafts/drafts/muni_$TODAY.json"

      if [ ! -f "$DRAFT_FILE" ]; then
        echo "No municipal drafts to post"
        exit 0
      fi

      echo "=== MUNICIPAL DRAFT REVIEW ===" > /tmp/muni-discord-review.md
      echo "" >> /tmp/muni-discord-review.md
      echo "**Date:** $TODAY" >> /tmp/muni-discord-review.md
      echo "" >> /tmp/muni-discord-review.md
      echo "## Municipal Drafts ($(cat $DRAFT_FILE | jq '.count'))" >> /tmp/muni-discord-review.md
      echo "" >> /tmp/muni-discord-review.md

      cat $DRAFT_FILE | jq -r '.entities[] | "- **" + .entityName + "** (" + .contactEmail + ")\n  Subject: " + .draftData.subject' >> /tmp/muni-discord-review.md
      echo "" >> /tmp/muni-discord-review.md
      echo "React ✅ to approve all, ❌ to reject." >> /tmp/muni-discord-review.md

      cat /tmp/muni-discord-review.md | message --action=send --channel=discord --target="<MUNI-DISCORD-CHANNEL-ID>"

notifications:
  on_complete:
    channel: discord
    target: "<MUNI-DISCORD-CHANNEL-ID>"
    message: "📋 Municipal Morning Drafts ready. {{count}} drafts waiting approval."
```

## 6. Municipal Afternoon Recovery

**File:** `.lobster/alygn-muni-afternoon.lobster`

```yaml
name: alygn-muni-afternoon
description: Handle failed municipal sends from today's wave
schedule: "0 15 * * 1-5" # 3 PM weekdays
timezone: America/Costa_Rica

metadata:
  type: municipal
  phase: recovery
  wave_date: today

steps:
  - id: find-failed-sends
    command: |
      TODAY=$(date +%Y-%m-%d)
      SENT_FILE="outreach_drafts/sent/muni_$TODAY.json"

      if [ ! -f "$SENT_FILE" ]; then
        echo "No municipal sent file for today"
        exit 0
      fi

      echo "Found failed municipal entries:"
      cat $SENT_FILE | jq '.entities[] | select(.status == "failed")'
    description: "Find all failed municipal sends from today"

  - id: research-alternatives
    command: |
      TODAY=$(date +%Y-%m-%d)
      SENT_FILE="outreach_drafts/sent/muni_$TODAY.json"

      if [ ! -f "$SENT_FILE" ]; then exit 0; fi

      FAILED=$(cat $SENT_FILE | jq -r '.entities[] | select(.status == "failed") | .entityId')

      for entityId in $FAILED; do
        echo "Researching alternatives for $entityId..."
        
        node $HOME/.agents/skills/alygn-outreach/bin/alygn-outreach \
          --type=municipal \
          --action=research \
          --entity-id=$entityId \
          --output=/tmp/muni-recovery-$entityId.json
        
        ALTERNATIVES=$(cat /tmp/muni-recovery-$entityId.json | jq -r '.emails // [] | join(",")')
        
        node -e "
          const fs = require('fs');
          const data = JSON.parse(fs.readFileSync('$SENT_FILE', 'utf8'));
          const entity = data.entities.find(e => e.entityId === '$entityId');
          if (entity) {
            entity.failureInfo.alternativeEmails = '$ALTERNATIVES'.split(',').filter(Boolean);
            entity.failureInfo.retryCount = (entity.failureInfo.retryCount || 0) + 1;
            fs.writeFileSync('$SENT_FILE', JSON.stringify(data, null, 2));
          }
        "
      done
    description: "Research alternative emails for failed municipal sends"
    after: find-failed-sends

  - id: attempt-retry
    command: |
      TODAY=$(date +%Y-%m-%d)
      SENT_FILE="outreach_drafts/sent/muni_$TODAY.json"

      if [ ! -f "$SENT_FILE" ]; then exit 0; fi

      ENTITIES=$(cat $SENT_FILE | jq -r '.entities[] | select(.status == "failed" and .failureInfo.alternativeEmails != null and (.failureInfo.alternativeEmails | length) > 0) | .entityId')

      for entityId in $ENTITIES; do
        ALTERNATIVE=$(cat $SENT_FILE | jq -r ".entities[] | select(.entityId == \"$entityId\") | .failureInfo.alternativeEmails[0]")
        
        if [ -n "$ALTERNATIVE" ]; then
          echo "Retrying $entityId with $ALTERNATIVE..."
          
          node $HOME/.agents/skills/alygn-outreach/bin/alygn-outreach \
            --type=municipal \
            --action=send \
            --entity-id=$entityId \
            --test-email=$ALTERNATIVE
        fi
      done
    description: "Attempt send with alternative municipal emails"
    after: research-alternatives

  - id: mark-permanently-failed
    command: |
      TODAY=$(date +%Y-%m-%d)
      SENT_FILE="outreach_drafts/sent/muni_$TODAY.json"

      if [ ! -f "$SENT_FILE" ]; then exit 0; fi

      node -e "
        const fs = require('fs');
        const data = JSON.parse(fs.readFileSync('$SENT_FILE', 'utf8'));
        
        let permanentlyFailed = 0;
        
        for (const entity of data.entities) {
          if (entity.status === 'failed') {
            const hasAlternatives = entity.failureInfo?.alternativeEmails?.length > 0;
            const maxRetries = 2;
            
            if (!hasAlternatives || entity.failureInfo.retryCount >= maxRetries) {
              entity.status = 'invalid';
              entity.failureInfo.markedInvalidAt = new Date().toISOString();
              entity.metadata.updatedAt = new Date().toISOString();
              permanentlyFailed++;
            }
          }

        }
        
        fs.writeFileSync('$SENT_FILE', JSON.stringify(data, null, 2));
        console.log('Marked ' + permanentlyFailed + ' Municipal entries as invalid');
      "


notifications:
  on_complete:
    channel: discord
    target: "<MUNI-DISCORD-CHANNEL-ID>"
    message: "🔧 Municipal Afternoon Recovery complete. Check report for results."
```

---


# IMPLEMENTATION CHECKLIST

## Phase 1: Storage Setup


- [ ] Create `outreach_drafts/research/` directory
- [ ] Create `outreach_drafts/drafts/` directory
- [ ] Create `outreach_drafts/approved/` directory
- [ ] Create `outreach_drafts/sent/` directory

## Phase 2: Lobster Creation

- [ ] Create `alygn-vc-evening.lobster`
- [ ] Create `alygn-vc-morning.lobster`
- [ ] Create `alygn-vc-afternoon.lobster`
- [ ] Create `alygn-muni-evening.lobster`
- [ ] Create `alygn-muni-morning.lobster`
- [ ] Create `alygn-muni-afternoon.lobster`

## Phase 3: Database Updates

- [ ] Add `waveDate` property to Notion VC database
- [ ] Add `waveDate` column to Supabase municipalities table
- [ ] Configure separate Discord channels for VC and Municipal

## Phase 4: Testing

- [ ] Test VC evening research idempotency
- [ ] Test VC morning drafts generation
- [ ] Test VC afternoon recovery flow
- [ ] Test Municipal evening research idempotency
- [ ] Test Municipal morning drafts generation
- [ ] Test Municipal afternoon recovery flow
- [ ] Verify no cross-contamination between VC and Municipal

---

# KEY BENEFITS

1. **Isolation**: Each lobster handles ONE type (VC OR municipal) → smaller context, faster runs
2. **Resumability**: State persisted to files → restart-safe
3. **Observability**: Clear status at each phase → know exactly where failures occur
4. **Human-in-loop**: Discord approval step preserved → quality control
5. **Recovery**: Afternoon lobster handles failures → no lost leads
6. **No Conflicts**: Staggered timing → no resource contention
7. **Debugging**: 6 smaller lobsters vs 2 large ones → easier to trace issues
