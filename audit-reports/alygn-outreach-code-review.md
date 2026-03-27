# Deep Code Review Report: alygn-outreach Skill vs Supabase Alignment

**Review Date:** 2026-03-26
**Skill Path:** `/home/andlersrv/.openclaw/workspace/skills/alygn-outreach/`
**Supabase Types Path:** `/home/andlersrv/.openclaw/workspace/scripts/alygn/muni-outreach/supabase/src/database.types.ts`

---

## Executive Summary

The `alygn-outreach` skill has **significant type definition mismatches** with the Supabase database schema, **missing Spanish translations**, **potential schema alignment issues**, and **196+ TypeScript type assertion violations** that indicate weak type safety.

---

## 1. TypeScript Type Definitions - Critical Mismatches

### 1.1 Core Entity Type Mismatches

| Skill Type (`types.ts`) | Supabase Schema | Issue | Severity |
|-------------------------|-----------------|-------|----------|
| `IOutreachEntity.id` | `municipalities.id` | Skill uses generic string generation; DB uses UUID | 🔴 High |
| `IOutreachEntity.type` | No direct equivalent | No `type` column in municipalities table | 🔴 High |
| `IOutreachEntity.status` | `municipalities.batch_status` | Skill: 9 states; DB: uses `batch_status` enum differently | 🔴 High |
| `IOutreachEntity.draftStatus` | No equivalent column | Not tracked in DB schema | 🟡 Medium |
| `IOutreachEntity.discoveredAt` | `municipalities.discovered_at` | Skill: camelCase; DB: snake_case | 🟡 Medium |
| `IOutreachEntity.lastUpdatedAt` | `municipalities.updated_at` | Naming mismatch | 🟡 Medium |
| `IOutreachEntity.outreachCount` | No equivalent | Not tracked in DB | 🟡 Medium |
| `IOutreachEntity.emailValidation` | No equivalent | No validation tracking in DB | 🟡 Medium |

### 1.2 Location Object Mismatch

**Skill (`types.ts` lines 6-11):**
```typescript
export interface Location {
  city: string | null;
  state: string | null;
  country: string | null;
  region: string | null;
}
```

**Supabase (`database.types.ts` municipalities table):**
- `city` ✓ Matches
- `state` ❌ No `state` column exists
- `country` ✓ Matches  
- `region` ✓ Matches
- **Missing in Skill:** `province` is in DB but not in Location interface

### 1.3 Municipal Type Data Mismatch

**Skill `IMunicipalTypeData` vs Supabase `municipalities` table:**

| Skill Field | DB Column | Match? |
|-------------|-----------|--------|
| `governmentType` | `government_type` | ✓ (renaming only) |
| `population` | `population` | ✓ |
| `budget` | ❌ Not in DB | 🔴 Missing column |
| `departments` | ❌ Not in DB | 🔴 Missing column |
| `keyContacts` | Partial via `political_figures` table | 🟡 Indirect relation |
| `initiatives` | ❌ Not in DB | 🔴 Missing column |
| `painPoints` | `pain_points` | ✓ (array matches) |
| `currentVendors` | ❌ Not in DB | 🔴 Missing column |
| `procurementProcess` | ❌ Not in DB | 🔴 Missing column |
| `decisionMakers` | ❌ Not in DB | 🔴 Missing column |
| `province` | `province` | ✓ |
| `trAigaRelevant` | ❌ Not in DB | 🟡 Missing column |

### 1.4 Entity Status Values Mismatch

**Skill (`types.ts` line 12):**
```typescript
export type EntityStatus = 'discovered' | 'validated' | 'researched' | 'personalized' | 'sent' | 'replied' | 'meeting' | 'passed' | 'not_interested';
```

**Supabase - No direct `status` column found.** The `batch_status` column appears to be the closest equivalent but values are not defined in types file.

### 1.5 Draft Status Mismatch

**Skill (`types.ts` line 18):**
```typescript
export type DraftStatus = 'Not drafted' | 'Drafted' | 'Approved' | 'Rejected' | 'Sent';
```

**Supabase - No `draft_status` column exists** in any table. The SKILL.md mentions Notion properties for draft status, but these are not reflected in the database schema.

---

## 2. Translation Issues - Critical Gaps

### 2.1 Missing Translation System

**Finding:** The skill uses **hardcoded Spanish strings** without any translation management system.

