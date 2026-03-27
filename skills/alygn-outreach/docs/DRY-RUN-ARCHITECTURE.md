# Dry-Run Mode Redesign — Architecture Specification

## Status
**Version:** 1.0  
**Date:** 2026-03-26  
**Author:** Subagent (architect-dry-run-redesign)

---

## 1. Overview

The current `--dry-run` flag always returns mock data, ignoring the `USE_DIRECT_API` environment variable. This prevents realistic pre-production testing with real API data.

**Goal:** Two distinct dry-run modes that give developers and operators the right level of testing confidence.

---

## 2. Two Dry-Run Modes

| Mode | Flag | `USE_DIRECT_API` | API Calls | DB Writes | Speed | Use Case |
|------|------|-----------------|-----------|-----------|-------|----------|
| **A** | `--dry-run` | unset/false | ❌ None | ❌ None | ⚡ Fast | Local dev, fast iteration |
| **B** | `--dry-run` | `true` | ✅ Real | ⚠️ JSON files only | 🐢 Realistic | Pre-production, API validation |
| **Prod** | (none) | (any) | ✅ Real | ✅ Real | 🐢 Real | Live operations |

---

## 3. Directory Structure

```
data/dry-run/
├── notion/
│   ├── vc-{entityId}-{timestamp}.json
│   └── municipal-{entityId}-{timestamp}.json
├── supabase/
│   ├── municipalities-{timestamp}.json
│   ├── local_governments-{timestamp}.json
│   ├── outreach_emails-{timestamp}.json
│   └── political_figures-{timestamp}.json
└── reports/
    ├── dry-run-report-{timestamp}.md
    └── api-calls-{timestamp}.json
```

### Notes
- `data/dry-run/` replaces `data/supabase/` as the simulation root
- All simulation writes go here, never to real databases
- Reports directory mirrors the production `data/reports/` structure

---

## 4. Core Logic — Strategy Level

Each strategy (Discovery, Research, Validation, Personalization, Sending) adopts the same decision tree:

```typescript
// src/strategies/Strategy.ts (new base class method)
protected async executeWithDryRun<T>(
  options: { dryRun?: boolean },
  realApiCall: () => Promise<T>,
  mockData: T,
  simulationOptions?: {
    entityId?: string;
    entityType?: 'vc' | 'municipal';
    notionWrite?: object;
    supabaseWrite?: { table: string; data: object };
  }
): Promise<T> {
  const isDryRun = options.dryRun || false;
  const useDirectAPI = process.env.USE_DIRECT_API === 'true';

  if (isDryRun && !useDirectAPI) {
    // Mode A: Return mocks, no external calls
    console.log(`[Mode A DRY RUN] Using mock data`);
    return mockData;
  }

  if (isDryRun && useDirectAPI) {
    // Mode B: Call real APIs, simulate DB writes
    console.log(`[Mode B DRY RUN] Calling real APIs, simulating DB writes`);
    const results = await realApiCall();
    await this.simulateDatabaseWrites(simulationOptions);
    await this.sendDiscordReport({ results, mode: 'B', apiCalls: [/* tracked */] });
    return results;
  }

  // Production
  return await realApiCall();
}
```

This pattern is applied consistently across all strategies.

---

## 5. Database Simulation

### 5.1 Notion Simulation

Instead of calling `notion.pages.create()` or `notion.pages.update()`, write to:

```
data/dry-run/notion/{entityType}-{entityId}-{timestamp}.json
```

**File format** — matches Notion page response structure:

```json
{
  "object": "page",
  "id": "dry-run-{uuid}",
  "created_time": "2026-03-26T19:00:00.000Z",
  "last_edited_time": "2026-03-26T19:00:00.000Z",
  "properties": {
    "title": { "title": [{ "text": { "content": "VC Firm Name" } }] },
    "Status": { "select": { "name": "discovered" } },
    "Email": { "email": "contact@firm.com" }
  },
  "parent": { "page_id": "{parentPageId}" },
  "dryRun": true,
  "simulatedAt": "2026-03-26T19:00:00.000Z"
}
```

**Implementation:** Wrap `notion-client.ts` methods with a dry-run shim:

```typescript
// src/lib/external/notion-client-dryrun.ts
export async function createPageDryRun(parentPageId: string, properties: object): Promise<object> {
  const dryRunData = {
    object: 'page',
    id: `dry-run-${crypto.randomUUID()}`,
    created_time: new Date().toISOString(),
    properties,
    parent: { page_id: parentPageId },
    dryRun: true,
    simulatedAt: new Date().toISOString()
  };
  const timestamp = Date.now();
  const filename = `notion-page-${timestamp}.json`;
  const filepath = path.join(DRY_RUN_DIR, 'notion', filename);
  fs.writeFileSync(filepath, JSON.stringify(dryRunData, null, 2));
  console.log(`[NOTION DRY RUN] Would create page. Saved to ${filepath}`);
  return dryRunData;
}
```

