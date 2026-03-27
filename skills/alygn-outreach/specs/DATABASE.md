# Database Integration Specification — Alygn Outreach Skill

## Overview

The Alygn Outreach Skill persists data to **Supabase** (PostgreSQL) for long-term storage and uses **Notion** for draft collaboration. This document covers the schema mapping, type generation, query patterns, and migration strategy.

> **Self-containment note:** Supabase types are defined inline in `src/entities/types.ts` using Supabase's generated `Tables<>` helper types. This avoids importing from external script directories. The schema described here matches the actual implementation.

---

## Supabase Schema Mapping

### Table: `municipalities`

Primary storage for municipal/government entities.

| Skill Field | Supabase Column | Type | Notes |
|---|---|---|---|
| `entity.name` | `name` | `text` | NOT NULL |
| `entity.location.country` | `country` | `text` | Default `'Costa Rica'` |
| `municipalityId` | `id` | `uuid` | Supabase primary key |
| `entity.website` | `website_url` | `text` | Nullable |
| `entity.phone` | `phone` | `text` | Nullable |
| `entity.email` | `general_email` | `text` | Nullable |
| `entity.location.region` | `region` | `text` | Nullable |
| `typeData.province` | `province` | `text` | e.g. `'San José'`, `'Alajuela'` |
| `typeData.population` | `population` | `bigint` | Nullable |
| `typeData.governmentType` | `government_type` | `text` | `'city'` \| `'county'` \| `'state'` |
| `typeData.keyContacts[0].name` | `mayor_name` | `text` | Nullable |
| `entity.email` | `mayor_email` | `text` | Nullable |
| `typeData.keyContacts` | `council_emails` | `jsonb` | Nullable |
| `typeData.painPoints` | `pain_points` | `text[]` | Array of strings |
| `typeData.aiGovernanceSignals` | `ai_governance_signals` | `jsonb` | Nullable |
| `verifiedAt` | `verified_at` | `timestamptz` | Nullable |
| `researchedAt` | `researched_at` | `timestamptz` | Nullable |
| `outreachSentAt` | `outreach_sent_at` | `timestamptz` | Nullable |
| `outreachVariant` | `outreach_variant` | `text` | Nullable (e.g. `'trAiga'`) |
| `repliedAt` | `replied_at` | `timestamptz` | Nullable |
| `replySentiment` | `reply_sentiment` | `text` | Nullable |
| `waveNumber` | `wave_number` | `integer` | Nullable |
| `waveDate` | `wave_date` | `date` | Nullable |
| `batchStatus` | `batch_status` | `text` | Nullable |
| `xHandle` | `x_handle` | `text` | Nullable |
| `xUrl` | `x_url` | `text` | Nullable |
| `xWarmupPhase1At` | `x_warmup_phase1_at` | `timestamptz` | Nullable |
| `xWarmupPhase2At` | `x_warmup_phase2_at` | `timestamptz` | Nullable |
| `xEngagementCount` | `x_engagement_count` | `integer` | Nullable |
| `xLastEngagementAt` | `x_last_engagement_at` | `timestamptz` | Nullable |
| `entity.priority` | `priority_score` | `integer` | Computed: high=100, medium=50, low=25 |
| `entity.discoveredAt` | `discovered_at` | `timestamptz` | NOT NULL |
| `entity.lastUpdatedAt` | `updated_at` | `timestamptz` | Auto-updated |

### Table: `local_governments`

Links to municipalities and stores government-level details.

| Skill Field | Supabase Column | Type | Notes |
|---|---|---|---|
| `localGovernmentId` | `id` | `uuid` | Primary key |
| `municipalityId` | `municipality_id` | `uuid` | FK → `municipalities.id` |
| `entity.name` | `name` | `text` | NOT NULL |
| `typeData.governmentType` | `government_type` | `text` | NOT NULL |
| `entity.email` | `email` | `text` | Nullable |
| `entity.phone` | `phone` | `text` | Nullable |
| `entity.website` | `website_url` | `text` | Nullable |
| `typeData.keyContacts[0].name` | `head_name` | `text` | Nullable |
| `typeData.keyContacts[0].title` | `head_title` | `text` | Nullable |
| `entity.location.city` | `city` | `text` | Nullable |
| `typeData.province` | `province` | `text` | Nullable |
| `entity.location.country` | `country` | `text` | Default `'Costa Rica'` |
| `waveNumber` | `wave_number` | `integer` | Nullable |
| `is_active` | `is_active` | `boolean` | Default `true` |
| `entity.lastUpdatedAt` | `updated_at` | `timestamptz` | Auto-updated |

### Table: `political_figures`

Stores VC entities (tracked as political figures with `is_decision_maker=true`).

