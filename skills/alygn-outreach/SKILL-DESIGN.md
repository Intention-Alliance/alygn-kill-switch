# SKILL-DESIGN.md: Unified Alygn Outreach Skill

## Executive Summary

This document specifies a unified skill architecture that consolidates VC and municipal outreach workflows into a single, reusable, extensible system. The design leverages dependency injection, strategy patterns, and entity abstraction to enable both outreach types while sharing core infrastructure.

---

## 1. Architecture Overview

### 1.1 Core Design Philosophy

The unified skill is built on **Composition over Inheritance** and **Strategy Pattern** principles:

- **Unified Pipeline**: Common action pipeline (`discover → validate → research → personalize → send`)
- **Type-Specific Strategies**: Discovery, research, and personalization vary by entity type
- **Shared Infrastructure**: Email sending, validation, and state management are common
- **Entity Abstraction**: Base entity interface with type-specific extensions

### 1.2 High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     CLI ENTRY POINT                             │
│              bin/alygn-outreach --type=vc|muni                  │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                   OutreachSkill (Orchestrator)                  │
│  ┌──────────────┐ ┌──────────────┐ ┌─────────────────────────┐  │
│  │ ConfigLoader │ │ EntityFactory│ │   Pipeline              │  │
│  │ (JSON files) │ │ (VC/Muni)    │ │   (Action Chain)        │  │
│  └──────────────┘ └──────────────┘ └─────────────────────────┘  │
└──────────────────────┬──────────────────────────────────────────┘
                       │
         ┌─────────────┼─────────────┐
         ▼             ▼             ▼
┌─────────────┐ ┌─────────────┐ ┌─────────────────────────────┐
│   ENTITIES  │ │  STRATEGIES │ │         STATE STORE           │
├─────────────┤ ├─────────────┤ ├─────────────────────────────┤
│             │ │             │ │                             │
│  Outreach   │ │  Discovery  │ │  /tmp/alygn-{type}-         │
│  Entity     │ │  Strategy   │ │  {phase}.json               │
│  (base)     │ │  (abstract) │ │                             │
│             │ │             │ │  - Pipeline state           │
│  ├─VCEntity │ │  ├─VCDisc   │ │  - Entity lists             │
│  │          │ │  │  overy    │ │  - Processing metadata      │
│  └─Municipal│ │  └─MuniDisc │ │                             │
│     Entity  │ │     overy   │ │                             │
│             │ │             │ │                             │
│             │ │  Validation │ │                             │
│             │ │  Strategy   │ │                             │
│             │ │  (shared)   │ │                             │
│             │ │             │ │                             │
│             │ │  Research   │ │                             │
│             │ │  Strategy   │ │                             │
│             │ │  (abstract) │ │                             │
│             │ │             │ │                             │
│             │ │  Personal-  │ │                             │
│             │ │  ization    │ │                             │
│             │ │  Strategy   │ │                             │
│             │ │             │ │                             │
│             │ │  Sending    │ │                             │
│             │ │  Strategy   │ │                             │
│             │ │  (shared)   │ │                             │
│             │ │             │ │                             │
└─────────────┘ └─────────────┘ └─────────────────────────────┘
```

### 1.3 Entity Inheritance Hierarchy

```
                    ┌───────────────────────┐
                    │   OutreachEntity      │
                    │   (abstract base)     │
                    ├───────────────────────┤
                    │ - id: string          │
                    │ - name: string        │
                    │ - contactEmail: string│
                    │ - contactPerson: string│
                    │ - status: Status      │
                    │ - discoveredAt: Date  │
                    │ - metadata: Object    │
                    ├───────────────────────┤
                    │ + validate(): boolean │
                    │ + getDisplayName(): str│
                    │ + getEmailPayload(): obj│
                    └───────────┬───────────┘
                                │
              ┌─────────────────┴─────────────────┐
              ▼                                   ▼
