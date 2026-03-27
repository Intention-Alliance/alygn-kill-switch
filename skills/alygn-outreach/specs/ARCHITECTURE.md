# Architecture Specification — Alygn Outreach Skill

## Overview

The Alygn Outreach Skill is a self-contained Node.js/TypeScript package that manages outbound outreach to Venture Capital firms (VCs) and Municipal/City governments. It follows the **Strategy Pattern** to allow type-specific behavior (VC vs. Municipal) while sharing common infrastructure.

---

## Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            ALYGN OUTREACH SKILL                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐        │
│  │   CLI Entry     │    │   Core Pipeline │    │   Strategy      │        │
│  │   (bin/)        │───▶│   (Outreach     │◀───│   Registry      │        │
│  │                 │    │    Pipeline)    │    │                 │        │
│  └─────────────────┘    └────────┬────────┘    └─────────────────┘        │
│                                  │                                           │
│         ┌────────────────────────┼────────────────────────────────┐        │
│         │                        │                                │        │
│         ▼                        ▼                                ▼        │
│  ┌──────────────┐      ┌──────────────────┐      ┌──────────────────┐     │
│  │   Entities   │      │   Strategies     │      │   External I/O   │     │
│  │              │      │                  │      │                  │     │
│  │ Outreach     │      │ [Discovery]      │      │ ┌────────────┐  │     │
│  │ Entity       │      │  ├─ VC           │      │ │ Supabase   │  │     │
│  │   (base)     │      │  └─ Municipal    │      │ │ (outreach  │  │     │
│  │              │      │                  │      │ │  data)     │  │     │
│  │ VC Entity    │      │ [Validation]     │      │ └────────────┘  │     │
│  │              │      │  └─ Default      │      │                  │     │
│  │ Municipal    │      │                  │      │ ┌────────────┐  │     │
│  │ Entity       │      │ [Research]       │      │ │ Notion     │  │     │
│  │              │      │  ├─ VC           │      │ │ (drafts)   │  │     │
│  │ + Types      │      │  └─ Municipal    │      │ └────────────┘  │     │
│  └──────────────┘      │                  │      │                  │     │
│         │               │ [Personalize]    │      │ ┌────────────┐  │     │
│         │               │  ├─ VC          │      │ │ Email      │  │     │
│         │               │  └─ Municipal   │      │ │ Service    │  │     │
│         │               │                  │      │ └────────────┘  │     │
│         │               │ [Sending]        │      │                  │     │
│         │               │  └─ Default      │      └──────────────────┘     │
│         │               └──────────────────┘                               │
│         │                                                                    │
│         ▼                                                                    │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                     Shared Libraries (src/lib/)                       │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────┐ │   │
│  │  │ Email       │  │ Email       │  │ Email       │  │ Sent      │ │   │
│  │  │ Providers   │  │ Validators  │  │ Templates   │  │ Tracker   │ │   │
│  │  │             │  │             │  │             │  │           │ │   │
│  │  │ • SMTP      │  │ • Regex MX  │  │ • VC        │  │ (JSON)    │ │   │
│  │  │ • Smartlead │  │ • ZeroBounce│  │ • Municipal │  └───────────┘ │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                 │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Module Dependencies (Internal Only)

```
src/
├── index.ts                          # Package entry — re-exports public API
│
├── cli/
│   └── alygn-outreach.js             # CLI argument parsing & command dispatch
│
├── core/
│   ├── OutreachPipeline.ts           # Orchestrates 5-stage pipeline
│   └── Pipeline.ts                   # Legacy alias
│
├── entities/
│   ├── OutreachEntity.ts             # Base class (vc | municipal)
│   ├── VCEntity.ts                   # VC-specific entity
│   ├── MunicipalEntity.ts            # Municipal-specific entity
│   ├── supabase-mappers.ts          # Entity → Supabase row converters
│   └── types.ts                      # All TypeScript interfaces
│
├── strategies/
│   ├── StrategyRegistry.ts          # Factory: registers + retrieves strategies
│   │
│   ├── discovery/
│   │   ├── DiscoveryStrategy.ts     # Interface: discover(query, options)
│   │   ├── VCDiscoveryStrategy.ts    # VC discovery (Crunchbase/LinkedIn web)
│   │   └── MunicipalDiscoveryStrategy.ts  # CR canton discovery
│   │
│   ├── validation/
│   │   └── ValidationStrategy.ts     # Interface: validate(entity)
│   │   └── DefaultValidationStrategy.ts   # Reuses EmailValidator
│   │
│   ├── research/
│   │   ├── ResearchStrategy.ts       # Interface: research(entity)
│   │   ├── VCResearchStrategy.ts     # VC deep research
│   │   └── MunicipalResearchStrategy.ts  # CR municipal research
│   │
│   ├── personalization/
│   │   ├── PersonalizationStrategy.ts # Interface: personalize(entity)
│   │   ├── VCPersonalizationStrategy.ts  # VC email personalization
│   │   └── MunicipalPersonalizationStrategy.ts # CR personalization
│   │
│   └── sending/
│       └── SendingStrategy.ts        # Interface: send(entity, email)
│       └── DefaultSendingStrategy.ts  # Wraps EmailService
│
└── lib/
    ├── email/
    │   ├── EmailService.ts            # Orchestrates send/validate
    │   ├── EmailProviderFactory.ts   # Factory for SMTP/Smartlead
    │   ├── providers/
    │   │   ├── EmailProvider.ts       # Provider interface
    │   │   ├── SMTPProvider.ts        # SMTP implementation
    │   │   └── SmartleadProvider.ts   # Smartlead API implementation
    │   ├── validators/
    │   │   ├── EmailValidator.ts      # Validator interface
    │   │   ├── RegexMXValidator.ts   # Regex + DNS MX check
    │   │   ├── ZeroBounceValidator.ts # ZeroBounce API
    │   │   └── EmailValidatorFactory.ts
    │   └── outreach-email-template.ts # Email content templates
    │
    └── SentEmailTracker.ts           # JSON file — prevents duplicate sends
```