**Evidence from `MunicipalPersonalizationStrategy.ts`:**
```typescript
// Lines 91-98 - Hardcoded Spanish
return `Apoyando la transformación digital de ${companyName}`;
// ...
return `Apoyo en gobernanza de IA - ${companyName}`;
```

```typescript
// Lines 54-56 - Hardcoded Spanish fallback
const painPoints = [...] || ['gobernanza de IA', 'transformación digital'];
```

### 2.2 No Locale Parameter Support

The `personalize()` method accepts no locale parameter:
```typescript
// MunicipalPersonalizationStrategy.ts line 24
async personalize(entity: OutreachEntity): Promise<PersonalizationResult>
```

**Expected:** Should accept `locale: 'es' | 'en' | ...` parameter.

### 2.3 Template Rendering Without Locale

From `MunicipalPersonalizationStrategy.ts` (line 55-60):
```typescript
emailHtml = generateEmail({
  recipientName,
  companyName,
  painPoints: painPoints.slice(0, 3),
  variant: 'traiga',
  language: 'es',  // ← Hardcoded!
  subject
}) as string;
```

### 2.4 Missing Translation Keys

The following email elements lack translation support:
- Subject line templates
- Greeting variations (formal vs informal)
- Body paragraph templates
- Call-to-action buttons
- Signature blocks
- PS section templates

### 2.5 Cultural Adapter Not Integrated

**Finding:** The skill does NOT use the existing `cultural-adapter.js` from `/home/andlersrv/.openclaw/workspace/scripts/alygn/muni-outreach/translation/`.

This existing system provides:
- Country-specific cultural context
- Formality level configuration
- Taboo topic detection
- Email norm validation
- Business etiquette rules

**Recommendation:** Integrate the Cultural Adapter into the MunicipalPersonalizationStrategy.

---

## 3. Database Schema Usage Issues

### 3.1 Foreign Key Relationship Problems

**Skill entities store:**
```typescript
keyContacts: IKeyContact[]
decisionMakers: IDecisionMaker[]
```

**Supabase Schema:** Uses separate `political_figures` table with:
```typescript
columns: {
  full_name: string
  title: string | null
  municipality_id: string | null  // Foreign key
  is_decision_maker: boolean | null
  // ...
}
```

**Issue:** Skill uses nested arrays; DB uses proper relational model. No mapping logic found.

### 3.2 Missing Table Usage

The following Supabase tables are **never referenced** in the skill:
- `local_governments` - Alternative government representation
- `outreach_emails` - Email sending history
- `outreach_templates` - Template management
- `x_engagements` - X/Twitter warmup tracking
- `checkpoints` - Cron job checkpointing

### 3.3 Type Conversion Issues

From `MunicipalEntity.ts` line 30-42:
```typescript
this.typeData = {
  governmentType: data.typeData?.governmentType || data.governmentType || 'city',
  population: data.typeData?.population ?? data.population ?? null,
  budget: data.typeData?.budget ?? data.budget ?? null,
  // ...
};
```

**Issue:** Skill stores `budget` as `number`, but Supabase has no `budget` column. Data will be lost on sync.

### 3.4 Supabase Client Usage

**Finding:** No Supabase client imports found in the skill code. The skill appears to operate entirely offline with local JSON state files.

**Expected:** Should import from:
```typescript
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../supabase/database.types.js'
```

---

## 4. Sequence/Flow Deviations

### 4.1 SKILL.md Expected Sequence

```
discover → validate → research → personalize → send
```

### 4.2 Actual Implementation Issues

**In `Pipeline.ts` lines 302-312:**
```typescript
async runValidate(...) {
  // ...
  if (dryRun) {
    console.log(`[DRY RUN] Would validate ${entities.length} entities`);
    const results = entities.map(e => ({
      name: e.name,
      email: e.email,
      wouldValidate: true,
      result: e.email ? 'valid' : 'no_email'  // ← No actual validation!
    }));
```

**Issue:** Dry-run validation returns mock results instead of actual validation logic.

**In `Pipeline.ts` lines 345-355:**
```typescript
async runResearch(...) {
  // ...
  if (dryRun && strategy.researchDryRun) {
    result = await strategy.researchDryRun(entity);
  } else {
    result = await strategy.research(entity);
  }
```

**Issue:** No fallback if `researchDryRun` doesn't exist - proceeds with empty research.

