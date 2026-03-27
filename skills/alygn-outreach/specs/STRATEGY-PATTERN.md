# Strategy Pattern Specification — Alygn Outreach Skill

## Overview

The Strategy Pattern is the core architectural decision in this skill. It allows the same pipeline to handle VCs and Municipalities without embedding type-specific logic in shared components.

---

## The Problem It Solves

VC and Municipal outreach differ in every stage:

| Stage | VC | Municipal (Costa Rica) |
|---|---|---|
| **Discover** | Search Crunchbase, web scraping for investors matching criteria | Enumerate 82 Costa Rica cantones from hardcoded `COSTA_RICA_CANTONES` list |
| **Research** | Scrape Crunchbase/LinkedIn: partners, AUM, portfolio, recent investments | Look up budget, departments, initiatives, pain points from public records |
| **Personalize** | Reference specific portfolio company or partner with AI focus | Reference specific initiative (e.g., "Plan de Transformación Digital") |
| **Send** | Email a VC partner | Email the mayor or general municipality inbox |

A naive approach would use `if (entity.type === 'vc')` everywhere. This becomes unmaintainable as the pipeline grows. The Strategy Pattern eliminates these conditionals entirely.

---

## Strategy Contracts

Each strategy implements a typed interface. The interface defines the **contract**: what the pipeline expects from any strategy, regardless of entity type.

### Contract: `DiscoveryStrategy`

```typescript
interface IDiscoveryStrategy {
  /**
   * Discover entities.
   *
   * VC implementation: query = search term (e.g., "AI safety seed investors")
   * Municipal implementation: query = ignored, region = canton filter
   *
   * @param query  - Search term or query string
   * @param options - { limit?: number; region?: string; ... }
   * @returns Promise<OutreachEntity[]>
   */
  discover(query: string, options?: Record<string, unknown>): Promise<OutreachEntity[]>;
}
```

**VC Implementation:** `VCDiscoveryStrategy`
- Accepts a natural-language query
- Uses web search (via Grok API) to find VC firms
- Filters by criteria (stage, sector, check size)
- Returns `VCEntity[]` populated with firm data

**Municipal Implementation:** `MunicipalDiscoveryStrategy`
- Ignores the query parameter
- Returns all 82 Costa Rica cantones from `COSTA_RICA_CANTONES`
- Filters by `region` option (province name)
- Returns `MunicipalEntity[]` populated with population/budget

---

### Contract: `PersonalizationStrategy`

```typescript
interface IPersonalizationStrategy {
  /**
   * Generate personalized email content for an entity.
   *
   * @param entity - Entity with researchNotes + typeData populated
   * @returns Promise<PersonalizationResult>
   */
  personalize(entity: OutreachEntity): Promise<PersonalizationResult>;
}

interface PersonalizationResult {
  success: boolean;
  email?: { subject: string; html: string; text?: string };
  draftId?: string;
  draftStatus?: DraftStatus;
  entity?: OutreachEntity;
  error?: string;
}
```

**VC Implementation:** `VCPersonalizationStrategy`
- Reads `entity.typeData.partners`, `.portfolioCompanies`, `.stageFocus`
- Uses LLM to write subject + body referencing a specific portfolio company
- Stores draft in Notion via API

**Municipal Implementation:** `MunicipalPersonalizationStrategy`
- Reads `entity.typeData.initiatives`, `.painPoints`, `.province`
- Uses LLM to write subject + body referencing a specific initiative
- Stores draft in Notion via API

---

### Contract: `ResearchStrategy`

```typescript
interface IResearchStrategy {
  /**
   * Conduct deep research on an entity.
   *
   * @param entity - Entity to enrich
   * @returns Promise<ResearchResult>
   */
  research(entity: OutreachEntity): Promise<ResearchResult>;
}

interface ResearchResult {
  success: boolean;
  research?: Record<string, unknown>;
  entity?: OutreachEntity;
  error?: string;
}
```

**VC Implementation:** `VCResearchStrategy`
- Web search for firm news, recent investments, team members
- Enriches `entity.typeData` with partner names, AUM, portfolio
- Sets `entity.researchNotes`

**Municipal Implementation:** `MunicipalResearchStrategy`
- Web search for municipality budget, departments, initiatives
- Enriches `entity.typeData` with departments, pain points, decision makers
- Sets `entity.researchNotes`

---

### Contract: `SendingStrategy`

```typescript
interface ISendingStrategy {
  /**
   * Initialize email provider. Call once before send().
   */
  initialize(): Promise<void>;

  /**
   * Send email to entity.
   *
   * @param entity  - Entity with email + personalizationContext
   * @param options - { dryRun?: boolean; draftStatus?: string; sendToList?: string[] }
   * @returns Promise<SendingResult>
   */
  send(
    entity: {
      id: string;
      name: string;
      email: string | null;
      type: string;
      status?: string;
      personalizationContext?: { customSubject?: string; customBody?: string };
      draftStatus?: string;
      pageId?: string;
    },
    options?: Record<string, unknown>
  ): Promise<SendingResult>;
}

interface SendingResult {
  success: boolean;
  messageId?: string;
  error?: string;
  testMode?: boolean;
  skipped?: boolean;
  reason?: string;
  wouldSend?: boolean;
  previouslySentAt?: string;
  provider?: string;
}
```

**Default Implementation:** `SendingStrategy` (base, shared by both types)
- Loads SMTP or Smartlead credentials from config file
- Checks `SentEmailTracker` for duplicate sends
- Applies draft status filter (only `Approved` by default)
- Applies explicit send list filter if provided
- Delegates to `EmailService` for actual delivery