### 5.2 Supabase Simulation

Instead of calling `supabase.from(table).upsert()`, write to:

```
data/dry-run/supabase/{table}-{timestamp}.json
```

**File format** — matches Supabase row types from `supabase-mappers.ts`:

```json
{
  "table": "municipalities",
  "operation": "upsert",
  "timestamp": "2026-03-26T19:00:00.000Z",
  "rows": [
    {
      "name": "Alajuela",
      "country": "Costa Rica",
      "province": "Alajuela",
      "population": 10000,
      "priority_score": 75,
      "discovered_at": "2026-03-26T18:00:00.000Z",
      "updated_at": "2026-03-26T19:00:00.000Z"
    }
  ],
  "dryRun": true,
  "simulatedAt": "2026-03-26T19:00:00.000Z"
}
```

**Implementation:** Wrap Supabase calls with a dry-run shim:

```typescript
// src/lib/supabase-dryrun.ts
export async function upsertDryRun(
  table: string,
  rows: object | object[]
): Promise<{ data: object[], error: null }> {
  const dryRunData = {
    table,
    operation: 'upsert',
    timestamp: new Date().toISOString(),
    rows: Array.isArray(rows) ? rows : [rows],
    dryRun: true,
    simulatedAt: new Date().toISOString()
  };
  const timestamp = Date.now();
  const filename = `${table}-${timestamp}.json`;
  const filepath = path.join(DRY_RUN_DIR, 'supabase', filename);
  fs.writeFileSync(filepath, JSON.stringify(dryRunData, null, 2));
  console.log(`[SUPABASE DRY RUN] Would upsert to ${table}. Saved to ${filepath}`);
  return { data: dryRunData.rows, error: null };
}
```

---

## 6. Changes Per Strategy

### 6.1 VCDiscoveryStrategy (`src/strategies/discovery/VCDiscoveryStrategy.ts`)

**Current logic:**
```typescript
if (dryRun) {
  return this.generateMockVCs(query, limit);  // Always returns mocks
}
```

**New logic:**
```typescript
const useDirectAPI = process.env.USE_DIRECT_API === 'true';
if (dryRun && !useDirectAPI) {
  return this.generateMockVCs(query, limit);  // Mode A
}
if (dryRun && useDirectAPI) {
  // Mode B: Call Perplexity, simulate DB
  const vcs = await this.discoverViaAPI(query, limit, cacheFile);
  for (const vc of vcs) {
    await this.simulateNotionWrite('vc', vc.id, vc.toNotionPage());
    await this.simulateSupabaseWrite('political_figures', vc.toSupabaseRow());
  }
  return vcs;
}
```

### 6.2 VCResearchStrategy (`src/strategies/research/VCResearchStrategy.ts`)

**Current logic:** `researchDryRun()` always generates mock data.  
**New logic:** Same pattern — Mode B calls `researchViaAPI()` and writes simulation files.

### 6.3 MunicipalDiscoveryStrategy

Same pattern for Costa Rica municipal discovery via GOB protocol.

### 6.4 OutreachPipeline (`src/core/OutreachPipeline.ts`)

The pipeline's `executeStage` and `discover` methods currently just log `[DRY RUN]`. These need to delegate to the strategy's dry-run logic:

```typescript
// In executeStage():
if (this.context.dryRun) {
  const strategy = this.getStrategy(stage);
  if (strategy && typeof strategy[stage] === 'function') {
    // Let strategy handle its own dry-run mode
    const result = await strategy[stage](entity, { dryRun: true, useDirectAPI });
    // ...
  }
  // existing logging fallback
}
```

---

## 7. Report Generation

For Mode B only, generate a comprehensive report and send to Discord `#annotations`.

### 7.1 Report Format (`data/dry-run/reports/dry-run-report-{timestamp}.md`)

```markdown
# Dry-Run Report — 2026-03-26T19:00:00Z

## Mode: B (--dry-run + USE_DIRECT_API=true)

## Execution Summary

| Metric | Count |
|--------|-------|
| Entities Discovered | 12 |
| Entities Validated | 10 |
| Entities Researched | 8 |
| Personalization Emails Drafted | 8 |
| API Calls Made | 15 |
| Simulated DB Writes | 23 |

## API Calls Made

| # | Endpoint | Purpose | Result |
|---|----------|---------|--------|
| 1 | Perplexity Sonar | VC Discovery (AI safety VCs) | 12 results |
| 2 | Perplexity Sonar | VC Research (Frontier Capital) | OK |
| 3 | Regex MX | Email Validation (3 addresses) | 3 valid |

## Simulated DB Writes

### Notion
| File | Entity | Page Title |
|------|--------|------------|
| notion-vc-abc123-1711482000000.json | VC | Frontier Capital |
| notion-vc-def456-1711482100000.json | VC | AI Safety Ventures |

### Supabase
| File | Table | Rows |
|------|-------|------|
| municipalities-1711482000000.json | municipalities | 3 |
| political_figures-1711482100000.json | political_figures | 2 |
| outreach_emails-1711482200000.json | outreach_emails | 2 |

## Entities Processed

### VCs
1. **Frontier Capital** (frontiercap.com)
   - Status: discovered → researched → personalized
   - Contact: investors@frontiercap.com
   - Research: thesis loaded, 3 portfolio companies found

2. **AI Safety Ventures** (aisafetyvc.com)
   - Status: discovered → researched → personalized
   - Contact: contact@aisafetyvc.com
   - Research: AI safety focus confirmed

## Next Steps (Production)
- Review Simulated DB Writes in `data/dry-run/`
- Verify data looks correct
- Run without --dry-run to execute for real
```