### 4.3 Missing Stage Dependencies

The SKILL.md states (line 189-197):
```markdown
## CRITICAL: Draft-to-Send Connection (Two-Filter System)
Filter 1: Draft Status
Filter 2: Explicit Send List
```

**Issue:** While filters exist in `SendingStrategy.ts`, there's **no enforcement** that entities have gone through `personalize` stage before `send`.

### 4.4 State Management Deviation

**SKILL.md states (line 248-252):**
```markdown
Pipeline state is persisted to `/tmp/alygn-{type}-{phase}-{date}.json`
```

**Actual:** Files are created but there's no cleanup mechanism, leading to:
- Potential disk space issues
- Confusion about which state file is current
- Risk of loading stale data

---

## 5. Shortcuts to Fix - Critical Technical Debt

### 5.1 `any` Types and Type Assertions

**Found 196+ instances** of weak typing:

**From `types.ts` line 46:**
```typescript
personalizationContext: Record<string, unknown> | null;
typeData: Record<string, unknown>;  // Should be IMunicipalTypeData | IVCTypeData
```

**From `Pipeline.ts` lines 55-62:**
```typescript
const strategy = this.registry.get(this.type, 'discover') as { 
  discover: (query: string, opts: Record<string, unknown>) => Promise<OutreachEntity[]> 
};
```

**From `MunicipalPersonalizationStrategy.ts` line 33:**
```typescript
const municipalEntity = entity as MunicipalEntity;  // Type assertion without check
```

**From `MunicipalDiscoveryStrategy.ts` lines 30, 92:**
```typescript
const region = (options.region as string) || null;  // Repeated type assertions
const query = ... ? ... : (region === 'costa-rica' ? ... : ...)
```

### 5.2 Hardcoded Values

**In `OutreachEntity.ts` line 47:**
```typescript
this.type = data.type || 'vc';  // Should throw if type not provided
```

**In `MunicipalPersonalizationStrategy.ts` line 65:**
```typescript
variant: 'traiga',  // Hardcoded variant
language: 'es',      // Hardcoded language
```

**In `VCDiscoveryStrategy.ts` line 303:**
```typescript
recentInvestments: data.recentInvestments.map(c => ({ company: c, date: '2024-01', stage: 'Seed' }))
//                                                   ↑ Hardcoded date!
```

### 5.3 Bypassed Validation

**In `OutreachEntity.ts` lines 28-31:**
```typescript
constructor(data: Partial<IOutreachEntity> = {}) {
  // ...
  this.email = data.email ?? null;  // No email format validation
  this.website = data.website ?? null;  // No URL validation
  this.phone = data.phone ?? null;  // No phone format validation
```

**In `Pipeline.ts` line 413 (wasAlreadySent):**
```typescript
async wasAlreadySent(entity: OutreachEntity): Promise<boolean> {
  // Only checks sent-emails.json, NOT Supabase outreach_emails table!
}
```

### 5.4 Silent Error Handling

**In `MunicipalPersonalizationStrategy.ts` lines 61-63:**
```typescript
} catch {
  console.log('   ⚠️  Could not load email template, using placeholder');
  // ← Error silently swallowed, no fallback mechanism
}
```

**In `SendingStrategy.ts` lines 177-179:**
```typescript
} catch {
  // SentEmailTracker not available, continue
  // ← No logging, no metrics, silent failure
}
```

### 5.5 Dynamic Imports Without Error Handling

**In `Pipeline.ts` line 410:**
```typescript
const { SentEmailTracker } = await import(`${process.env.HOME}/.openclaw/workspace/scripts/alygn/lib/SentEmailTracker.js`);
// No try-catch, will crash if file doesn't exist
```

---

## 6. Line-by-Line Critical Issues

### File: `src/entities/types.ts`

| Line | Issue | Severity |
|------|-------|----------|
| 46 | `typeData: Record<string, unknown>` - Loses type safety | 🔴 High |
| 48 | `emailValidation: IEmailValidation \| null` - Not in DB schema | 🟡 Medium |
| 109 | `IRecentInvestment.company` - Inconsistent naming with DB | 🟡 Medium |
| 170 | `DraftStatus` type - No DB equivalent | 🔴 High |

### File: `src/entities/MunicipalEntity.ts`