┌───────────────────────────┐     ┌───────────────────────────────┐
│       VCEntity            │     │    MunicipalEntity            │
├───────────────────────────┤     ├───────────────────────────────┤
│ - vcName: string          │     │ - municipalityName: string    │
│ - firmName: string        │     │ - canton: string              │
│ - focusAreas: string[]    │     │ - province: string            │
│ - investmentStage: string │     │ - country: string             │
│ - checkSize: string       │     │ - population: number          │
│ - portfolio: string[]     │     │ - website: string             │
│ - relevanceScore: number  │     │ - mayorName: string           │
│ - painPoints: string[]    │     │ - councilEmails: string[]     │
│ - partners: string[]      │     │ - phone: string               │
│ - location: string        │     │ - xHandle: string             │
│ - website: string         │     │ - language: string            │
├───────────────────────────┤     ├───────────────────────────────┤
│ + getInvestmentProfile()  │     │ + getRegionalContext()        │
│ + getPriorityScore()      │     │ + getLanguagePreference()     │
└───────────────────────────┘     └───────────────────────────────┘
```

### 1.4 Strategy Pattern Implementation

```
┌─────────────────────────────────────────────────────────────────┐
│                      Strategy Interface                         │
├─────────────────────────────────────────────────────────────────┤
│  interface IStrategy<TInput, TOutput> {                         │
│    execute(input: TInput): Promise<TOutput>;                    │
│    canHandle(entity: OutreachEntity): boolean;                  │
│    getName(): string;                                           │
│  }                                                              │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    Strategy Registry                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────┐  ┌──────────────────┐                    │
│  │ Type: VC         │  │ Type: Municipal  │                    │
│  │                  │  │                  │                    │
│  │ Discovery:       │  │ Discovery:       │                    │
│  │   VCDiscovery    │  │   MuniDiscovery  │                    │
│  │                  │  │                  │                    │
│  │ Research:        │  │ Research:        │                    │
│  │   VCResearch     │  │   MuniResearch   │                    │
│  │                  │  │                  │                    │
│  │ Personalization: │  │ Personalization: │                    │
│  │   VCPersonalizer │  │   MuniPersonalizer│                   │
│  └──────────────────┘  └──────────────────┘                    │
│                                                                 │
│  ┌──────────────────┐  ┌──────────────────┐                    │
│  │ Shared Strategies│  │                  │                    │
│  ├──────────────────┤  │                  │                    │
│  │ Validation       │  │                  │                    │
│  │   (ZeroBounce)   │  │                  │                    │
│  │                  │  │                  │                    │
│  │ Sending          │  │                  │                    │
│  │   (SMTP/         │  │                  │                    │
│  │    Smartlead)    │  │                  │                    │
│  └──────────────────┘  └──────────────────┘                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Configuration Schema

### 2.1 Base Configuration (config/default.json)

```json
{
  "skill": {
    "name": "alygn-outreach",
    "version": "1.0.0",
    "defaultType": "vc"
  },
  "pipeline": {
    "phases": ["discover", "validate", "research", "personalize", "send"],
    "defaultBatchSize": 10,
    "statePersistence": {
      "enabled": true,
      "directory": "/tmp",
      "format": "json"
    }
  },
  "email": {
    "defaultProvider": "smtp",
    "providers": {
      "smtp": {
        "rateLimitMs": 3000,
        "maxRetries": 3,
        "batchSize": 12
      },
      "smartlead": {
        "rateLimitMs": 2000,
        "maxRetries": 3,
        "batchSize": 20
      }
    },
    "validation": {
      "defaultValidator": "zerobounce",
      "minConfidenceScore": 0.7,
      "skipInvalid": true
    },
    "from": {
      "name": "Alygn R&D",
      "email": "outreach@alyygn.com"
    },
    "cc": "tanialeaidm@gmail.com"
  },
  "research": {
    "defaultSource": "web_search",
    "timeoutMs": 30000,
    "maxResults": 5
  },
  "notion": {
    "enabled": true,
    "databases": {
      "vc_outreach": "VC_TRACKER_DB_ID",
      "municipal_outreach": "MUNI_TRACKER_DB_ID"
    }
  },
  "logging": {
    "level": "info",
    "destination": "console",
    "includeTimestamps": true
  }
}
```

### 2.2 VC-Specific Configuration (config/vc.json)

```json
{
  "type": "vc",
  "discovery": {
    "sources": ["web_search", "crunchbase", "linkedin", "seed_list"],
    "seedListPath": "data/seed-vc-list.json",
    "focusAreas": [
      "AI safety",
      "AI alignment",
      "AI governance",
      "responsible AI",
      "frontier tech"
    ],
    "investmentStages": ["seed", "pre-seed", "series-a", "series-b"],
    "minRelevanceScore": 7,
    "geography": ["US", "EU", "UK", "Canada", "Global"]
  },
  "research": {
    "fields": [
      "investment_thesis",
      "portfolio_companies",
      "partners",
      "recent_investments",
      "pain_points",
      "check_size_range"
    ],
    "relevanceScoring": {
      "keywords": {
        "high": ["AI safety", "AI alignment", "existential risk", "AGI governance"],
        "medium": ["AI governance", "AI ethics", "responsible AI", "AI policy"],
        "low": ["AI", "machine learning", "deep tech", "frontier tech"]
      },
      "stageWeights": {
        "seed": 3,
        "pre-seed": 3,
        "series-a": 2,
        "series-b": 1
      }
    }
  },
  "personalization": {
    "variants": ["governance", "institutional"],
    "defaultVariant": "governance",
    "language": "en",
    "templates": {
      "subject": "ALYGN - AI Governance Infrastructure",
      "tone": "institutional_restraint"
    }
  },
  "prioritization": {
    "criteria": ["relevance_score", "fund_size", "ai_safety_focus", "recent_activity"]
  }
}
```