**Dependency Rules:**
- `entities/` — No external I/O dependencies. Pure data + business logic.
- `strategies/` — May import entities and call external services; never import each other.
- `core/` — Imports strategies and entities; orchestrates workflow.
- `lib/` — Infrastructure (email, validation, tracking). No strategy imports.
- `cli/` — Thin entry point. Imports core, parses args, dispatches.

---

## Data Flow: Skill → Supabase / Notion

### Write Path (Outreach → Database)

```
1. Discovery    → Strategy discovers entity → MunicipalEntity.fromCanton() / VCEntity
2. Validation   → EmailValidator checks email → entity.emailValidation updated
3. Research     → Web search → entity.researchNotes + typeData enriched
4. Personalize  → LLM generates subject/body → entity.personalizationContext
5. Send         → EmailService.send() → Supabase upsert + Notion draft update

Skill Entity          Supabase Tables              Notion
─────────────────     ──────────────────────────    ───────────────
MunicipalEntity  ──▶  municipalities (upsert)     Draft page
  .name                 .name                        .title
  .email                .general_email               .Email
  .typeData             .population                  .Research Notes
  .waveNumber           .wave_number                 .Personalization
  .personalization     

VCEntity         ──▶  political_figures (upsert)   Draft page
  .name                .full_name                    .title
  .email               .email                        .Research Notes
  .typeData            .ai_governance_interest
```

### Read Path (Loading from Supabase)

```
Supabase municipalities ──▶ MunicipalEntity.fromJSON()
Supabase political_figures ──▶ VCEntity.fromJSON()
Notion draft pages ──▶ enrichment via Notion API → entity.researchNotes
```

### Supabase Sync Functions (supabase-mappers.ts)

| Function | Direction | Supabase Table |
|---|---|---|
| `toMunicipalityInsert()` | Entity → DB | `municipalities` |
| `toMunicipalityUpdate()` | Entity → DB | `municipalities` |
| `toLocalGovernmentInsert()` | Entity → DB | `local_governments` |
| `toOutreachEmailInsert()` | Entity → DB | `outreach_emails` |
| `toPoliticalFigureInsert()` | Entity → DB | `political_figures` |
| `createSupabaseMunicipality()` | Entity → DB | Both above |

---

## Strategy Pattern Explanation

### Why Strategy Pattern?

VC and Municipal outreach differ in almost every dimension:

| Stage | VC Behavior | Municipal Behavior |
|---|---|---|
| **Discovery** | Search Crunchbase/LinkedIn for firms | Enumerate CR cantones from hardcoded list |
| **Research** | Partner names, AUM, portfolio, investments | Budget, departments, initiatives, pain points |
| **Personalize** | Reference specific portfolio company | Reference specific initiative or pain point |
| **Send** | VC partner email | Mayor/general email |

Sharing a base class would require massive conditionals. Strategy Pattern lets each type provide its own implementation without the base class knowing the differences.

### Structure

```
StrategyRegistry
  ├── register(type, action, strategy)   # e.g. register('vc', 'discover', vcDiscovery)
  ├── get(type, action) → strategy        # Returns type-specific or falls back to default
  └── registerDefault(action, strategy)   # Fallback for all types

OutreachPipeline
  ├── context.type = 'vc' | 'municipal'
  ├── strategies: StrategyRegistry
  └── run(entity, startStage?)
```

### Strategy Selection Logic

```
getStrategy(action):
  1. Look up type-specific strategy:  registry.get(context.type, action)
  2. If not found, fall back to default: registry.get('default', action)
  3. If still not found, return null

Built-in defaults:
  validate   → DefaultValidationStrategy  (type-agnostic)
  send       → DefaultSendingStrategy      (type-agnostic)
  discover   → NO default (required — each type must provide)
  research   → NO default (required)
  personalize → NO default (required)
```

### Example: Discovery for VC vs. Municipal

```typescript
// Pipeline construction
const pipeline = new OutreachPipeline({ type: 'vc', config: {} });

// Registration
pipeline.registerStrategy('discover', new VCDiscoveryStrategy(config));
pipeline.registerStrategy('research', new VCResearchStrategy(config));
pipeline.registerStrategy('personalize', new VCPersonalizationStrategy(config));

// Execution — pipeline doesn't know or care about the differences
const result = await pipeline.discover(query, options);
// Internally calls VCDiscoveryStrategy.discover() because context.type = 'vc'
```

---

## Self-Contained Package Structure

```
alygn-outreach-skill/
├── package.json              # "name": "alygn-outreach-skill", type: "module"
├── bin/
│   └── alygn-outreach        # CLI entry point (Unix executable)
├── src/
│   ├── index.ts              # Public re-exports
│   ├── cli/                  # CLI only
│   ├── core/                 # Pipeline only
│   ├── entities/             # Entities + types (no I/O)
│   ├── strategies/           # Strategy interfaces + implementations
│   └── lib/                  # Shared infrastructure (email, validators)
└── specs/                    # This documentation
    ├── ARCHITECTURE.md
    ├── API.md
    ├── DATABASE.md
    └── STRATEGY-PATTERN.md
```

The package is self-contained: all business logic, types, and implementations live under `src/`. It does not import from sibling scripts (e.g., `scripts/alygn/`). External service credentials are loaded from a config file at runtime, not hardcoded.