> **Note:** Sending is type-agnostic — both VC and Municipal use the same `SendingStrategy`. No interface split is needed here.

---

## Strategy Selection and Execution

### `StrategyRegistry`

The registry is a `Map<string, Map<string, unknown>>` that stores strategies by `(type, action)`.

```typescript
class StrategyRegistry {
  private strategies: Map<string, Map<string, unknown>>;

  register(type: string, action: string, strategy: unknown): void;
  registerDefault(action: string, strategy: unknown): void;
  get(type: string, action: string): unknown | null;  // type-specific first, then default
  has(type: string, action: string): boolean;
  getTypes(): string[];
  getActions(type: string): string[];
}
```

**Selection algorithm for `get(type, action)`:**
```
1. If strategies.has(type) AND strategies.get(type).has(action)
     → return strategies.get(type).get(action)  // type-specific
2. If strategies.has('default') AND strategies.get('default').has(action)
     → return strategies.get('default').get(action)  // fallback default
3. Otherwise → return null
```

### Built-in Defaults

| Action | Default Strategy | Type-Agnostic? |
|---|---|---|
| `discover` | None (required per-type) | No |
| `validate` | `DefaultValidationStrategy` | Yes |
| `research` | None (required per-type) | No |
| `personalize` | None (required per-type) | No |
| `send` | `SendingStrategy` (base) | Yes |

### `OutreachPipeline` Integration

```typescript
class OutreachPipeline {
  context: PipelineContext;
  strategies: StrategyRegistry;

  registerStrategy(action: string, strategy: unknown, isDefault = false): void {
    if (isDefault) {
      this.strategies.registerDefault(action, strategy);
    } else {
      this.strategies.register(this.context.type, action, strategy);
    }
  }

  getStrategy(action: string): unknown | null {
    return this.strategies.get(this.context.type, action);
  }
}
```

When `PipelineContext.type = 'vc'`, `getStrategy('discover')` returns the VC-specific discovery strategy. When `type = 'municipal'`, it returns the municipal one.

### Dry-Run Behavior

When `context.dryRun = true`, strategies **must** check this flag and simulate operations without side effects:
- Discovery: return mock entities
- Validation: return `valid: true`
- Research: return mock research
- Personalize: return mock email content
- Sending: return `{ wouldSend: true, testMode: true }`

---

## Extensibility

### Adding a New Entity Type (e.g., `corporate`)

1. Create `src/entities/CorporateEntity.ts` extending `OutreachEntity`
2. Create `src/strategies/discovery/CorporateDiscoveryStrategy.ts`
3. Create `src/strategies/research/CorporateResearchStrategy.ts`
4. Create `src/strategies/personalization/CorporatePersonalizationStrategy.ts`
5. Register in CLI:
   ```typescript
   pipeline.registerStrategy('discover', new CorporateDiscoveryStrategy(config));
   pipeline.registerStrategy('research', new CorporateResearchStrategy(config));
   pipeline.registerStrategy('personalize', new CorporatePersonalizationStrategy(config));
   ```
6. Add to CLI argument parser: `--type=corporate`

**No changes to `OutreachPipeline` or `StrategyRegistry` are needed.**

### Adding a New Stage (e.g., `enrich`)

1. Define interface in `src/strategies/enrich/EnrichStrategy.ts`
2. Implement per-type in `VCEnrichStrategy.ts`, `MunicipalEnrichStrategy.ts`
3. Add stage to pipeline: `stages = ['discover', 'validate', 'enrich', 'research', 'personalize', 'send']`
4. Register in CLI

---

## Class Diagram

```
StrategyRegistry
    │
    ├── register(type, action, strategy)
    ├── registerDefault(action, strategy)
    └── get(type, action) → IStrategy | null

OutreachPipeline
    │
    ├── strategies: StrategyRegistry
    ├── registerStrategy(action, strategy, isDefault?)
    └── getStrategy(action) → IStrategy

IStrategy (marker interfaces)
    │
    ├── IDiscoveryStrategy
    │     ├── VCDiscoveryStrategy
    │     └── MunicipalDiscoveryStrategy
    │
    ├── IPersonalizationStrategy
    │     ├── VCPersonalizationStrategy
    │     └── MunicipalPersonalizationStrategy
    │
    ├── IResearchStrategy
    │     ├── VCResearchStrategy
    │     └── MunicipalResearchStrategy
    │
    └── ISendingStrategy
          └── SendingStrategy (default, shared)
```

---

## Notional Code: Strategy Lifecycle

```typescript
// Initialize pipeline for VC type
const pipeline = new OutreachPipeline({ type: 'vc', config: {}, dryRun: false });

// Register type-specific strategies
pipeline.registerStrategy('discover',    new VCDiscoveryStrategy(config));
pipeline.registerStrategy('research',   new VCResearchStrategy(config));
pipeline.registerStrategy('personalize', new VCPersonalizationStrategy(config));

// Register shared/default strategies
pipeline.registerStrategy('validate', new DefaultValidationStrategy(), /* isDefault */ true);
pipeline.registerStrategy('send',     new SendingStrategy(config),      /* isDefault */ true);

// Execute discovery — internally calls VCDiscoveryStrategy.discover()
const { entities } = await pipeline.discover('AI governance investors', { limit: 10 });

for (const entity of entities) {
  // Execute full pipeline for each entity
  const result = await pipeline.run(entity);
  if (!result.success) {
    console.error(`Pipeline failed at stage: ${result.failedAt}`);
  }
}
```
