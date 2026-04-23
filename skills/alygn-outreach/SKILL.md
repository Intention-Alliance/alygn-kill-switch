# ALYGN Unified Outreach Skill

A single, unified skill that handles both VC (Venture Capital) and municipal outreach using shared strategies and a common pipeline architecture.

> **TypeScript Version**: This skill is written in TypeScript and uses `bun` as the runtime.

## Overview

This skill consolidates outreach workflows into a single system with:
- **Unified Pipeline**: discover → validate → research → personalize → send
- **Type-Specific Strategies**: Different behavior for VC vs Municipal entities
- **Shared Infrastructure**: Common validation, email sending, and tracking
- **Unified CLI**: Single command interface with type switching
- **Wave Tracking**: 6-cronjob architecture for batch outreach (municipal only)
- **Supabase Integration**: Database persistence with generated types

## Directory Structure

```
alygn-outreach/
├── SKILL.md
├── src/
│   ├── entities/
│   │   ├── types.ts              # TypeScript interfaces (imports Supabase types)
│   │   ├── OutreachEntity.ts     # Base entity class
│   │   ├── VCEntity.ts           # VC firm entity
│   │   └── MunicipalEntity.ts    # Municipality entity
│   ├── strategies/
│   │   ├── StrategyRegistry.ts   # Factory for strategies
│   │   ├── discovery/
│   │   │   ├── DiscoveryStrategy.ts
│   │   │   ├── VCDiscoveryStrategy.ts
│   │   │   └── MunicipalDiscoveryStrategy.ts
│   │   ├── validation/
│   │   │   └── ValidationStrategy.ts
│   │   ├── research/
│   │   │   ├── ResearchStrategy.ts
│   │   │   ├── VCResearchStrategy.ts
│   │   │   └── MunicipalResearchStrategy.ts
│   │   ├── personalization/
│   │   │   ├── PersonalizationStrategy.ts
│   │   │   ├── VCPersonalizationStrategy.ts
│   │   │   └── MunicipalPersonalizationStrategy.ts
│   │   └── sending/
│   │       └── SendingStrategy.ts
│   ├── core/
│   │   ├── Pipeline.ts           # Main orchestrator
│   │   └── OutreachPipeline.ts   # Pipeline class
│   └── index.ts                  # Main entry point
└── bin/
    └── alygn-outreach.ts         # CLI wrapper
```

## Type Definitions

### Supabase Integration

The skill uses Supabase-generated types from the municipal outreach database schema:

```typescript
// Import pattern from types.ts
import type {
  Database,
  Tables,
  TablesInsert,
  TablesUpdate
} from '../../../../scripts/alygn/muni-outreach/supabase/src/database.types';
```

**Generated Types Location**: `scripts/alygn/muni-outreach/supabase/src/database.types.ts`

This file is auto-generated from the Supabase schema and provides:
- `Database` - Complete database type definition
- `Tables` - All table row types
- `TablesInsert` - Insert types for all tables
- `TablesUpdate` - Update types for all tables

### Entity Types (`src/entities/types.ts`)