| Skill Field | Supabase Column | Type | Notes |
|---|---|---|---|
| `entity.name` | `full_name` | `text` | NOT NULL |
| `entity.email` | `email` | `text` | Nullable |
| `entity.phone` | `phone` | `text` | Nullable |
| `typeData.firmType` | `title` | `text` | e.g. `'vc'`, `'angel'` |
| `typeData.sectorFocus` | `department` | `text` | Comma-joined |
| `typeData.stageFocus` | `role_description` | `text` | Comma-joined |
| `typeData.sectorFocus` | `ai_governance_interest` | `text` | Comma-joined |
| — | `is_decision_maker` | `boolean` | Always `true` for VCs |
| — | `influence_level` | `integer` | Always `5` for VCs |
| `entity.sentAt` | `last_contacted_at` | `timestamptz` | Nullable |
| `entity.discoveredAt` | `created_at` | `timestamptz` | NOT NULL |
| `entity.lastUpdatedAt` | `updated_at` | `timestamptz` | Auto-updated |

### Table: `outreach_emails`

Stores sent/personalized email records.

| Skill Field | Supabase Column | Type | Notes |
|---|---|---|---|
| `emailData.subject` | `subject` | `text` | NOT NULL |
| `emailData.body` | `body` | `text` | NOT NULL |
| `emailData.recipientEmail` | `recipient_email` | `text` | NOT NULL |
| `emailData.recipientName` | `recipient_name` | `text` | NOT NULL |
| `localGovernmentId` | `local_government_id` | `uuid` | FK → `local_governments` |
| `municipalityId` | `municipality_id` | `uuid` | FK → `municipalities` |
| `outreachVariant` | `variant` | `text` | e.g. `'trAiga'` |
| `waveNumber` | `wave_number` | `integer` | Nullable |
| `waveDate` | `wave_date` | `date` | Nullable |
| `entity.personalizationContext` | `political_context` | `jsonb` | Nullable |
| — | `status` | `text` | `'draft'` \| `'sent'` |

### Table: `outreach_templates`

Stores reusable email templates.

| Supabase Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | Primary key |
| `name` | `text` | NOT NULL |
| `variant` | `text` | e.g. `'trAiga'`, `'vc-cold'` |
| `subject_template` | `text` | Email subject with placeholders |
| `body_template` | `text` | Email body with placeholders |
| `entity_type` | `text` | `'vc'` \| `'municipal'` |
| `created_at` | `timestamptz` | NOT NULL |

### Table: `x_engagements`

Tracks X/Twitter engagement for warmup.

| Supabase Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | Primary key |
| `municipality_id` | `uuid` | FK → `municipalities` |
| `x_handle` | `text` | NOT NULL |
| `engagement_type` | `text` | `'like'` \| `'retweet'` \| `'reply'` |
| `engaged_at` | `timestamptz` | NOT NULL |
| `notes` | `text` | Nullable |

### Table: `checkpoints`

Pipeline checkpoint state for resumable runs.

| Supabase Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | Primary key |
| `entity_id` | `uuid` | NOT NULL |
| `entity_type` | `text` | `'vc'` \| `'municipal'` |
| `last_stage` | `text` | Last completed stage |
| `stage_results` | `jsonb` | Per-stage result data |
| `updated_at` | `timestamptz` | Auto-updated |

---

## Type Generation from Schema

Supabase types are generated using the `supabase` JS client and the `Tables<>` helper type. In the skill's `src/entities/types.ts`, types are declared inline to maintain self-containment:

```typescript
// Inline Supabase-generated table type helpers
type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
type TablesInsert<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert'];
type TablesUpdate<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update'];

// For self-containment, the actual Database type is stubbed:
interface Database {
  public: {
    Tables: {
      municipalities: { Row: MunicipalityRow; Insert: MunicipalityInsert; Update: MunicipalityUpdate };
      local_governments: { Row: LocalGovernmentRow; Insert: LocalGovernmentInsert; Update: LocalGovernmentUpdate };
      political_figures: { Row: PoliticalFigureRow; Insert: PoliticalFigureInsert; Update: PoliticalFigureUpdate };
      outreach_emails: { Row: OutreachEmailRow; Insert: OutreachEmailInsert; Update: OutreachEmailUpdate };
      outreach_templates: { Row: OutreachTemplateRow; Insert: OutreachTemplateInsert; Update: OutreachTemplateUpdate };
      x_engagements: { Row: XEngagementRow; Insert: XEngagementInsert; Update: XEngagementUpdate };
      checkpoints: { Row: CheckpointRow; Insert: CheckpointInsert; Update: CheckpointUpdate };
    };
  };
}

// Row types (abbreviated)
export type MunicipalityRow = {
  id: string;
  name: string;
  country: string | null;
  website_url: string | null;
  phone: string | null;
  email: string | null;
  region: string | null;
  province: string | null;
  population: number | null;
  government_type: string | null;
  mayor_name: string | null;
  mayor_email: string | null;
  pain_points: string[] | null;
  ai_governance_signals: Record<string, unknown> | null;
  verified_at: string | null;
  researched_at: string | null;
  outreach_sent_at: string | null;
  outreach_variant: string | null;
  replied_at: string | null;
  reply_sentiment: string | null;
  wave_number: number | null;
  wave_date: string | null;
  batch_status: string | null;
  x_handle: string | null;
  x_url: string | null;
  x_warmup_phase1_at: string | null;
  x_warmup_phase2_at: string | null;
  x_engagement_count: number | null;
  x_last_engagement_at: string | null;
  priority_score: number | null;
  discovered_at: string;
  updated_at: string;
};
```

