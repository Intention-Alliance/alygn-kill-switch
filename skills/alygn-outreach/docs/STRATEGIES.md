# Strategy Development Guide

> How to create, register, and test new strategies for the alygn-outreach skill.

---

## Architecture Overview

Strategies are pluggable components that implement a specific stage of the outreach pipeline. Each strategy follows a **base class + type-specific implementation** pattern.

```
Pipeline
  └── StrategyRegistry (factory)
        ├── discovery/
        │     ├── DiscoveryStrategy (base)
        │     ├── VCDiscoveryStrategy
        │     └── MunicipalDiscoveryStrategy
        ├── validation/
        │     └── ValidationStrategy (shared, no type variants)
        ├── research/
        │     ├── ResearchStrategy (base)
        │     ├── VCResearchStrategy
        │     └── MunicipalResearchStrategy
        ├── personalization/
        │     ├── PersonalizationStrategy (base)
        │     ├── VCPersonalizationStrategy
        │     └── MunicipalPersonalizationStrategy
        └── sending/
              └── SendingStrategy (shared, no type variants)
```

**Rule of thumb:**

- If behavior differs significantly between VC and Municipal → create type-specific subclasses
- If behavior is the same for both types → use a single shared strategy registered as `'default'`

---

## Strategy Interface Requirements

Every strategy must extend its corresponding base class. The base classes live in the same directory as the implementation:

```
src/strategies/{category}/
├── BaseStrategy.ts        # Abstract/base class
├── TypeAStrategy.ts       # e.g., VC*Strategy
└── TypeBStrategy.ts        # e.g., Municipal*Strategy
```

### Discovery Strategy

**Base class:** `src/strategies/discovery/DiscoveryStrategy.ts`

```typescript
import { DiscoveryStrategy } from "./DiscoveryStrategy";
import type { OutreachEntity } from "../../entities/OutreachEntity";

export class MyDiscoveryStrategy extends DiscoveryStrategy {
  constructor(config: Record<string, unknown> = {}) {
    super(config);
    this.name = "my-discovery";
  }

  /**
   * @param query - Search query string
   * @param options - Discovery options (dryRun, limit, region, etc.)
   * @returns Promise<OutreachEntity[]>
   */
  async discover(
    query: string,
    options: Record<string, unknown> = {},
  ): Promise<OutreachEntity[]> {
    // Your implementation here
    const entities: OutreachEntity[] = [];

    // Example: fetch from an API
    const results = await this.fetchFromAPI(query, options);

    for (const item of results) {
      entities.push(
        new OutreachEntity({
          id: this.generateId(),
          type: this.type, // 'vc' or 'municipal'
          name: item.name,
          email: item.email ?? null,
          website: item.website ?? null,
          phone: null,
          location: {
            city: item.city,
            state: null,
            country: item.country,
            region: null,
          },
          status: "discovered",
          priority: "medium",
          discoveredAt: new Date(),
          lastUpdatedAt: new Date(),
          outreachCount: 0,
          researchNotes: null,
          personalizationContext: null,
          typeData: {},
          emailValidation: null,
          sentEmailId: null,
          sentAt: null,
          draftStatus: "Not drafted",
        }),
      );
    }

    return entities;
  }
}
```

### Validation Strategy

**Base class:** `src/strategies/validation/ValidationStrategy.ts`

```typescript
import { ValidationStrategy } from "./ValidationStrategy";
import type { OutreachEntity } from "../../entities/OutreachEntity";

export class MyValidationStrategy extends ValidationStrategy {
  async validate(entity: OutreachEntity): Promise<Record<string, unknown>> {
    const email = entity.email;

    if (!email) {
      return { result: "invalid", confidence: 0, reason: "no_email" };
    }

    // Call your validation API
    const validation = await this.callValidatorAPI(email);

    return {
      result: validation.status, // 'valid' | 'invalid' | 'risky' | 'unknown'
      confidence: validation.score, // 0-1
      details: {
        reason: validation.reason,
        message: validation.message,
      },
      validator: "my-validator",
    };
  }
}
```

### Research Strategy

**Base class:** `src/strategies/research/ResearchStrategy.ts`

```typescript
import { ResearchStrategy } from "./ResearchStrategy";
import type { OutreachEntity } from "../../entities/OutreachEntity";

export class MyResearchStrategy extends ResearchStrategy {
  constructor(config: Record<string, unknown> = {}) {
    super(config);
    this.name = "my-research";
  }

  async research(entity: OutreachEntity): Promise<{
    success: boolean;
    research?: Record<string, unknown>;
    entity?: OutreachEntity;
    error?: string;
  }> {
    try {
      // Gather research data
      const research = await this.gatherResearch(entity);

      // Optionally update the entity
      entity.researchNotes = research.summary;
      entity.personalizationContext = research.context;
      entity.lastUpdatedAt = new Date();

      return { success: true, research, entity };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  // Optional: dry run variant
  async researchDryRun(entity: OutreachEntity): Promise<{
    success: boolean;
    research?: Record<string, unknown>;
    entity?: OutreachEntity;
    error?: string;
  }> {
    // Return a simulated result without making external calls
    return {
      success: true,
      research: { dryRun: true, wouldResearch: entity.name },
      entity,
    };
  }
}
```