```typescript
// Entity status types
export type EntityStatus = 
  | 'discovered' 
  | 'validated' 
  | 'researched' 
  | 'personalized' 
  | 'sent' 
  | 'replied' 
  | 'meeting' 
  | 'passed' 
  | 'not_interested';

// Priority levels
export type Priority = 'high' | 'medium' | 'low';

// Draft status for approval workflow
export type DraftStatus = 'Not drafted' | 'Drafted' | 'Approved' | 'Rejected' | 'Sent';

// Base outreach entity interface
export interface IOutreachEntity {
  id: string;
  type: 'vc' | 'municipal';
  name: string;
  email: string | null;
  website: string | null;
  phone: string | null;
  location: Location;
  status: EntityStatus;
  priority: Priority;
  discoveredAt: Date;
  lastUpdatedAt: Date;
  outreachCount: number;
  researchNotes: string | null;
  personalizationContext: Record<string, unknown> | null;
  typeData: Record<string, unknown>;
  emailValidation: IEmailValidation | null;
  sentEmailId: string | null;
  sentAt: Date | null;
  draftStatus: DraftStatus;
  draftId?: string;
  draftCreatedAt?: string;
  pageId?: string;
}

// VC-specific type data
export interface IVCTypeData {
  firmType: 'vc' | 'angel' | 'corporate' | 'accelerator';
  stageFocus: string[];
  sectorFocus: string[];
  checkSizeMin: number | null;
  checkSizeMax: number | null;
  aum: number | null;
  partners: IVCPartner[];
  portfolioCompanies: string[];
  recentInvestments: IRecentInvestment[];
  linkedInUrl: string | null;
  crunchbaseUrl: string | null;
  relevanceScore: number | null;
}

// Municipal-specific type data
export interface IMunicipalTypeData {
  governmentType: 'city' | 'county' | 'state' | 'regional';
  population: number | null;
  budget: number | null;
  departments: IDepartment[];
  keyContacts: IKeyContact[];
  initiatives: IInitiative[];
  painPoints: string[];
  currentVendors: string[];
  procurementProcess: string | null;
  decisionMakers: IDecisionMaker[];
  province: string | null;
  trAigaRelevant: boolean;
}

// Wave tracking (municipal only)
export interface ICostaRicaCanton {
  name: string;
  province: string;
  population: number;
  budget: number;
}
```

### Entity Relationships

```
IOutreachEntity (base)
├── VCEntity (extends IOutreachEntity)
│   └── typeData: IVCTypeData
│       ├── partners: IVCPartner[]
│       └── recentInvestments: IRecentInvestment[]
│
└── MunicipalEntity (extends IOutreachEntity)
    └── typeData: IMunicipalTypeData
        ├── departments: IDepartment[]
        ├── keyContacts: IKeyContact[]
        ├── initiatives: IInitiative[]
        └── decisionMakers: IDecisionMaker[]
```

## Database Schema

### Supabase Schema Location

**Migration Files**: `scripts/alygn/muni-outreach/supabase/migrations/`

| File | Description |
|------|-------------|
| `000_municipal_outreach_pipeline_schema.sql` | Core schema (municipalities, outreach_emails, x_engagements) |
| `001_local_government_outreach_schema.sql` | Extended local government tables |
| `003_add_wave_tracking.sql` | Wave tracking columns and tables |

### Core Tables

#### municipalities
```sql
CREATE TABLE municipalities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    country TEXT NOT NULL,
    region TEXT,
    province TEXT,
    population INTEGER,
    -- Contact Info
    website_url TEXT,
    mayor_name TEXT,
    mayor_email TEXT,
    council_emails TEXT[],
    general_email TEXT,
    phone TEXT,
    -- X/Twitter
    x_handle TEXT,
    x_url TEXT,
    -- Pipeline Status
    discovered_at TIMESTAMPTZ DEFAULT NOW(),
    researched_at TIMESTAMPTZ,
    verified_at TIMESTAMPTZ,
    outreach_sent_at TIMESTAMPTZ,
    replied_at TIMESTAMPTZ,
    reply_sentiment TEXT,
    -- Wave Tracking
    wave_number INTEGER DEFAULT 1,
    batch_status TEXT DEFAULT 'researched', -- researched|drafted|approved|sent|failed
    wave_date DATE,
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### outreach_emails
```sql
CREATE TABLE outreach_emails (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    municipality_id UUID REFERENCES municipalities(id) ON DELETE CASCADE,
    variant TEXT NOT NULL, -- 'governance' | 'institutional' | 'traiga'
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    recipient_email TEXT NOT NULL,
    recipient_name TEXT,
    -- Wave tracking
    wave_number INTEGER DEFAULT 1,
    wave_date DATE,
    -- Response tracking
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT DEFAULT 'sent', -- 'sent' | 'bounced' | 'replied' | 'failed'
    replied_at TIMESTAMPTZ,
    reply_sentiment TEXT
);
```

#### checkpoints (for cronjob tracking)
```sql
CREATE TABLE checkpoints (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wave_number INTEGER NOT NULL,
    wave_date DATE NOT NULL,
    cronjob_name TEXT NOT NULL, -- 'research-wave' | 'draft-wave' | 'send-wave' | etc.
    status TEXT DEFAULT 'pending', -- 'pending' | 'running' | 'completed' | 'failed'
    last_processed_id UUID,
    processed_count INTEGER DEFAULT 0,
    total_count INTEGER,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_wave_cronjob UNIQUE (wave_number, cronjob_name)
);
```

### Query Examples

```typescript
// Query municipalities by wave
const { data: municipalities } = await supabase
  .from('municipalities')
  .select('*')
  .eq('wave_number', 1)
  .eq('batch_status', 'researched');