### 2.3 Municipal-Specific Configuration (config/municipal.json)

```json
{
  "type": "municipal",
  "discovery": {
    "regions": {
      "cr": {
        "name": "Costa Rica",
        "totalMunicipalities": 82,
        "sourceUrls": [
          "https://www.una.ac.cr/centrospoblacion/",
          "https://www.inec.cr/"
        ],
        "dataFile": "data/costa-rica-municipalities.json"
      },
      "us-ca": {
        "name": "California, USA",
        "sourceUrls": [
          "https://www.cacities.org/",
          "wikipedia:List_of_municipalities_in_California"
        ]
      },
      "us-tx": {
        "name": "Texas, USA",
        "sourceUrls": [
          "https://www.tml.org/",
          "wikipedia:List_of_municipalities_in_Texas"
        ]
      }
    },
    "defaultRegion": "cr"
  },
  "research": {
    "fields": [
      "mayor_name",
      "council_members",
      "population",
      "existing_ai_initiatives",
      "digital_maturity",
      "contact_info",
      "social_handles"
    ],
    "signals": [
      "AI mentions in council meetings",
      "Digital transformation programs",
      "Smart city initiatives",
      "Technology partnerships"
    ]
  },
  "personalization": {
    "variants": ["governance", "institutional", "traiga"],
    "defaultVariant": "governance",
    "languages": ["es", "en"],
    "defaultLanguage": "es",
    "culturalAdaptation": {
      "cr": {
        "formalityLevel": "formal",
        "titlePreference": "Alcalde/Alcaldesa",
        "traigaAwareness": true
      }
    },
    "templates": {
      "subject_es": "ALYGN - Infraestructura de Gobernanza de IA",
      "subject_en": "ALYGN - AI Governance Infrastructure",
      "tone": "institutional_collaborative"
    }
  },
  "prioritization": {
    "criteria": ["population", "digital_readiness", "ai_signals", "strategic_importance"]
  }
}
```

### 2.4 Configuration Merge Strategy

```javascript
// Configuration loading with merge
const defaultConfig = loadJSON('config/default.json');
const typeConfig = loadJSON(`config/${type}.json`);

// Deep merge: type-specific overrides defaults
const config = deepMerge(defaultConfig, typeConfig, {
  // CLI arguments override both
  overrides: cliArgs
});

// Validation
const validatedConfig = ConfigSchema.parse(config);
```

---

## 3. Action Pipeline Flow

### 3.1 State Machine Diagram

```
                    ┌─────────┐
         ┌─────────►│  IDLE   │◄────────┐
         │          └────┬────┘         │
         │               │              │
    reset│               │ discover     │
         │               ▼              │
         │          ┌─────────┐       │
         └──────────┤DISCOVER │───────┘
                    │  -ING   │
                    └────┬────┘
                         │ entities found
                         ▼
                    ┌─────────┐
              ┌────►│VALIDATE │
              │     │  -ING   │
              │     └────┬────┘
              │          │ emails validated
              │          ▼
              │     ┌─────────┐
              │     │RESEARCH │◄────── can skip
              │     │  -ING   │
              │     └────┬────┘
              │          │ research complete
              │          ▼
              │     ┌─────────┐
              │     │PERSONAL-│◄────── can skip
              │     │  IZE    │
              │     │ -ING    │
              │     └────┬────┘
              │          │ drafts generated
              │          ▼
              │     ┌─────────┐
              └─────┤ REVIEW  │────── reject
                    │PENDING  │
                    └────┬────┘
                         │ approved
                         ▼
                    ┌─────────┐
                    │  SEND   │
                    │  -ING   │
                    └────┬────┘
                         │ sent
                         ▼
                    ┌─────────┐
                    │COMPLETE │
                    └─────────┘
```

### 3.2 State Persistence Format

