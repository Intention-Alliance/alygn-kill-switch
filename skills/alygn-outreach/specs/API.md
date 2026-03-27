# API Specification — Alygn Outreach Skill

## Overview

The Alygn Outreach Skill exposes a dual API:
1. **CLI** — Human- or script-driven command execution
2. **Programmatic** — TypeScript module import for use in other Node.js projects

---

## CLI Interface

### Invocation

```bash
alygn-outreach --type=<vc|municipal> --action=<action> [options]
```

### Arguments

| Argument | Required | Default | Description |
|---|---|---|---|
| `--type` | Yes | — | Entity type: `vc` or `municipal` |
| `--action` | Yes | — | One of: `discover`, `validate`, `research`, `personalize`, `send`, `pipeline`, `stats` |
| `--limit` | No | `20` | Max entities to process |
| `--region` | No | — | Region filter (e.g., `costa-rica`) |
| `--input` | No | — | Query or entity ID(s) to process |
| `--dry-run` | No | `false` | Simulate without side effects |
| `--draft-status` | No | `Approved` | Filter by draft status |
| `--send-to-list` | No | `[]` | Comma-separated entity IDs to explicitly send to |
| `--config` | No | `{}` | JSON config object |

### Examples

```bash
# Discover VCs
alygn-outreach --type=vc --action=discover --limit=10 --dry-run

# Discover Costa Rica municipalities
alygn-outreach --type=municipal --region=costa-rica --action=discover

# Validate all discovered entities
alygn-outreach --type=municipal --action=validate --limit=50

# Run full pipeline (discover→validate→research→personalize→send)
alygn-outreach --type=vc --action=pipeline --limit=5 --dry-run

# Send approved drafts only
alygn-outreach --type=municipal --action=send --draft-status=Approved --limit=20

# Send to specific entities only
alygn-outreach --type=municipal --action=send --send-to-list=id1,id2,id3

# Show configuration
alygn-outreach --type=vc --action=stats
```

### Exit Codes

| Code | Meaning |
|---|---|
| `0` | Success |
| `1` | General error |
| `2` | Invalid arguments |
| `3` | No strategy registered for action |
| `4` | Dry run completed (treated as success) |

---

## Strategy Interfaces

### Base Interface: `DiscoveryStrategy`

```typescript
class DiscoveryStrategy {
  protected config: Record<string, unknown>;
  protected name: string;

  /**
   * Discover entities matching a query.
   * @param query - Search query string (type-specific interpretation)
   * @param options - { limit?: number; region?: string }
   * @returns Promise<OutreachEntity[]>
   */
  async discover(
    query: string,
    options?: Record<string, unknown>
  ): Promise<OutreachEntity[]>;
}
```

### Base Interface: `PersonalizationStrategy`

```typescript
interface PersonalizationResult {
  success: boolean;
  email?: { subject: string; html: string; text?: string };
  draftId?: string;
  draftStatus?: DraftStatus;
  entity?: OutreachEntity;
  error?: string;
}

class PersonalizationStrategy {
  protected config: Record<string, unknown>;
  protected name: string;

  /**
   * Enrich entity with personalized email content.
   * @param entity - OutreachEntity to personalize
   * @returns Promise<PersonalizationResult>
   */
  async personalize(entity: OutreachEntity): Promise<PersonalizationResult>;
}
```

### Base Interface: `ResearchStrategy`

```typescript
interface ResearchResult {
  success: boolean;
  research?: Record<string, unknown>;
  entity?: OutreachEntity;
  error?: string;
}

class ResearchStrategy {
  protected config: Record<string, unknown>;
  protected name: string;

  /**
   * Conduct deep research on an entity.
   * @param entity - OutreachEntity to research
   * @returns Promise<ResearchResult>
   */
  async research(entity: OutreachEntity): Promise<ResearchResult>;
}
```

### Base Interface: `SendingStrategy`

```typescript
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

class SendingStrategy {
  protected config: Record<string, unknown>;

  /**
   * Initialize email service. Called once before send().
   */
  async initialize(): Promise<void>;

  /**
   * Send personalized email to entity.
   * @param entity - Entity with email + personalizationContext
   * @param options - { dryRun?: boolean; draftStatus?: string; sendToList?: string[] }
   * @returns Promise<SendingResult>
   */
  async send(
    entity: OutreachEntity,
    options?: Record<string, unknown>
  ): Promise<SendingResult>;
}
```

---

## Entity Interfaces

### `OutreachEntity` (Base)

```typescript
interface IOutreachEntity {
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

interface Location {
  city: string | null;
  state: string | null;
  country: string | null;
  region: string | null;
}

type EntityStatus =
  | 'discovered' | 'validated' | 'researched'
  | 'personalized' | 'sent' | 'replied'
  | 'meeting' | 'passed' | 'not_interested';

type Priority = 'high' | 'medium' | 'low';

type DraftStatus =
  'Not drafted' | 'Drafted' | 'Approved' | 'Rejected' | 'Sent';
```

### `VCEntity`

```typescript
interface IVCTypeData {
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

interface IVCPartner {
  name: string;
  title: string;
  focus?: string[];
}

interface IRecentInvestment {
  company: string;
  date: string;
  stage: string;
}

interface IVC extends IOutreachEntity {
  type: 'vc';
  typeData: IVCTypeData;
}
```