// Query outreach emails with response tracking
const { data: emails } = await supabase
  .from('outreach_emails')
  .select('*, municipalities(name)')
  .eq('wave_number', 1)
  .not('replied_at', 'is', null);

// View: Pipeline summary by wave
const { data: summary } = await supabase
  .from('v_pipeline_summary')
  .select('*');

// View: Wave status breakdown
const { data: waveStatus } = await supabase
  .from('v_wave_status')
  .select('*')
  .eq('wave_number', 1);
```

## Sequence / Workflow

### Standard Pipeline Stages

The pipeline follows a 5-stage sequence:

```
1. DISCOVER → 2. VALIDATE → 3. RESEARCH → 4. PERSONALIZE → 5. SEND
```

| Stage | VC Action | Municipal Action | Output |
|-------|-----------|------------------|--------|
| **Discover** | Web search for AI safety VCs | Returns Costa Rica cantones (82 total) | Entity list with basic info |
| **Validate** | Email validation (regex-mx/zerobounce) | Email validation (regex-mx/zerobounce) | Validated email addresses |
| **Research** | Portfolio, thesis, partners, pain points | Initiatives, pain points, decision makers | Enriched entity data |
| **Personalize** | Generate English email (governance variant) | Generate Spanish email (traiga variant) | Personalized email draft |
| **Send** | Send via SMTP/Smartlead | Send via SMTP/Smartlead | Sent email tracking |

### Wave Tracking (Municipal Only)

Municipal outreach uses a **6-cronjob architecture** for batch processing:

```
┌─────────────────────────────────────────────────────────────┐
│                    WAVE N (e.g., Wave 1)                    │
├─────────────────────────────────────────────────────────────┤
│ 1. research-wave    │ Discover + research municipalities    │
│ 2. draft-wave       │ Generate email drafts                 │
│ 3. approve-wave     │ Human approval workflow (Notion)      │
│ 4. send-wave        │ Send approved emails                  │
│ 5. track-wave       │ Monitor replies/responses             │
│ 6. report-wave      │ Generate analytics                    │
└─────────────────────────────────────────────────────────────┘
```

**Wave Tracking Fields**:
- `wave_number` - Integer (1-6) tracking which wave a municipality belongs to
- `wave_date` - Date when municipality was assigned to current wave
- `batch_status` - Current status in wave: `researched` | `drafted` | `approved` | `sent` | `failed`

**Cronjob Schedule**:

| Cronjob | Schedule | Purpose |
|---------|----------|---------|
| `research-wave` | Daily 9:00 AM | Discover and research new municipalities |
| `draft-wave` | Daily 10:00 AM | Generate personalized email drafts |
| `approve-wave` | Manual trigger | Human review and approval |
| `send-wave` | Daily 2:00 PM | Send approved emails |
| `track-wave` | Hourly | Monitor replies and engagement |
| `report-wave` | Weekly Monday | Generate outreach analytics |

**State Persistence**:

Pipeline state is saved to `$HOME/.openclaw/workspace/reports/alygn/{subFolderType}/alygn-{type}-{phase}-{date}.json`:

```json
{
  "timestamp": "2026-03-26T17:00:00Z",
  "type": "municipal",
  "phase": "personalized",
  "data": {
    "count": 10,
    "entities": [...]
  }
}
```

Resume from state file with `--input` flag.

## Translation Support

### Spanish Translation (Municipal)

Municipal outreach uses Spanish language templates via `MunicipalPersonalizationStrategy`:

```typescript
// MunicipalPersonalizationStrategy.ts
const subject = this.generateSubject(municipalEntity, companyName);
// Output: "Apoyando la transformación digital de San José"