### 7.2 Discord Report Format

Send to `#annotations` with:

```json
{
  "embeds": [{
    "title": "🎯 Dry-Run Report — Mode B",
    "description": "Real API calls made, DB writes simulated",
    "color": 0x3498db,
    "fields": [
      { "name": "Entities", "value": "12 discovered, 8 researched", "inline": true },
      { "name": "API Calls", "value": "15 made", "inline": true },
      { "name": "Simulated DB Writes", "value": "23 (5 Notion, 18 Supabase)", "inline": true },
      { "name": "Report File", "value": "data/dry-run/reports/dry-run-report-1711482000000.md", "inline": false }
    ],
    "footer": { "text": "Set --dry-run only (no USE_DIRECT_API) for faster Mode A testing" }
  }]
}
```

---

## 8. Implementation Plan

### Phase 1: Core Infrastructure
1. Create `src/lib/dry-run/` directory
2. Create `src/lib/dry-run/DryRunSimulator.ts` — shared simulation logic
3. Create `src/lib/dry-run/NotionSimulator.ts` — Notion simulation
4. Create `src/lib/dry-run/SupabaseSimulator.ts` — Supabase simulation
5. Create `src/lib/dry-run/ReportGenerator.ts` — report generation + Discord
6. Update `src/lib/external/notion-client.ts` to use simulator when dry-running
7. Create `src/lib/supabase-dryrun.ts` to wrap Supabase calls

### Phase 2: Strategy Updates
1. Update `VCDiscoveryStrategy.ts` — implement Mode A/B logic
2. Update `VCResearchStrategy.ts` — implement Mode A/B logic
3. Update `MunicipalDiscoveryStrategy.ts` — implement Mode A/B logic
4. Update `MunicipalResearchStrategy.ts` — implement Mode A/B logic

### Phase 3: Pipeline Updates
1. Update `OutreachPipeline.ts` — delegate dry-run to strategies
2. Update `Pipeline.ts` — pass `useDirectAPI` through context
3. Update `src/index.ts` — document new behavior in help text

### Phase 4: Testing
1. Test Mode A: `bun bin/alygn-outreach.ts --type=vc --action=discover --dry-run` → mock data
2. Test Mode B: `USE_DIRECT_API=true bun bin/alygn-outreach.ts --type=vc --action=discover --dry-run` → real APIs + simulated writes
3. Verify JSON files match real DB structures
4. Verify Discord report sent to `#annotations`

### Files to Create
- `src/lib/dry-run/DryRunSimulator.ts`
- `src/lib/dry-run/NotionSimulator.ts`
- `src/lib/dry-run/SupabaseSimulator.ts`
- `src/lib/dry-run/ReportGenerator.ts`
- `src/lib/dry-run/index.ts`

### Files to Modify
- `src/strategies/discovery/VCDiscoveryStrategy.ts`
- `src/strategies/research/VCResearchStrategy.ts`
- `src/strategies/discovery/MunicipalDiscoveryStrategy.ts`
- `src/strategies/research/MunicipalResearchStrategy.ts`
- `src/core/OutreachPipeline.ts`
- `src/core/Pipeline.ts`
- `src/index.ts`

---

## 9. Backward Compatibility

Mode A (`--dry-run` without `USE_DIRECT_API`) is identical to the current behavior — no API calls, mock data returned. Existing scripts and CI pipelines that use `--dry-run` will continue to work unchanged.

---

## 10. Verification Checklist

- [ ] Mode A: `--dry-run` → mock data, no API calls, no files written
- [ ] Mode B: `--dry-run USE_DIRECT_API=true` → real APIs, JSON files written
- [ ] Notion simulation files match real Notion API response structure
- [ ] Supabase simulation files match TypeScript types in `supabase-mappers.ts`
- [ ] Discord report sent to `#annotations` on Mode B completion
- [ ] Report includes API calls made, data retrieved, simulated writes
- [ ] All strategies follow the same decision tree pattern
- [ ] No DB credentials are actually used in Mode B (no real writes)