```typescript
// /tmp/alygn-{type}-{phase}.json
interface PipelineState {
  skillVersion: string;
  type: 'vc' | 'municipal';
  phase: Phase;
  startedAt: ISO8601;
  updatedAt: ISO8601;
  config: ConfigSnapshot;
  
  // Current batch
  entities: {
    all: OutreachEntity[];
    filtered: OutreachEntity[];
    processed: string[]; // entity IDs
    failed: string[];    // entity IDs
  };
  
  // Phase-specific data
  phaseData: {
    // For discover phase
    discovered?: {
      source: string;
      totalFound: number;
      newEntities: number;
    };
    
    // For validate phase
    validated?: {
      validEmails: number;
      invalidEmails: number;
      riskyEmails: number;
    };
    
    // For research phase
    researched?: {
      completedResearch: number;
      pendingResearch: number;
      sourcesUsed: string[];
    };
    
    // For personalize phase
    personalized?: {
      draftsGenerated: number;
      variants: string[];
    };
    
    // For send phase
    sent?: {
      emailsSent: number;
      emailsFailed: number;
      providerUsed: string;
      batchId: string;
    };
  };
  
  // Resume token
  resumeToken: string;
}
```

### 3.3 Action Execution Flow

```javascript
// Pipeline execution
class Pipeline {
  async execute(action: Action, options: PipelineOptions): Promise<PipelineResult> {
    // 1. Load previous state (or create new)
    const state = await this.loadState(options.type, action);
    
    // 2. Get appropriate strategy
    const strategy = this.strategyRegistry.get(action, state.type);
    
    // 3. Pre-action validation
    const validation = await this.validatePreconditions(state, action);
    if (!validation.valid) {
      return { success: false, errors: validation.errors };
    }
    
    // 4. Execute strategy
    const result = await strategy.execute(state, options);
    
    // 5. Update state
    await this.saveState({
      ...state,
      phase: action,
      entities: result.entities,
      phaseData: result.phaseData
    });
    
    // 6. Return result
    return {
      success: true,
      entitiesProcessed: result.entities.length,
      nextAction: this.getNextAction(action),
      stateFile: state.filePath
    };
  }
}
```

---

## 4. CLI Interface Specification

### 4.1 Command Structure

```
alygn-outreach --type=<vc|muni> --action=<action> [options]
```

### 4.2 Global Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--type` | string | `vc` | Entity type: `vc` or `muni` |
| `--action` | string | required | Pipeline action to execute |
| `--config` | path | `$HOME/.agents/skills/alygn-outreach/config/` | Config directory override |
| `--limit` | number | 10 | Maximum entities to process |
| `--dry-run` | boolean | false | Preview without side effects |
| `--resume` | token | null | Resume from previous state |
| `--output` | path | `/tmp/alygn-{type}-{action}.json` | Custom output path |
| `--verbose` | boolean | false | Detailed logging |

### 4.3 Actions

#### `discover` - Discover new entities

```bash
# VC discovery
alygn-outreach --type=vc --action=discover \
  --query="AI safety seed investors" \
  --focus-area="AI governance" \
  --limit=20

# Municipal discovery
alygn-outreach --type=muni --action=discover \
  --region=cr \
  --canton="San José" \
  --limit=10
```

**VC-specific options:**
- `--query`: Search query for web discovery
- `--focus-area`: Filter by investment focus
- `--stage`: Filter by investment stage
- `--geography`: Filter by location

**Municipal-specific options:**
- `--region`: Region code (cr, us-ca, us-tx)
- `--canton`: Specific canton/municipality
- `--province`: Filter by province/state

#### `validate` - Validate contact emails

```bash
alygn-outreach --type=vc --action=validate \
  --input=/tmp/alygn-vc-discovered.json \
  --validator=zerobounce \
  --min-confidence=0.7
```

**Options:**
- `--input`: Input file from previous phase (or auto-detect)
- `--validator`: Email validator to use (zerobounce, regex)
- `--min-confidence`: Minimum confidence score (0-1)
- `--skip-invalid`: Skip entities with invalid emails

#### `research` - Deep research on entities

```bash
# VC research
alygn-outreach --type=vc --action=research \
  --input=/tmp/alygn-vc-validated.json \
  --sources="web,crunchbase,linkedin" \
  --depth=standard

# Municipal research
alygn-outreach --type=muni --action=research \
  --region=cr \
  --signals="ai_initiatives,digital_maturity"
```

**Options:**
- `--input`: Input file from previous phase
- `--sources`: Research sources (comma-separated)
- `--depth`: Research depth (quick, standard, deep)
- `--signals`: Specific signals to look for (muni only)

#### `personalize` - Generate personalized content