const emailHtml = generateEmail({
  recipientName: 'Diego Miranda',
  companyName: 'San José',
  painPoints: ['gobernanza de IA', 'transformación digital'],
  variant: 'traiga',
  language: 'es',
  subject
});
```

### Template Variants

| Variant | Language | Use Case |
|---------|----------|----------|
| `governance` | Spanish | Standard municipal outreach |
| `institutional` | Spanish | Institutional coordination focus |
| `traiga` | Spanish | TRAIGA Act compliance focus |
| `governance` | English | Standard VC outreach |
| `institutional` | English | Institutional VC outreach |

### Template Variables

Municipal templates support these variables:

```typescript
interface MunicipalEmailParams {
  recipientName: string;      // "Diego Miranda"
  companyName: string;        // "San José"
  painPoints: string[];       // ["gobernanza de IA", "transformación digital"]
  variant: 'governance' | 'institutional' | 'traiga';
  language: 'es';             // Spanish for municipal
  subject: string;            // Generated subject line
  ctaText?: string;            // Custom CTA button text
  customPS?: string;          // Custom footer note
}
```

Default Spanish P.S. line:
```
P.S.: Este mensaje fue generado con IA, verificado por humanos. 
Transparencia total en nuestros procesos.
```

### English Templates (VC)

```typescript
interface VCEmailParams {
  recipientName: string;      // "Sarah Chen"
  companyName: string;        // "Khosla Ventures"
  painPoints: string[];       // ["AI safety", "governance"]
  variant: 'governance' | 'institutional';
  language: 'en';             // English for VC
  subject: string;
  customHook?: string;        // Custom personalization hook
  ctaText?: string;
  customPS?: string;
}
```

Default English P.S. line:
```
P.S.: This message was AI-generated and verified by humans. 
Total transparency in our processes.
```

## Usage

### CLI Commands

```bash
# VC Discovery
bun bin/alygn-outreach.ts --type=vc --action=discover --limit=10 --dry-run

# Municipal Discovery (Costa Rica)
bun bin/alygn-outreach.ts --type=municipal --region=costa-rica --action=discover --limit=10 --dry-run

# Full Pipeline
bun bin/alygn-outreach.ts --type=vc --action=pipeline --limit=5 --dry-run

# Individual Stages
bun bin/alygn-outreach.ts --type=vc --action=validate --limit=5
bun bin/alygn-outreach.ts --type=vc --action=research --limit=5
bun bin/alygn-outreach.ts --type=vc --action=personalize --limit=5
bun bin/alygn-outreach.ts --type=vc --action=send --limit=5 --dry-run
```

### CLI Options

| Option | Description | Values |
|--------|-------------|--------|
| `--type` | Entity type | `vc`, `municipal` |
| `--action` | Action to perform | `discover`, `validate`, `research`, `personalize`, `send`, `pipeline` |
| `--limit` | Max entities to process | Number (default: 20) |
| `--dry-run` | Simulate without executing | Flag |
| `--region` | Region filter | `costa-rica` |
| `--input` | Input state file | File path |
| `--test-email` | Override recipient email | Email address |
| `--validator` | Email validator | `regex-mx`, `zerobounce` |
| `--draft-status` | Filter by Notion Draft Status | `Not drafted`, `Drafted`, `Approved`, `Rejected`, `Sent` |
| `--email-send-to` | Comma-separated list of entity IDs to send to | `entity-xxx,entity-yyy` |

### Send Action with Two-Filter System

```bash
# Send only to approved drafts with explicit ID list
bun bin/alygn-outreach.ts --type=vc --action=send \
  --draft-status=Approved \
  --email-send-to=entity-abc123,entity-def456