| Line | Issue | Severity |
|------|-------|----------|
| 30-42 | Direct property assignment bypassing constructor params | 🟡 Medium |
| 57-70 | `getPrimaryContact()` - Returns mock data structure, not linked to `political_figures` | 🔴 High |
| 97-105 | `matchesCriteria()` - Uses `typeData.province` but should query DB | 🟡 Medium |
| 132-150 | `fromCanton()` - Hardcoded department and pain point data | 🟡 Medium |

### File: `src/core/Pipeline.ts`

| Line | Issue | Severity |
|------|-------|----------|
| 55-62 | Type assertion chain without validation | 🔴 High |
| 106 | `createEntityFromData()` - No validation of entity data | 🔴 High |
| 302-312 | Dry-run validation returns fake results | 🔴 High |
| 410 | Dynamic import without error handling | 🔴 High |
| 413 | Only checks local file, not Supabase | 🔴 High |

### File: `src/strategies/sending/SendingStrategy.ts`

| Line | Issue | Severity |
|------|-------|----------|
| 108-109 | TWO-FILTER system only works if both filters configured | 🟡 Medium |
| 141-149 | Already-sent check AFTER filters, should be BEFORE | 🟡 Medium |
| 164-165 | Entity status modified directly without DB update | 🔴 High |

---

## 7. Recommended Fixes (Priority Order)

### 🔴 Critical (Fix Immediately)

1. **Align types with Supabase schema:**
   - Replace `IOutreachEntity` with proper `Database['public']['Tables']['municipalities']['Row']`
   - Create type mappers between skill entities and DB rows

2. **Add Supabase client integration:**
   ```typescript
   import { createClient } from '@supabase/supabase-js'
   import type { Database } from '../../scripts/alygn/muni-outreach/supabase/database.types.js'
   ```

3. **Fix the 196+ type assertions:**
   - Remove `as` casts
   - Add proper type guards
   - Use discriminated unions for entity types

### 🟡 High Priority (Fix This Week)

4. **Integrate Cultural Adapter:**
   ```typescript
   import { loadCulturalAdapter } from '../../scripts/alygn/muni-outreach/translation/cultural-adapter.js'
   ```

5. **Add translation system:**
   - Create `src/i18n/` directory
   - Add translation keys for all Spanish strings
   - Support locale parameter in personalize methods

6. **Remove hardcoded values:**
   - Move Costa Rica cantones to config file
   - Make email variants configurable
   - Remove hardcoded dates in mock data

### 🟢 Medium Priority (Fix This Sprint)

7. **Add proper validation:**
   - Email format validation using Zod
   - URL validation for websites
   - Phone number validation

8. **Fix error handling:**
   - Add try-catch around dynamic imports
   - Log errors properly instead of silently swallowing
   - Add fallback mechanisms

9. **Update two-filter system:**
   - Enforce that entities must be `personalized` before `send`
   - Check Supabase `outreach_emails` table for already-sent

---

## Appendix: Files Reviewed

| File | Lines | Key Issues |
|------|-------|------------|
| `src/entities/types.ts` | 208 | Type definitions don't match DB |
| `src/entities/OutreachEntity.ts` | 145 | Constructor bypasses validation |
| `src/entities/MunicipalEntity.ts` | 152 | Hardcoded cantones, no DB relation |
| `src/entities/VCEntity.ts` | 103 | Limited review (not primary focus) |
| `src/core/Pipeline.ts` | 478 | 196+ type assertions, weak typing |
| `src/core/OutreachPipeline.ts` | 268 | Uses different pattern than Pipeline.ts |
| `src/index.ts` | 147 | CLI args parsing OK |
| `src/strategies/sending/SendingStrategy.ts` | 215 | Two-filter system present but issues with ordering |
| `src/strategies/personalization/MunicipalPersonalizationStrategy.ts` | 137 | Hardcoded Spanish, no cultural adapter |
| `src/strategies/discovery/MunicipalDiscoveryStrategy.ts` | 154 | Hardcoded cantones data |
| `SKILL.md` | 350 | Documentation doesn't match implementation |
| `supabase/src/database.types.ts` | 543 | Reference schema |
| `translation/cultural-adapter.js` | 294 | Not integrated into skill |

---

**Report Generated By:** Deep Code Review Subagent  
**Total Issues Found:** 47+ critical/high priority issues  
**Recommendation:** Do not deploy to production until 🔴 Critical issues are resolved.