### `MunicipalEntity`

```typescript
interface IMunicipalTypeData {
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

interface IDepartment {
  name: string;
  focus: string[];
}

interface IKeyContact {
  name: string;
  title: string;
  department?: string;
  isDecisionMaker: boolean;
  focusAreas?: string[];
}

interface IInitiative {
  name: string;
  description: string;
  status: 'active' | 'planned' | 'completed' | 'paused';
  budget?: number;
}

interface IDecisionMaker {
  name: string;
  title: string;
  influence: 'high' | 'medium' | 'low';
}

interface IMunicipality extends IOutreachEntity {
  type: 'municipal';
  typeData: IMunicipalTypeData;
}
```

---

## Type Definitions

### Pipeline Result Types

```typescript
interface IPipelineResult {
  success: boolean;
  entity?: IOutreachEntity;
  failedAt?: string;
  error?: string;
  stageResults?: Record<string, unknown>;
}

interface IStageResult {
  success: boolean;
  entity?: IOutreachEntity;
  error?: string;
  duration?: number;
}

interface IDiscoveryResult {
  success: boolean;
  entities: IOutreachEntity[];
  error?: string;
}

interface IValidationResult {
  valid: boolean;
  confidenceScore: number;
  result: 'valid' | 'invalid' | 'risky' | 'unknown';
  details: { reason: string; message: string };
  validator?: string;
}
```

### CLI Argument Types

```typescript
interface ICLIArgs {
  type: 'vc' | 'municipal';
  action: 'discover' | 'validate' | 'research' | 'personalize' | 'send' | 'pipeline' | 'stats';
  dryRun: boolean;
  limit: number;
  region: string | null;
  input: string | null;
  draftStatus: DraftStatus;
  sendToList: string[];
  config: Record<string, unknown>;
}
```

### Strategy Config Types

```typescript
interface IDiscoveryConfig {
  searchQueries?: string[];
}

interface IValidationConfig {
  validatorType?: 'regex-mx' | 'zerobounce';
  checkMxRecords?: boolean;
  checkDisposable?: boolean;
  checkRoleBased?: boolean;
  minConfidenceScore?: number;
}

interface ISendingConfig {
  providerType?: 'smtp' | 'smartlead';
  providerConfig?: Record<string, unknown>;
  fromEmail?: string;
  testEmail?: string;
  rateLimitMs?: number;
}
```

---

## Programmatic API

### Basic Usage

```typescript
import { OutreachPipeline } from './src/core/OutreachPipeline.js';
import { VCDiscoveryStrategy } from './src/strategies/discovery/VCDiscoveryStrategy.js';
import { VCResearchStrategy } from './src/strategies/research/VCResearchStrategy.js';
import { VCPersonalizationStrategy } from './src/strategies/personalization/VCPersonalizationStrategy.js';
import { DefaultValidationStrategy } from './src/strategies/validation/DefaultValidationStrategy.js';
import { DefaultSendingStrategy } from './src/strategies/sending/DefaultSendingStrategy.js';

// Create pipeline
const pipeline = new OutreachPipeline({
  type: 'vc',
  config: {},
  dryRun: true
});

// Register strategies
pipeline.registerStrategy('discover', new VCDiscoveryStrategy());
pipeline.registerStrategy('validate', new DefaultValidationStrategy());
pipeline.registerStrategy('research', new VCResearchStrategy());
pipeline.registerStrategy('personalize', new VCPersonalizationStrategy());
pipeline.registerStrategy('send', new DefaultSendingStrategy());

// Discover
const { entities } = await pipeline.discover('AI safety investors', { limit: 10 });
console.log(`Discovered ${entities.length} VCs`);

// Run full pipeline
const result = await pipeline.run(entities[0]);
console.log(result.success ? 'Pipeline complete' : `Failed at ${result.failedAt}`);
```

### Public Exports from `src/index.ts`

```typescript
// Entities
export { OutreachEntity } from './entities/OutreachEntity.js';
export { VCEntity } from './entities/VCEntity.js';
export { MunicipalEntity } from './entities/MunicipalEntity.js';

// Types
export * from './entities/types.js';

// Core
export { OutreachPipeline } from './core/OutreachPipeline.js';

// Strategies
export { DiscoveryStrategy } from './strategies/discovery/DiscoveryStrategy.js';
export { VCDiscoveryStrategy } from './strategies/discovery/VCDiscoveryStrategy.js';
export { MunicipalDiscoveryStrategy } from './strategies/discovery/MunicipalDiscoveryStrategy.js';
export { PersonalizationStrategy } from './strategies/personalization/PersonalizationStrategy.js';
export { VCPersonalizationStrategy } from './strategies/personalization/VCPersonalizationStrategy.js';
export { MunicipalPersonalizationStrategy } from './strategies/personalization/MunicipalPersonalizationStrategy.js';
export { ResearchStrategy } from './strategies/research/ResearchStrategy.js';
export { VCResearchStrategy } from './strategies/research/VCResearchStrategy.js';
export { MunicipalResearchStrategy } from './strategies/research/MunicipalResearchStrategy.js';
export { SendingStrategy } from './strategies/sending/SendingStrategy.js';
export { DefaultSendingStrategy } from './strategies/sending/DefaultSendingStrategy.js';
export { StrategyRegistry } from './strategies/StrategyRegistry.js';
```