### Personalization Strategy

**Base class:** `src/strategies/personalization/PersonalizationStrategy.ts`

```typescript
import { PersonalizationStrategy } from "./PersonalizationStrategy";
import type { OutreachEntity } from "../../entities/OutreachEntity";

export class MyPersonalizationStrategy extends PersonalizationStrategy {
  constructor(config: Record<string, unknown> = {}) {
    super(config);
    this.name = "my-personalization";
  }

  async personalize(entity: OutreachEntity): Promise<Record<string, unknown>> {
    // Generate personalized email content
    const subject = this.generateSubject(entity);
    const html = this.generateEmailHTML(entity);
    const text = this.generateEmailText(entity);

    return {
      success: true,
      subject,
      body: html,
      text,
      entity,
      variant: "governance",
    };
  }

  // Optional: dry run variant
  async personalizeDryRun(
    entity: OutreachEntity,
  ): Promise<Record<string, unknown>> {
    return {
      success: true,
      subject: `[DRY RUN] Would personalize for ${entity.name}`,
      entity,
      dryRun: true,
    };
  }
}
```

### Sending Strategy

**Base class:** `src/strategies/sending/SendingStrategy.ts`

```typescript
import { SendingStrategy } from "./SendingStrategy";
import type { OutreachEntity } from "../../entities/OutreachEntity";

export class MySendingStrategy extends SendingStrategy {
  constructor(config: Record<string, unknown> = {}) {
    super(config);
    this.name = "my-sending";
  }

  async send(
    entity: OutreachEntity,
    options: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    const {
      dryRun = false,
      draftStatus = "Approved",
      sendToList = [],
    } = options;

    if (!entity.email) {
      return { success: false, error: "no_email", skipped: true };
    }

    if (dryRun) {
      return {
        success: true,
        testMode: true,
        originalTo: entity.email,
        wouldSend: true,
        skipped: false,
      };
    }

    // Actually send
    const messageId = await this.sendEmail(entity);

    return { success: true, messageId, provider: "my-provider" };
  }
}
```

---

## Registering Your Strategy

After creating a strategy, you must register it in `Pipeline.ts`.

### Step 1: Add the import

```typescript
// In src/core/Pipeline.ts
import { MyDiscoveryStrategy } from "../strategies/discovery/MyDiscoveryStrategy";
```

### Step 2: Register in `initializeStrategies()`

```typescript
// In initializeStrategies() method
this.registry.register(
  "mytype",
  "discover",
  new MyDiscoveryStrategy(this.config.discovery as Record<string, unknown>),
);
```

### Step 3: Support the new type in `createEntityFromData()`

```typescript
// In createEntityFromData() method
if (entityType === "mytype") {
  return MyEntity.fromJSON(data);
}
```

### Using the strategy via CLI

```bash
bun bin/alygn-outreach.ts --type=mytype --action=discover --limit=10 --dry-run
```

---

## Creating a New Discovery Strategy

Here's a complete walkthrough: building a **Crunchbase-based VC discovery strategy**.

### 1. Create the file

```typescript
// src/strategies/discovery/CrunchbaseDiscoveryStrategy.ts
import { DiscoveryStrategy } from "./DiscoveryStrategy";
import type { OutreachEntity } from "../../entities/OutreachEntity";

export class CrunchbaseDiscoveryStrategy extends DiscoveryStrategy {
  constructor(config: Record<string, unknown> = {}) {
    super(config);
    this.name = "crunchbase-discovery";
    this.apiKey = config.crunchbaseApiKey as string | undefined;
  }

  async discover(
    query: string,
    options: Record<string, unknown> = {},
  ): Promise<OutreachEntity[]> {
    const { limit = 20 } = options;
    const entities: OutreachEntity[] = [];

    // Fetch from Crunchbase API
    const organizations = await this.fetchCrunchbaseOrgs({
      query,
      limit,
    });

    for (const org of organizations) {
      entities.push(
        new OutreachEntity({
          id: `crunchbase-${org.uuid}`,
          type: "vc",
          name: org.name,
          email: null,
          website: org.domain,
          phone: null,
          location: {
            city: org.city,
            state: org.region,
            country: org.country,
            region: null,
          },
          status: "discovered",
          priority: "medium",
          discoveredAt: new Date(),
          lastUpdatedAt: new Date(),
          outreachCount: 0,
          researchNotes: null,
          personalizationContext: { crunchbaseUuid: org.uuid },
          typeData: {
            firmType: "vc",
            stageFocus: [],
            sectorFocus: org.industry,
          },
          emailValidation: null,
          sentEmailId: null,
          sentAt: null,
          draftStatus: "Not drafted",
        }),
      );
    }

    return entities;
  }

  private async fetchCrunchbaseOrgs(params: {
    query: string;
    limit: number;
  }): Promise<Array<Record<string, unknown>>> {
    // Implement Crunchbase API call
    // ...
    return [];
  }
}
```