```bash
# VC personalization
alygn-outreach --type=vc --action=personalize \
  --input=/tmp/alygn-vc-researched.json \
  --variant=governance \
  --model=grok

# Municipal personalization
alygn-outreach --type=muni --action=personalize \
  --region=cr \
  --language=es \
  --variant=traiga
```

**Options:**
- `--input`: Input file from previous phase
- `--variant`: Email variant (governance, institutional, traiga)
- `--language`: Output language (en, es)
- `--model`: AI model for generation (grok, claude)

#### `send` - Send emails

```bash
alygn-outreach --type=vc --action=send \
  --input=/tmp/alygn-vc-personalized.json \
  --provider=smtp \
  --rate-limit=3000 \
  --dry-run

alygn-outreach --type=muni --action=send \
  --region=cr \
  --provider=smartlead \
  --batch-size=12
```

**Options:**
- `--input`: Input file from previous phase
- `--provider`: Email provider (smtp, smartlead)
- `--rate-limit`: Milliseconds between sends
- `--batch-size`: Emails per batch
- `--test-email`: Override recipient for testing

#### `status` - Check pipeline status

```bash
alygn-outreach --type=vc --action=status
```

**Output:**
- Current phase
- Entities processed/total
- Last action timestamp
- Next recommended action

#### `full` - Run complete pipeline

```bash
alygn-outreach --type=vc --action=full \
  --query="AI governance VCs" \
  --limit=10 \
  --approval-gates=personalize,send
```

**Options:**
- `--approval-gates`: Phases requiring human approval (comma-separated)

### 4.4 Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Validation failed |
| 3 | Research incomplete |
| 4 | Approval required |
| 5 | Send failed |
| 10 | Resume token expired |

---

## 5. Lobster Workflow Integration

### 5.1 Updated VC Campaign Workflow

```yaml
# .lobster/alygn-campaign.lobster
name: alygn-vc-outreach
metadata:
  skill: alygn-outreach
  type: vc

steps:
  # Phase 1: Discovery
  - id: discover-vcs
    command: openclaw skill alygn-outreach --type=vc --action=discover --limit=20 --query="AI safety governance VCs"
    description: "Discover VC firms matching criteria"
    output:
      file: /tmp/alygn-vc-discovered.json

  # Phase 2: Validation
  - id: validate-emails
    command: openclaw skill alygn-outreach --type=vc --action=validate --input=/tmp/alygn-vc-discovered.json
    description: "Validate contact emails via ZeroBounce"
    after: discover-vcs
    output:
      file: /tmp/alygn-vc-validated.json

  # Phase 3: Research
  - id: research-vcs
    command: openclaw skill alygn-outreach --type=vc --action=research --input=/tmp/alygn-vc-validated.json
    description: "Deep research on VCs (thesis, partners, pain points)"
    after: validate-emails
    output:
      file: /tmp/alygn-vc-researched.json

  # Phase 4: Personalization
  - id: personalize-emails
    command: openclaw skill alygn-outreach --type=vc --action=personalize --input=/tmp/alygn-vc-researched.json --variant=governance
    description: "Generate personalized email drafts"
    after: research-vcs
    output:
      file: /tmp/alygn-vc-personalized.json

  # Phase 5: Human Review (CRITICAL)
  - id: review-drafts
    command: openclaw skill alygn-outreach --type=vc --action=review --input=/tmp/alygn-vc-personalized.json
    description: "Human review before sending - APPROVAL REQUIRED"
    after: personalize-emails
    approval: required
    on_reject: halt
    output:
      file: /tmp/alygn-vc-approved.json

  # Phase 6: Sync to Notion
  - id: sync-notion
    command: openclaw skill alygn-outreach --type=vc --action=sync --input=/tmp/alygn-vc-approved.json --target=notion
    description: "Sync approved VCs to Notion database"
    after: review-drafts
    output:
      file: /tmp/alygn-vc-synced.json

  # Phase 7: Send
  - id: send-emails
    command: openclaw skill alygn-outreach --type=vc --action=send --input=/tmp/alygn-vc-approved.json --provider=smtp
    description: "Send emails via SMTP (rate-limited)"
    after: sync-notion
    output:
      file: /tmp/alygn-vc-sent.json

# Error handling
on_error:
  notify: discord
  channel: "1466532145257255004"
  include_log: true

# Resumability
resume:
  enabled: true
  token_file: /tmp/alygn-vc-resume-token.json
```

### 5.2 Updated Municipal Outreach Workflow