# Dry run to verify selection before sending
bun bin/alygn-outreach.ts --type=vc --action=send \
  --draft-status=Approved \
  --email-send-to=entity-abc123,entity-def456 \
  --dry-run
```

### Programmatic API

```typescript
import { Pipeline } from './src/core/Pipeline';
import { VCEntity } from './src/entities/VCEntity';

// Create pipeline with configuration
const pipeline = new Pipeline('vc', {
  sending: { providerType: 'smtp' },
  validation: { validatorType: 'regex-mx' }
});

try {
  // Run single action
  const result = await pipeline.run('discover', {
    dryRun: true,
    limit: 10
  });

  console.log(`Discovered: ${result.discovered}`);
  console.log(`State file: ${result.stateFile}`);
} catch (error) {
  console.error('Pipeline error:', error.message);
}

// Run full pipeline
const fullResult = await pipeline.run('pipeline', {
  dryRun: true,
  limit: 5
});
```

### Error Handling

```typescript
import { Pipeline } from './src/core/Pipeline';

const pipeline = new Pipeline('municipal', {
  sending: { providerType: 'smtp' }
});

try {
  const result = await pipeline.run('personalize', {
    dryRun: false,
    limit: 10,
    region: 'costa-rica'
  });

  if (result.skipped) {
    console.log(`Skipped: ${result.reason}`);
  } else {
    console.log(`Personalized: ${result.personalized}`);
  }
} catch (error) {
  if (error.message.includes('No entities found')) {
    console.error('No entities match the criteria');
  } else {
    console.error('Unexpected error:', error.message);
  }
  process.exit(1);
}
```

### Resuming from State

```typescript
import { Pipeline } from './src/core/Pipeline';

const pipeline = new Pipeline('vc', {});