### 2. Register it

In `Pipeline.ts`:

```typescript
import { CrunchbaseDiscoveryStrategy } from "../strategies/discovery/CrunchbaseDiscoveryStrategy";

// In initializeStrategies():
this.registry.register(
  "vc",
  "discover",
  new CrunchbaseDiscoveryStrategy(
    this.config.discovery as Record<string, unknown>,
  ),
);
```

### 3. Test it

```bash
bun bin/alygn-outreach.ts --type=vc --action=discover --limit=5 --dry-run
```

---

## Testing Strategies

### Unit Testing a Strategy

```typescript
// src/strategies/discovery/__tests__/CrunchbaseDiscoveryStrategy.test.ts
import { describe, test, expect } from "bun:test";
import { CrunchbaseDiscoveryStrategy } from "../CrunchbaseDiscoveryStrategy";

describe("CrunchbaseDiscoveryStrategy", () => {
  test("discovers VC firms from query", async () => {
    const strategy = new CrunchbaseDiscoveryStrategy({
      crunchbaseApiKey: process.env.CRUNCHBASE_API_KEY,
    });

    const entities = await strategy.discover("AI safety", { limit: 3 });

    expect(entities.length).toBeGreaterThan(0);
    expect(entities[0].type).toBe("vc");
    expect(entities[0].name).toBeTruthy();
  });

  test("respects limit option", async () => {
    const strategy = new CrunchbaseDiscoveryStrategy({});
    const entities = await strategy.discover("AI", { limit: 2 });
    expect(entities.length).toBeLessThanOrEqual(2);
  });
});
```

Run with:

```bash
bun test src/strategies/discovery/__tests__/
```

### Integration Testing via CLI

```bash
# Full dry-run test
bun bin/alygn-outreach.ts --type=vc --action=pipeline --limit=1 --dry-run

# Test only discovery
bun bin/alygn-outreach.ts --type=vc --action=discover --limit=3 --dry-run

# Test only research (with state file)
bun bin/alygn-outreach.ts --type=vc --action=research \
  --input=$HOME/.openclaw/workspace/reports/alygn/vc-discover/alygn-vc-discovered-2026-03-26.json \
  --limit=3 --dry-run
```

### Testing the Two-Filter Send System

```bash
# 1. Generate drafts (sets Draft Status = "Drafted")
bun bin/alygn-outreach.ts --type=vc --action=personalize --limit=2 --dry-run

# 2. Manually approve in Notion (set Draft Status = "Approved")

# 3. Get entity IDs from Notion, then send with both filters:
bun bin/alygn-outreach.ts --type=vc --action=send \
  --draft-status=Approved \
  --email-send-to=<id-1>,<id-2> \
  --dry-run
```

---

## Strategy Config Types

Define your config schema using the existing config interfaces:

```typescript
// In src/entities/types.ts or your strategy file

export interface IDiscoveryConfig {
  searchQueries?: string[];
  // Add your config fields:
  crunchbaseApiKey?: string;
  maxResults?: number;
}

export interface IValidationConfig {
  validatorType?: "regex-mx" | "zerobounce" | "my-validator";
  checkMxRecords?: boolean;
  minConfidenceScore?: number;
  // Add your config fields:
  myApiKey?: string;
  rateLimit?: number;
}
```

---

## Best Practices

1. **Always implement the dry run variant** — `researchDryRun` / `personalizeDryRun` — so strategies can be tested without side effects.

2. **Handle missing data gracefully** — entities may have null emails, missing websites, etc. Don't throw; return a graceful error result.

3. **Use the `options` parameter** — pass `dryRun`, `limit`, and other CLI flags through to your strategy via the options object.

4. **Keep entity IDs deterministic** — use a prefix + stable ID (`crunchbase-${uuid}`) so re-running discovery doesn't create duplicates.

5. **Store raw research data** in `entity.personalizationContext` for use by downstream personalization strategies.

6. **Validate before registering** — if your strategy requires certain config fields, check for them in the constructor and throw a helpful error.

7. **Log key milestones** — use `console.log` at the strategy level (the CLI wrapper handles output formatting).

8. **Return structured results** — don't just return `true/false`. Return objects with `success`, `error`, `skipped`, `reason` fields so the pipeline can make informed decisions.