```yaml
# .lobster/muni-outreach.lobster
name: alygn-municipal-outreach
metadata:
  skill: alygn-outreach
  type: municipal
  region: costa-rica
  wave: 1
  total_municipalities: 82

steps:
  # Phase 1: Discovery
  - id: discover-municipalities
    command: openclaw skill alygn-outreach --type=muni --action=discover --region=cr --limit=82
    description: "Discover all 82 Costa Rican cantones"
    output:
      file: /tmp/alygn-muni-cr-discovered.json

  # Phase 2: Validation
  - id: validate-emails
    command: openclaw skill alygn-outreach --type=muni --action=validate --input=/tmp/alygn-muni-cr-discovered.json
    description: "Verify mayor/council emails via ZeroBounce"
    after: discover-municipalities
    output:
      file: /tmp/alygn-muni-cr-validated.json

  # Phase 3: Research
  - id: research-municipalities
    command: openclaw skill alygn-outreach --type=muni --action=research --input=/tmp/alygn-muni-cr-validated.json --region=cr
    description: "Research each municipality (mayor, initiatives, AI readiness)"
    after: validate-emails
    output:
      file: /tmp/alygn-muni-cr-researched.json

  # Phase 4: Personalization
  - id: personalize-emails
    command: openclaw skill alygn-outreach --type=muni --action=personalize --input=/tmp/alygn-muni-cr-researched.json --language=es --variant=governance
    description: "Generate personalized emails (governance/institutional/traiga variants)"
    after: research-municipalities
    output:
      file: /tmp/alygn-muni-cr-personalized.json

  # Phase 5: Human Review (CRITICAL)
  - id: review-drafts
    command: openclaw skill alygn-outreach --type=muni --action=review --input=/tmp/alygn-muni-cr-personalized.json
    description: "Human review before sending - APPROVAL REQUIRED"
    after: personalize-emails
    approval: required
    on_reject: halt
    output:
      file: /tmp/alygn-muni-cr-approved.json

  # Phase 6: Sync to Supabase
  - id: sync-database
    command: openclaw skill alygn-outreach --type=muni --action=sync --input=/tmp/alygn-muni-cr-approved.json --target=supabase
    description: "Sync to Supabase alygn_global_muni database"
    after: review-drafts
    output:
      file: /tmp/alygn-muni-cr-synced.json

  # Phase 7: Send
  - id: send-emails
    command: openclaw skill alygn-outreach --type=muni --action=send --input=/tmp/alygn-muni-cr-approved.json --provider=smtp
    description: "Send emails via SMTP (rate-limited, multi-domain)"
    after: sync-database
    output:
      file: /tmp/alygn-muni-cr-sent.json

  # Phase 8: X Engagement
  - id: x-engagement
    command: openclaw skill alygn-outreach --type=muni --action=engage --input=/tmp/alygn-muni-cr-approved.json --channel=x
    description: "Follow + engage with municipalities on X/Twitter"
    after: send-emails
    optional: true
    output:
      file: /tmp/alygn-muni-cr-engaged.json

# Error handling
on_error:
  notify: discord
  channel: "1466532145257255004"
  include_log: true
  halt_on_critical: true

# Resumability
resume:
  enabled: true
  token_file: /tmp/alygn-muni-cr-resume-token.json
  skip_completed_steps: true
```

### 5.3 Shared Lobster Templates

```yaml
# .lobster/templates/alygn-outreach-base.yaml
templates:
  # Reusable error handling
  error-handler: &error-handler
    notify: discord
    channel: "${DISCORD_NOTIFICATIONS_CHANNEL}"
    include_log: true
    format: "❌ Step {{step_id}} failed: {{error_message}}"

  # Reusable approval gate
  approval-gate: &approval-gate
    approval: required
    on_reject: halt
    notify: discord
    channel: "${DISCORD_NOTIFICATIONS_CHANNEL}"
    message: "📝 Drafts ready for review: {{input_file}}"

  # Reusable state management
  state-management: &state-management
    enabled: true
    token_file: "/tmp/alygn-{{type}}-{{region}}-resume-token.json"
    skip_completed: true
```

---

## 6. Migration Plan

### 6.1 Migration Strategy: Phased Rollout