---

## Query Patterns

### Upsert Municipality

```typescript
const { data, error } = await supabase
  .from('municipalities')
  .upsert(
    {
      id: entity.municipalityId,
      name: entity.name,
      country: entity.location.country || 'Costa Rica',
      website_url: entity.website,
      phone: entity.phone,
      general_email: entity.email,
      region: entity.location.region,
      province: entity.typeData.province,
      population: entity.typeData.population,
      government_type: entity.typeData.governmentType,
      pain_points: entity.typeData.painPoints,
      wave_number: entity.waveNumber,
      wave_date: entity.waveDate,
      batch_status: entity.batchStatus,
      priority_score: entity.priority === 'high' ? 100 : entity.priority === 'medium' ? 50 : 25,
      discovered_at: entity.discoveredAt.toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  )
  .select()
  .single();
```

### Fetch Municipalities by Wave

```typescript
const { data, error } = await supabase
  .from('municipalities')
  .select('*')
  .eq('wave_number', waveNumber)
  .eq('batch_status', 'ready')
  .order('priority_score', { ascending: false })
  .limit(limit);
```

### Fetch Municipalities Needing Outreach

```typescript
const { data, error } = await supabase
  .from('municipalities')
  .select('*')
  .is('outreach_sent_at', null)          // Not yet sent
  .not('email', 'is', null)             // Has email
  .gte('priority_score', 50)             // Medium or high priority
  .order('priority_score', { ascending: false })
  .limit(limit);
```

### Fetch VC by Email (deduplication)

```typescript
const { data, error } = await supabase
  .from('political_figures')
  .select('*')
  .eq('email', entity.email)
  .eq('is_decision_maker', true)
  .limit(1);
```

### Insert Outreach Email Record

```typescript
const { data, error } = await supabase
  .from('outreach_emails')
  .insert({
    subject,
    body,
    recipient_email,
    recipient_name,
    municipality_id,
    local_government_id,
    variant: entity.outreachVariant,
    wave_number: entity.waveNumber,
    wave_date: entity.waveDate,
    status: 'sent',
    political_context: entity.personalizationContext,
  })
  .select()
  .single();
```

### Fetch Checkpoint (resume support)

```typescript
const { data, error } = await supabase
  .from('checkpoints')
  .select('*')
  .eq('entity_id', entity.id)
  .order('updated_at', { ascending: false })
  .limit(1);
```

### Upsert Checkpoint

```typescript
const { data, error } = await supabase
  .from('checkpoints')
  .upsert(
    {
      entity_id: entity.id,
      entity_type: entity.type,
      last_stage: stage,
      stage_results: stageResults,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'entity_id' }
  );
```

---

## Migration Strategy

### Version 1 → 2 (Future: Separate `vc_outreach` Table)

If VCs outgrow `political_figures`, a dedicated `vc_outreach` table will be introduced:

```sql
CREATE TABLE vc_outreach (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT,
  website_url TEXT,
  firm_type TEXT,             -- 'vc' | 'angel' | 'corporate' | 'accelerator'
  stage_focus TEXT[],
  sector_focus TEXT[],
  check_size_min NUMERIC,
  check_size_max NUMERIC,
  aum BIGINT,
  partners JSONB,
  portfolio_companies TEXT[],
  recent_investments JSONB,
  linkedin_url TEXT,
  crunchbase_url TEXT,
  relevance_score NUMERIC,
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add FK for outreach_emails linking to vc_outreach
ALTER TABLE outreach_emails
  ADD COLUMN vc_outreach_id UUID REFERENCES vc_outreach(id);
```

### Adding New Columns

1. Add column to Supabase (via Supabase dashboard or migration file)
2. Update `MunicipalityRow` / `PoliticalFigureRow` type in `src/entities/types.ts`
3. Update mapper functions in `src/entities/supabase-mappers.ts`
4. No changes to strategy or pipeline code needed

### Schema Drift Prevention

- Mapper functions (`toMunicipalityInsert`, etc.) are the **single source of truth** for column mapping
- Tests verify round-trip: `entity.toJSON()` → mapper → `fromJSON()` produces equivalent object
- Supabase types are regenerated from the live schema via `supabase gen types typescript` and copied into `types.ts`