// Resume from saved state
const result = await pipeline.run('validate', {
  dryRun: false,
  limit: 20,
  input: '$HOME/.openclaw/workspace/reports/alygn/vc-discover/alygn-vc-discovered-2026-03-26.json'
});
```

## Entities

### VCEntity

```typescript
{
  id: 'vc-abc123',
  type: 'vc',
  name: 'AI Safety Ventures',
  email: 'contact@aisafetyvc.com',
  website: 'https://aisafetyvc.com',
  location: { city: 'San Francisco', state: 'CA', country: 'US', region: null },
  status: 'personalized',
  draftStatus: 'Drafted',
  typeData: {
    firmType: 'vc',
    stageFocus: ['seed', 'series-a'],
    sectorFocus: ['AI safety', 'governance'],
    partners: [{ name: 'Dr. Sarah Chen', title: 'Managing Partner' }],
    portfolioCompanies: ['SafeAI Co'],
    recentInvestments: [{ company: 'SafeAI Co', date: '2025-12', stage: 'seed' }],
    checkSizeMin: 100000,
    checkSizeMax: 2000000,
    relevanceScore: 85
  }
}
```

### MunicipalEntity

```typescript
{
  id: 'municipal-xyz789',
  type: 'municipal',
  name: 'Municipalidad de San José',
  email: 'info@msj.go.cr',
  website: 'https://www.munisanjose.go.cr',
  location: { city: 'San José', state: 'San José', country: 'Costa Rica', region: 'Central Valley' },
  status: 'personalized',
  draftStatus: 'Approved',
  typeData: {
    governmentType: 'city',
    population: 288054,
    budget: 150000000,
    province: 'San José',
    trAigaRelevant: true,
    departments: [{ name: 'Tecnología', focus: ['digital transformation'] }],
    keyContacts: [{ name: 'Diego Miranda', title: 'Alcalde', isDecisionMaker: true }],
    initiatives: [{ name: 'Transformación Digital', description: 'Modernización', status: 'active' }],
    painPoints: ['AI accountability', 'Digital transformation', 'Coordination']
  }
}
```

## CRITICAL: Contact Fallback Strategy (No Direct Email Available)

### The Problem

Some VC firms have no publicly discoverable partner emails. Generic addresses like `info@firm.com` or `contact@firm.com` don't reach decision-makers directly, and 3rd-party email lookup services (Hunter, Apollo, ZoomInfo) require paid subscriptions we don't currently have.

### The Fallback Chain

When no direct partner email is found, the pipeline follows this priority chain:

```
1. DIRECT EMAIL     → Partner's personal/work email (ideal)
2. GENERIC EMAIL     → info@ / contact@ with partner name in subject (acceptable)
3. CONTACT FORM      → Browser automation fills website form (fallback)
4. LINKEDIN MESSAGE  → Direct message to target partner (fallback)
5. MANUAL OUTREACH   → Step-by-step instructions for human (last resort)
```

### Stage 3: Contact Form Fill (Browser Automation)

**When:** VC website has a contact/inquiry form and browser automation is available.

**Process:**
1. Navigate to VC website's contact page (from `entity.website`)
2. Use `browser` tool with `profile="openclaw"` to fill the form
3. Fields to populate:
   - **Name:** Tania Lea (or configured sender)
   - **Email:** outreach@alyygn.com (or alyyygn@gmail.com for staging)
   - **Company:** ALYGN - Independent AI Governance Institution
   - **Subject/Topic:** "AI Governance Coordination" or "Investment Inquiry"
   - **Message:** Use the same personalized content from `generateEmailHTML()` but formatted as plain text (strip HTML tags)
4. Submit the form
5. Log the submission in Notion:
   - Set `Status` = "Contacted"
   - Set `Notes` = "Contacted via website form on [date]. Form URL: [url]"
   - Set `Draft Status` = "Sent"

**Browser automation example:**
```bash
# Navigate to contact page
browser --profile=openclaw --action=navigate --url="https://firm.com/contact"

# Snapshot to find form fields
browser --profile=openclaw --action=snapshot

# Fill form fields
browser --profile=openclaw --action=act --kind=fill --ref="name-field" --text="Tania Lea"
browser --profile=openclaw --action=act --kind=fill --ref="email-field" --text="outreach@alyygn.com"
browser --profile=openclaw --action=act --kind=fill --ref="message-field" --text="[personalized plain text message]"

# Submit
browser --profile=openclaw --action=act --kind=click --ref="submit-button"
```

**Important notes:**
- Some forms have CAPTCHA — browser automation cannot solve these. Fall through to Stage 4 or 5.
- Some forms have dropdowns ("What is your inquiry about?") — select "Investment" or "Partnership" or closest match.
- Always snapshot before filling to identify exact field names/refs.
- If form submission fails, log the error and fall through to Stage 4.

### Stage 4: LinkedIn Direct Message

**When:** Browser automation unavailable, form has CAPTCHA, or form submission failed.

**Target identification:**
1. Use `entity.typeData.partners` to identify the best contact (see `getPrimaryPartner()` on VCEntity)
2. Search LinkedIn by name + firm: `web_search("{partner_name} {firm_name} LinkedIn")`
3. Use `entity.typeData.linkedInUrl` if already available

**Message template (LinkedIn DM):**
```
Hi {firstName},

I'm reaching out from ALYGN, an independent AI governance institution. 
We focus on making accountability, oversight, and coordination workable 
for advanced AI systems at global scale.

{tailoredHook - why this firm is relevant}