```
┌─────────────────────────────────────────────────────────────────┐
│                  Migration Timeline                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Phase 1: Foundation (Week 1)                                   │
│  ─────────────────────────────                                  │
│  □ Create skill directory structure                             │
│  □ Implement base entity classes                                │
│  □ Implement shared strategies (validation, sending)            │
│  □ Port email template to skill                               │
│  □ Unit tests for core components                               │
│                                                                 │
│  Phase 2: VC Migration (Week 2)                                 │
│  ───────────────────────────────                                │
│  □ Implement VCEntity and VC-specific strategies                │
│  □ Port VC discovery logic                                      │
│  □ Port VC research logic                                       │
│  □ Port VC personalization logic                                │
│  □ Parallel testing: skill vs existing scripts                  │
│  □ Update .lobster/alygn-campaign.lobster                       │
│                                                                 │
│  Phase 3: Municipal Migration (Week 3)                        │
│  ──────────────────────────────────                             │
│  □ Implement MunicipalEntity and muni-specific strategies       │
│  □ Port municipal discovery logic                               │
│  □ Port municipal research logic                                │
│  □ Port municipal personalization logic                         │
│  □ Parallel testing: skill vs existing scripts                  │
│  □ Update .lobster/muni-outreach.lobster                        │
│                                                                 │
│  Phase 4: Validation & Cutover (Week 4)                         │
│  ─────────────────────────────────────                          │
│  □ Full integration testing                                     │
│  □ Documentation updates                                          │
│  □ Team training                                                  │
│  □ Gradual cutover (dry-run first)                              │
│  □ Archive old scripts (keep for rollback)                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 6.2 File Mapping

| Current Path | New Skill Path | Notes |
|--------------|----------------|-------|
| `/scripts/alygn/lib/outreach-email-template.js` | `$HOME/.agents/skills/alygn-outreach/src/templates/` | Port both VC and muni variants |
| `/scripts/alygn/lib/email/` | `$HOME/.agents/skills/alygn-outreach/src/email/` | Full email infrastructure |
| `/scripts/alygn/vc-outreach/core/vc-contact-discovery.js` | `$HOME/.agents/skills/alygn-outreach/src/strategies/VCDiscoveryStrategy.js` | Refactor to strategy |
| `/scripts/alygn/vc-outreach/tracking/deep-research-vcs.js` | `$HOME/.agents/skills/alygn-outreach/src/strategies/VCResearchStrategy.js` | Refactor to strategy |
| `/scripts/alygn/vc-outreach/email/draft-outreach-emails.js` | `$HOME/.agents/skills/alygn-outreach/src/strategies/VCPersonalizationStrategy.js` | Refactor to strategy |
| `/scripts/alygn/muni-outreach/discovery/muni-discovery.js` | `$HOME/.agents/skills/alygn-outreach/src/strategies/MuniDiscoveryStrategy.js` | Refactor to strategy |
| `/scripts/alygn/muni-outreach/research/muni-research.js` | `$HOME/.agents/skills/alygn-outreach/src/strategies/MuniResearchStrategy.js` | Refactor to strategy |
| `/scripts/alygn/muni-outreach/personalization/muni-personalizer.js` | `$HOME/.agents/skills/alygn-outreach/src/strategies/MuniPersonalizationStrategy.js` | Refactor to strategy |

### 6.3 Backward Compatibility

```javascript
// Backward compatibility layer
// scripts/alygn/vc-outreach/legacy-wrapper.js

import { OutreachSkill } from '$HOME/.agents/skills/alygn-outreach/src/index.js';

// Wrap existing CLI calls to use new skill
export async function legacyDiscovery(query, limit) {
  const skill = new OutreachSkill({ type: 'vc' });
  return skill.execute('discover', { query, limit });
}

// Existing scripts can be gradually migrated
// by replacing internal logic with skill calls
```

### 6.4 Rollback Plan

```bash
# If skill has issues, quick rollback:

# 1. Revert Lobster workflows to use old scripts
git checkout HEAD~1 -- .lobster/alygn-campaign.lobster

# 2. Archive skill (don't delete, for debugging)
mv $HOME/.agents/skills/alygn-outreach $HOME/.agents/skills/alygn-outreach-DISABLED-$(date +%Y%m%d)

# 3. Old scripts remain functional
node scripts/alygn/vc-outreach/orchestration/outreach-orchestrator.js
```

---

## 7. Testing Strategy

### 7.1 Test Pyramid

```
                    ┌─────────┐
                    │ E2E     │  → Full pipeline runs (dry-run)
                    │ Tests   │
                   ┌┴─────────┴┐
                   │ Integration│ → Strategy + Entity combos
                   │   Tests   │
                  ┌┴───────────┴┐
                  │   Unit      │ → Entity validation, config
                  │   Tests     │   loading, state management
                  └─────────────┘