Would you be open to a brief conversation about how governance 
infrastructure can support {firmName}'s work in this space?

Best,
Tania Lea
ALYGN - Independent AI Governance Institution
```

**LinkedIn outreach steps (manual or browser-assisted):**
1. Navigate to partner's LinkedIn profile
2. Click "Message" or "Connect" (with note)
3. If connecting: Use a shorter note (300 char limit):
   `Hi {firstName}, I'm with ALYGN (AI governance institution). Would love to discuss how governance infrastructure can support {firmName}'s AI safety focus. Open to a brief call?`
4. If messaging: Use the full template above
5. Log in Notion:
   - Set `Status` = "Contacted"
   - Set `Notes` = "Contacted via LinkedIn DM to {partner_name} on [date]"
   - Set `Draft Status` = "Sent"

### Stage 5: Manual Outreach Instructions

**When:** All automation fails (CAPTCHA, LinkedIn login required, browser unavailable).

**Output format for human (post to Discord #annotations):**

```
📋 MANUAL OUTREACH NEEDED: {firm_name}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎯 Target: {partner_name}, {partner_title}
🔗 LinkedIn: {linkedin_url}
🌐 Website: {website_url}
📝 Contact Form: {website_url}/contact

📧 Option A — Contact Form:
1. Go to {website_url}/contact
2. Name: Tania Lea
3. Email: outreach@alyygn.com
4. Subject: AI Governance Coordination
5. Message: [copy personalized plain text below]

💬 Option B — LinkedIn:
1. Go to {linkedin_url}
2. Click "Message" or "Connect"
3. Use this message: [copy LinkedIn template above]

📝 Personalized Content:
{plain_text_message_from_template}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
After completing, update Notion:
- Status → "Contacted"
- Notes → "Contacted via [form/LinkedIn] on [date]"
- Draft Status → "Sent"
```

### Notion Tracking for Fallback Contacts

When outreach happens via contact form or LinkedIn (not email), track it differently:

| Field | Email | Contact Form | LinkedIn | Manual |
|-------|-------|-------------|----------|--------|
| `Status` | Sent | Contacted | Contacted | Not contacted |
| `Draft Status` | Sent | Sent | Sent | Not drafted |
| `Notes` | Email sent | "Form submitted [date]" | "LinkedIn DM [date]" | "Manual outreach needed" |
| `Email` | partner@firm.com | info@firm.com | N/A | N/A |

### VCEntity Extensions for Fallback

The `IVCTypeData` interface already supports:
- `linkedInUrl` — For LinkedIn outreach target
- `partners[]` — With `name`, `title`, `focus` for identifying the right contact

**New fields to add to `IVCTypeData`:**
```typescript
interface IVCTypeData {
  // ... existing fields ...
  contactFormUrl?: string | null;    // URL of the VC's contact form
  outreachMethod?: 'email' | 'form' | 'linkedin' | 'manual';  // How outreach was conducted
  outreachMethodReason?: string;     // Why this method was chosen (e.g., "No partner email found")
}
```

### Pipeline Integration

The `SendingStrategy.send()` method should be updated to:
1. If `entity.email` exists and is a direct partner email → send email (current behavior)
2. If `entity.email` is generic (`info@`, `contact@`, `hello@`) → check for contact form or LinkedIn
3. If `entity.email` is null → trigger fallback chain starting at Stage 3
4. Log the outreach method in `entity.typeData.outreachMethod`

The `VCResearchStrategy.research()` method should be updated to:
1. During research, check if the discovered email is generic
2. If generic, also search for: contact form URL, LinkedIn profiles of partners
3. Store `contactFormUrl` and partner `linkedInUrl` in entity typeData
4. Set `outreachMethodReason` = "Generic email only - partner email not publicly available"

---

## CRITICAL: Draft-to-Send Connection (Two-Filter System)

### The Problem This Solves
Without explicit connection, drafts created for VCs A, B, C → Script sends to VCs X, Y, Z (mismatch).

### The Solution: Two-Filter System

**Filter 1: Draft Status**
- Notion property: `Draft Status` (Not drafted | Drafted | Approved | Rejected | Sent)
- Only VCs with status matching `--draft-status` parameter pass

**Filter 2: Explicit Send List**
- Parameter: `--email-send-to=vc_id_1,vc_id_2,vc_id_3`
- Only VCs with IDs in this list pass

**Both filters must pass for email to be sent.**

### Workflow Steps

1. **Generate Drafts**
   ```bash
   bun bin/alygn-outreach.ts --type=vc --action=personalize --limit=3
   ```
   - Creates personalized content
   - Sets Notion: Draft Status = "Drafted"

2. **Human Review**
   - Review drafts in Notion
   - Approve: Draft Status = "Approved"

3. **Send with Both Filters**
   ```bash
   bun bin/alygn-outreach.ts --type=vc --action=send \
     --draft-status=Approved \
     --email-send-to=entity-mmxx7okp-1jojna,entity-mmxx7okp-92p5q9
   ```

## Notion Schema

| Property | Type | Values | Description |
|----------|------|--------|-------------|
| `Draft Status` | Select | Not drafted, Drafted, Approved, Rejected, Sent | Tracks email draft approval workflow |
| `Status` | Select | discovered, validated, researched, personalized, sent | Pipeline stage tracking |
| `Email` | Email | - | Validated email address |
| `Type` | Select | vc, municipal | Entity type |

## Configuration

### Environment Variables

```bash
# For ZeroBounce validator
export ZEROBOUNCE_API_KEY=xxx