```

### 7.2 Test Scenarios

| Scenario | Type | Description |
|----------|------|-------------|
| VC discovery with filters | Unit | Query parsing, focus area filtering |
| Municipal discovery by region | Unit | Region config loading, data validation |
| Email validation chain | Integration | ZeroBounce API, regex fallback, result aggregation |
| Research strategy selection | Unit | Entity type → strategy mapping |
| Personalization with templates | Integration | Template rendering, language selection |
| SMTP sending with rate limiting | Integration | Batch sending, error handling, retries |
| Full VC pipeline (dry-run) | E2E | discover → validate → research → personalize |
| Full Municipal pipeline (dry-run) | E2E | discover → validate → research → personalize → send |
| State persistence | Unit | Save/load cycle, resume token handling |
| Config merge | Unit | Default + type-specific + CLI args |

---

## 8. Future Extensibility

### 8.1 Adding New Entity Types

To add a new outreach type (e.g., Corporate Partners):

1. Create `CorporateEntity.js` extending `OutreachEntity`
2. Create `CorporateDiscoveryStrategy.js`, `CorporateResearchStrategy.js`, `CorporatePersonalizationStrategy.js`
3. Add `config/corporate.json` with type-specific settings
4. Register strategies in `StrategyRegistry`

### 8.2 Adding New Strategies

To add a new email provider:

1. Create `NewProvider.js` implementing `EmailProvider` interface
2. Add to `EmailProviderFactory`
3. Add config section in `default.json`

---

## 9. Security Considerations

### 9.1 Secrets Management

```javascript
// Secrets are NOT stored in config files
// They are loaded via OpenClaw credentials system

import { getNotionDatabase, loadCredentials } from 'openclaw/credentials';

// In skill:
const notionDbId = getNotionDatabase('vc_outreach');
const emailConfig = loadCredentials('email_smtp');
```

### 9.2 Data Protection

- Email validation results cached only in `/tmp` (ephemeral)
- No PII persisted beyond session
- Notion/Supabase sync uses encrypted connections
- Test mode available for all send operations

---

## 10. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Code reuse ratio | >80% | Shared lines / Total lines |
| Migration time | <4 weeks | From start to full cutover |
| Bug rate post-migration | <5% | Issues per 100 outreach attempts |
| Config flexibility | 100% | Can switch strategies via config |
| Test coverage | >80% | Lines covered / Total lines |

---

## Appendix A: File Structure

```
$HOME/.agents/skills/alygn-outreach/
├── SKILL.md                          # Usage documentation
├── SKILL-DESIGN.md                   # This document
├── package.json                      # Dependencies
├── config/
│   ├── default.json                  # Base configuration
│   ├── vc.json                       # VC-specific settings
│   └── municipal.json                # Municipal-specific settings
├── src/
│   ├── core/
│   │   ├── OutreachSkill.js          # Main skill orchestrator
│   │   ├── ConfigLoader.js           # Configuration management
│   │   ├── EntityFactory.js          # Entity instantiation
│   │   ├── Pipeline.js               # Action pipeline
│   │   └── StateManager.js           # Persistence layer
│   ├── entities/
│   │   ├── OutreachEntity.js         # Base entity interface
│   │   ├── VCEntity.js               # VC-specific entity
│   │   └── MunicipalEntity.js        # Municipal entity
│   ├── strategies/
│   │   ├── StrategyRegistry.js       # Strategy resolution
│   │   ├── DiscoveryStrategy.js      # Abstract discovery
│   │   ├── ValidationStrategy.js     # Email validation
│   │   ├── ResearchStrategy.js       # Abstract research
│   │   ├── PersonalizationStrategy.js # Abstract personalization
│   │   ├── SendingStrategy.js        # Email sending
│   │   └── implementations/
│   │       ├── VCDiscoveryStrategy.js
│   │       ├── VCResearchStrategy.js
│   │       ├── VCPersonalizationStrategy.js
│   │       ├── MuniDiscoveryStrategy.js
│   │       ├── MuniResearchStrategy.js
│   │       └── MuniPersonalizationStrategy.js
│   ├── email/
│   │   ├── EmailService.js           # Shared email service
│   │   ├── EmailProviderFactory.js   # Provider factory
│   │   ├── providers/
│   │   │   ├── SMTPProvider.js
│   │   │   └── SmartleadProvider.js
│   │   └── validators/
│   │       ├── EmailValidator.js
│   │       ├── EmailValidatorFactory.js
│   │       ├── RegexMXValidator.js
│   │       └── ZeroBounceValidator.js
│   ├── templates/
│   │   └── outreach-email-template.js # Unified template
│   └── index.js                       # Entry point
├── bin/
│   └── alygn-outreach                # CLI wrapper
└── tests/
    ├── unit/
    ├── integration/
    └── e2e/
```

---

*Document Version: 1.0*
*Last Updated: 2026-03-18*
*Author: Hugrukal (Software Architect)*