# For SMTP sending
export SMTP_SERVER=smtp.gmail.com
export SMTP_PORT=587
export SMTP_USER=user@gmail.com
export SMTP_PASS=password

# For Smartlead sending
export SMARTLEAD_API_KEY=xxx
```

### Programmatic Config

```typescript
const config = {
  discovery: {
    searchQueries: ['custom query']
  },
  validation: {
    validatorType: 'zerobounce'
  },
  sending: {
    providerType: 'smartlead',
    providerConfig: { apiKey: 'xxx' },
    fromEmail: 'andrew@alygn.com',
    testEmail: 'test@example.com'
  }
};

const pipeline = new Pipeline('vc', config);
```

## Testing

```bash
# Test VC Discovery
bun bin/alygn-outreach.ts --type=vc --action=discover --limit=3 --dry-run

# Test Municipal Discovery (Costa Rica)
bun bin/alygn-outreach.ts --type=municipal --region=costa-rica --action=discover --limit=3 --dry-run

# Test Full Pipeline
bun bin/alygn-outreach.ts --type=vc --action=pipeline --limit=1 --dry-run

# Test with custom validator
bun bin/alygn-outreach.ts --type=vc --action=validate --validator=zerobounce --limit=5
```

## Troubleshooting

### Emails sent but not personalized
**Cause:** Two-filter system not used
**Fix:** Use both `--draft-status` and `--email-send-to` together

### Drafts not connecting to sends
**Cause:** Entity IDs in send command don't match drafted VCs
**Fix:** Copy IDs exactly as they appear in Notion

### Send returns "No entities found"
**Cause:** Filters too restrictive
**Fix:** Check Notion for correct `Draft Status` values

### TypeScript import errors
**Cause:** Missing .js extension in imports
**Fix:** All imports must use `.js` extension (e.g., `import { Pipeline } from './Pipeline'`)

### Supabase types not found
**Cause:** Generated types file missing
**Fix:** Run `supabase gen types typescript` in `scripts/alygn/muni-outreach/supabase/`

## Migration Notes

This skill replaces:
- `/scripts/alygn/vc-outreach/core/automated-vc-discovery.js`
- `/scripts/alygn/muni-outreach/*`

JS backups are preserved as `.js.bak` files for reference.

## License

Private - ALYGN R&D
