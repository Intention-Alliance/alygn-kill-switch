# Unified Alygn Outreach Skill Design

## Overview

A single, unified skill that handles both VC (Venture Capital) and municipal outreach using shared strategies and a common pipeline architecture. This consolidation eliminates code duplication while maintaining flexibility for entity-specific behaviors.

### Goals
- **Single Source of Truth**: One skill handles all outreach types
- **Shared Infrastructure**: Common validation, sending, and tracking logic
- **Type-Specific Extensibility**: VC and municipal entities have unique discovery and personalization needs
- **Simplified Maintenance**: Updates to core logic apply to both outreach types
- **Unified CLI**: Single command interface with type switching

### Scope
- VC firm discovery and outreach
- Municipal/city government discovery and outreach
- Email validation, personalization, and sending
- Reply tracking and pipeline management

---

## Architecture

### Entity Hierarchy

```typescript
// Base interface for all outreach entities
interface OutreachEntity {
  // Common identification
  id: string;
  type: 'vc' | 'municipal';
  name: string;
  
  // Contact information
  email?: string;
  website?: string;
  phone?: string;
  
  // Location
  location: {
    city?: string;
    state?: string;
    country?: string;
    region?: string;
  };
  
  // Outreach state
  status: 'discovered' | 'validated' | 'researched' | 'personalized' | 'sent' | 'replied' | 'meeting' | 'passed' | 'not_interested';
  priority: 'high' | 'medium' | 'low';
  
  // Metadata
  discoveredAt: Date;
  lastUpdatedAt: Date;
  outreachCount: number;
  
  // Content
  researchNotes?: string;
  personalizationContext?: PersonalizationContext;
  
  // Type-specific data (polymorphic)
  typeData: VCEntityData | MunicipalEntityData;
}

// VC-specific data
interface VCEntityData {
  firmType: 'vc' | 'angel' | 'corporate' | 'accelerator';
  stageFocus: ('pre-seed' | 'seed' | 'series-a' | 'series-b' | 'growth')[];
  sectorFocus: string[];
  checkSizeMin?: number;
  checkSizeMax?: number;
  aum?: number;
  partners: VCPartner[];
  portfolioCompanies: string[];
  recentInvestments: RecentInvestment[];
  linkedInUrl?: string;
  crunchbaseUrl?: string;
}

interface VCPartner {
  name: string;
  title: string;
  email?: string;
  linkedIn?: string;
  focus?: string[];
  bio?: string;
}

interface RecentInvestment {
  company: string;
  date: Date;
  amount?: string;
  stage: string;
}

// Municipal-specific data
interface MunicipalEntityData {
  governmentType: 'city' | 'county' | 'state' | 'regional';
  population?: number;
  budget?: number;
  departments: Department[];
  keyContacts: MunicipalContact[];
  initiatives: Initiative[];
  painPoints: string[];
  currentVendors: string[];
  procurementProcess?: string;
  decisionMakers: DecisionMaker[];
}

interface Department {
  name: string;
  head?: string;
  focus: string[];
  budget?: number;
}

interface MunicipalContact {
  name: string;
  title: string;
  department: string;
  email?: string;
  phone?: string;
  linkedIn?: string;
  isDecisionMaker: boolean;
}

interface Initiative {
  name: string;
  description: string;
  status: 'active' | 'planned' | 'completed';
  budget?: number;
}

interface DecisionMaker {
  name: string;
  title: string;
  influence: 'high' | 'medium' | 'low';
  focusAreas: string[];
}

// Personalization context used by both types
interface PersonalizationContext {
  triggerEvent?: string;
  mutualConnection?: string;
  sharedInterest?: string;
  recentNews?: string;
  tailoredHook: string;
  valueProposition: string;
  customSubject?: string;
  customBody?: string;
}
```

### Strategy Pattern

The skill uses a strategy pattern to allow type-specific implementations while sharing common logic:

```typescript
// Strategy interfaces
interface DiscoveryStrategy {
  name: string;
  discover(query: string, options: DiscoveryOptions): Promise<OutreachEntity[]>;
}

interface ValidationStrategy {
  name: string;
  validate(entity: OutreachEntity): Promise<ValidationResult>;
}

interface ResearchStrategy {
  name: string;
  research(entity: OutreachEntity): Promise<ResearchResult>;
}

interface PersonalizationStrategy {
  name: string;
  personalize(entity: OutreachEntity): Promise<PersonalizationResult>;
}

interface SendingStrategy {
  name: string;
  send(entity: OutreachEntity, template: EmailTemplate): Promise<SendingResult>;
}

// Strategy registry
class StrategyRegistry {
  private strategies: Map<string, Map<string, any>> = new Map();
  
  register(type: string, action: string, strategy: any): void;
  get(type: string, action: string): any;
  getDefault(action: string): any;
}

// Default implementations (shared)
class DefaultValidationStrategy implements ValidationStrategy {
  async validate(entity: OutreachEntity): Promise<ValidationResult> {
    // Email format validation
    // Domain verification
    // MX record check
    // Disposable email detection
    // Role-based email detection
  }
}

class DefaultSendingStrategy implements SendingStrategy {
  async send(entity: OutreachEntity, template: EmailTemplate): Promise<SendingResult> {
    // Rate limiting
    // Send via configured provider (Resend/SendGrid)
    // Update entity status
    // Log to CRM/sheet
  }
}

// VC-specific strategies
class VCDiscoveryStrategy implements DiscoveryStrategy {
  async discover(query: string, options: DiscoveryOptions): Promise<OutreachEntity[]> {
    // Crunchbase API search
    // LinkedIn Sales Navigator
    // VC database sources
    // Portfolio company backtracking
  }
}

class VCResearchStrategy implements ResearchStrategy {
  async research(entity: OutreachEntity): Promise<ResearchResult> {
    // Scrape website for thesis/focus
    // Analyze portfolio for patterns
    // Check recent news/funding
    // Identify right partner to contact
  }
}

class VCPersonalizationStrategy implements PersonalizationStrategy {
  async personalize(entity: OutreachEntity): Promise<PersonalizationResult> {
    // Match Alygn stage to VC focus
    // Find portfolio overlap
    // Craft stage-appropriate messaging
    // Reference specific investments
  }
}

// Municipal-specific strategies
class MunicipalDiscoveryStrategy implements DiscoveryStrategy {
  async discover(query: string, options: DiscoveryOptions): Promise<OutreachEntity[]> {
    // Census data APIs
    // Municipal league directories
    // Conference attendee lists
    // Govtech vendor references
  }
}

class MunicipalResearchStrategy implements ResearchStrategy {
  async research(entity: OutreachEntity): Promise<ResearchResult> {
    // Analyze city initiatives
    // Identify digital transformation projects
    // Find pain points from public records
    // Map decision makers
  }
}

class MunicipalPersonalizationStrategy implements PersonalizationStrategy {
  async personalize(entity: OutreachEntity): Promise<PersonalizationResult> {
    // Reference specific city initiatives
    // Tailor to government procurement language
    // Highlight ROI and compliance
    // Address pain points with solutions
  }
}
```

---

## Configuration Schema

### Directory Structure
```
$HOME/.config/alygn-outreach/
├── default.json          # Shared configuration
├── vc.json              # VC-specific settings
├── municipal.json       # Municipal-specific settings
├── templates/
│   ├── vc/
│   │   ├── initial.md
│   │   ├── follow-up.md
│   │   └── meeting-request.md
│   └── municipal/
│       ├── initial.md
│       ├── follow-up.md
│       └── rfp-response.md
└── prompts/
    ├── research.txt
    ├── personalize.txt
    └── reply-analysis.txt
```

### default.json
```json
{
  "outreach": {
    "rateLimit": {
      "maxPerDay": 50,
      "delayBetweenMs": 5000,
      "batchSize": 10
    },
    "validation": {
      "checkMxRecords": true,
      "checkDisposable": true,
      "checkRoleBased": true,
      "minConfidenceScore": 0.7
    },
    "sending": {
      "provider": "resend",
      "fromEmail": "andrew@alygn.com",
      "replyTo": "andrew@alygn.com",
      "trackOpens": true,
      "trackClicks": true
    },
    "followUp": {
      "enabled": true,
      "intervalsDays": [3, 7, 14],
      "maxFollowUps": 3
    }
  },
  "storage": {
    "type": "sheets",
    "credentialsPath": "$HOME/.config/alygn-outreach/gcp-credentials.json",
    "spreadsheetId": "1...",
    "worksheetName": "Outreach"
  },
  "llm": {
    "provider": "grok",
    "model": "grok-2",
    "temperature": 0.7,
    "maxTokens": 2000
  },
  "integrations": {
    "crunchbase": {
      "apiKey": "${CRUNCHBASE_API_KEY}"
    },
    "linkedin": {
      "sessionCookie": "${LINKEDIN_SESSION_COOKIE}"
    },
    "apollo": {
      "apiKey": "${APOLLO_API_KEY}"
    }
  }
}
```

### vc.json
```json
{
  "outreach": {
    "targetCriteria": {
      "stages": ["seed", "series-a", "series-b"],
      "sectors": ["fintech", "govtech", "enterprise software", "AI"],
      "checkSizeMin": 100000,
      "checkSizeMax": 5000000,
      "geography": ["North America", "Europe"],
      "excludeCorporate": false
    },
    "discovery": {
      "sources": ["crunchbase", "linkedin", "manual"],
      "prioritizeRecentInvestments": true,
      "daysSinceInvestment": 90
    },
    "research": {
      "scrapeWebsite": true,
      "analyzePortfolio": true,
      "checkRecentNews": true,
      "identifyPartners": true
    },
    "personalization": {
      "referencePortfolioCompanies": true,
      "matchStageFocus": true,
      "highlightTraction": true,
      "mentionFounderBackground": true
    },
    "templates": {
      "initial": {
        "subject": "Alygn - {{personalization.hook}}",
        "body": "templates/vc/initial.md"
      },
      "followUp": {
        "subject": "Re: Alygn - {{personalization.hook}}",
        "body": "templates/vc/follow-up.md"
      }
    }
  }
}
```

### municipal.json
```json
{
  "outreach": {
    "targetCriteria": {
      "populationMin": 50000,
      "populationMax": 500000,
      "governmentTypes": ["city", "county"],
      "regions": ["Southeast", "Southwest", "Midwest"],
      "prioritizeDigitalInitiatives": true,
      "budgetMin": 10000000
    },
    "discovery": {
      "sources": ["census", "municipal-leagues", "conferences", "govtech-vendors"],
      "focusAreas": ["digital transformation", "citizen services", "data analytics"]
    },
    "research": {
      "analyzeInitiatives": true,
      "identifyPainPoints": true,
      "mapDecisionMakers": true,
      "checkProcurementHistory": true
    },
    "personalization": {
      "referenceInitiatives": true,
      "addressPainPoints": true,
      "highlightCompliance": true,
      "showROICalculations": true
    },
    "templates": {
      "initial": {
        "subject": "Streamlining {{entity.name}}'s {{research.topInitiative}}",
        "body": "templates/municipal/initial.md"
      },
      "followUp": {
        "subject": "Re: Streamlining {{entity.name}}'s {{research.topInitiative}}",
        "body": "templates/municipal/follow-up.md"
      }
    }
  }
}
```

---

## Action Pipeline

The unified pipeline processes entities through a series of stages:

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  DISCOVER   │───▶│  VALIDATE   │───▶│  RESEARCH   │───▶│ PERSONALIZE │───▶│    SEND     │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
       │                  │                  │                  │                  │
       ▼                  ▼                  ▼                  ▼                  ▼
  [Type-specific]   [Shared logic]    [Type-specific]    [Type-specific]     [Shared logic]
```

### Pipeline Implementation

```typescript
interface PipelineContext {
  type: 'vc' | 'municipal';
  config: OutreachConfig;
  logger: Logger;
  metrics: MetricsCollector;
}

class OutreachPipeline {
  private strategies: StrategyRegistry;
  private context: PipelineContext;
  
  constructor(context: PipelineContext) {
    this.context = context;
    this.strategies = this.initializeStrategies();
  }
  
  async run(entity: OutreachEntity, startStage?: string): Promise<PipelineResult> {
    const stages = ['discover', 'validate', 'research', 'personalize', 'send'];
    const startIndex = startStage ? stages.indexOf(startStage) : 0;
    
    for (let i = startIndex; i < stages.length; i++) {
      const stage = stages[i];
      const result = await this.executeStage(stage, entity);
      
      if (!result.success) {
        return { success: false, failedAt: stage, error: result.error };
      }
      
      entity = result.entity;
      entity.status = this.stageToStatus(stage);
      await this.saveEntity(entity);
    }
    
    return { success: true, entity };
  }
  
  private async executeStage(stage: string, entity: OutreachEntity): Promise<StageResult> {
    const strategy = this.strategies.get(this.context.type, stage) 
                   || this.strategies.getDefault(stage);
    
    this.context.metrics.increment(`stage.${stage}.attempts`);
    
    try {
      const result = await strategy.execute(entity, this.context.config);
      this.context.metrics.increment(`stage.${stage}.success`);
      return { success: true, entity: result };
    } catch (error) {
      this.context.metrics.increment(`stage.${stage}.failure`);
      return { success: false, error };
    }
  }
  
  private stageToStatus(stage: string): EntityStatus {
    const mapping: Record<string, EntityStatus> = {
      'discover': 'discovered',
      'validate': 'validated',
      'research': 'researched',
      'personalize': 'personalized',
      'send': 'sent'
    };
    return mapping[stage];
  }
}

// Pipeline hooks for extensibility
interface PipelineHooks {
  beforeDiscover?: (query: string) => Promise<void>;
  afterDiscover?: (entities: OutreachEntity[]) => Promise<void>;
  beforeValidate?: (entity: OutreachEntity) => Promise<void>;
  afterValidate?: (entity: OutreachEntity, result: ValidationResult) => Promise<void>;
  beforeResearch?: (entity: OutreachEntity) => Promise<void>;
  afterResearch?: (entity: OutreachEntity, result: ResearchResult) => Promise<void>;
  beforePersonalize?: (entity: OutreachEntity) => Promise<void>;
  afterPersonalize?: (entity: OutreachEntity, result: PersonalizationResult) => Promise<void>;
  beforeSend?: (entity: OutreachEntity) => Promise<void>;
  afterSend?: (entity: OutreachEntity, result: SendingResult) => Promise<void>;
}
```

### Stage Details

#### 1. Discover
- Input: Search query, filters
- Output: Array of `OutreachEntity` objects
- VC: Searches Crunchbase, LinkedIn, portfolio companies
- Municipal: Searches census data, municipal directories

#### 2. Validate
- Input: `OutreachEntity` with email
- Output: Validation result with confidence score
- Shared: Email format, MX records, disposable detection
- Action: Update entity status or flag for manual review

#### 3. Research
- Input: Validated `OutreachEntity`
- Output: Research notes, personalization context
- VC: Firm thesis, portfolio analysis, partner identification
- Municipal: Initiatives, pain points, decision makers

#### 4. Personalize
- Input: Researched `OutreachEntity`
- Output: Personalized email content
- VC: Portfolio references, stage matching, founder background
- Municipal: Initiative alignment, ROI focus, compliance

#### 5. Send
- Input: Personalized `OutreachEntity`
- Output: Sending confirmation with message ID
- Shared: Rate limiting, provider selection, tracking setup
- Action: Update CRM, schedule follow-ups

---

## CLI Interface

### Command Structure

```bash
alygn-outreach --type=<vc|municipal> --action=<action> [options]
```

### Commands

#### Discover
```bash
# Discover new VC firms
alygn-outreach --type=vc --action=discover \
  --query="fintech seed stage" \
  --limit=50 \
  --output=./new-vcs.json

# Discover municipalities
alygn-outreach --type=municipal --action=discover \
  --region=southeast \
  --population-min=100000 \
  --focus="digital transformation" \
  --limit=30
```

#### Validate
```bash
# Validate a single entity
alygn-outreach --type=vc --action=validate \
  --entity-id="vc-123"

# Batch validate from file
alygn-outreach --type=vc --action=validate \
  --input=./new-vcs.json \
  --output=./validated-vcs.json
```

#### Research
```bash
# Research single entity
alygn-outreach --type=vc --action=research \
  --entity-id="vc-123"

# Research all pending
alygn-outreach --type=municipal --action=research \
  --filter-status=validated
```

#### Personalize
```bash
# Generate personalized content
alygn-outreach --type=vc --action=personalize \
  --entity-id="vc-123" \
  --output=./personalized-email.md
```

#### Send
```bash
# Send to single entity
alygn-outreach --type=vc --action=send \
  --entity-id="vc-123" \
  --template=initial

# Batch send with rate limiting
alygn-outreach --type=municipal --action=send \
  --filter-status=personalized \
  --batch-size=10 \
  --dry-run
```

#### Full Pipeline
```bash
# Run full pipeline on new discoveries
alygn-outreach --type=vc --action=pipeline \
  --input=./new-vcs.json \
  --start-stage=validate

# Resume from specific stage
alygn-outreach --type=municipal --action=pipeline \
  --filter-status=researched \
  --start-stage=personalize
```

#### Reply Tracking
```bash
# Check for replies
alygn-outreach --type=vc --action=check-replies

# Update status from reply analysis
alygn-outreach --type=municipal --action=process-replies \
  --since="2024-01-01"
```

#### Analytics
```bash
# View outreach stats
alygn-outreach --type=vc --action=stats \
  --since="2024-01-01" \
  --format=table

# Export pipeline data
alygn-outreach --type=municipal --action=export \
  --status=sent \
  --format=csv
```

### Global Options

```bash
--config, -c          # Config file path (default: $HOME/.config/alygn-outreach/)
--type, -t              # Entity type: vc | municipal
--action, -a            # Action to perform
--verbose, -v           # Enable verbose logging
--dry-run, -d           # Simulate without executing
--output, -o            # Output file path
--input, -i             # Input file path
--limit, -l             # Limit number of entities
--batch-size, -b        # Batch size for operations
--filter-status         # Filter by entity status
--since                 # Filter by date
```

---

## Lobster Integration

### Workflow Integration

Lobster workflows interact with the unified skill through a well-defined interface:

```yaml
# Example Lobster workflow for VC outreach
name: vc-outreach-daily
schedule: "0 9 * * 1-5"  # 9 AM weekdays
tasks:
  - name: discover-vcs
    run: alygn-outreach --type=vc --action=discover --limit=20
    
  - name: validate-new
    run: alygn-outreach --type=vc --action=validate --filter-status=discovered
    
  - name: research-validated
    run: alygn-outreach --type=vc --action=research --filter-status=validated
    
  - name: personalize-researched
    run: alygn-outreach --type=vc --action=personalize --filter-status=researched
    
  - name: send-personalized
    run: alygn-outreach --type=vc --action=send --filter-status=personalized --batch-size=5
    
  - name: check-replies
    run: alygn-outreach --type=vc --action=check-replies
```

### Programmatic API

```typescript
// Skill can be imported and used programmatically
import { UnifiedOutreachSkill } from '@alygn/unified-outreach';

const skill = new UnifiedOutreachSkill({
  type: 'vc',
  configPath: '$HOME/.config/alygn-outreach/'
});

// Run specific pipeline stage
const result = await skill.runPipeline({
  action: 'discover',
  query: 'fintech seed',
  limit: 10
});

// Process single entity through all stages
const entity = await skill.processEntity(entityId, {
  startStage: 'validate',
  skipStages: []
});
```

### Event System

```typescript
// Events emitted during pipeline execution
interface OutreachEvents {
  'entity.discovered': { entities: OutreachEntity[]; source: string };
  'entity.validated': { entity: OutreachEntity; score: number };
  'entity.researched': { entity: OutreachEntity; insights: ResearchInsights };
  'entity.personalized': { entity: OutreachEntity; content: EmailContent };
  'entity.sent': { entity: OutreachEntity; messageId: string };
  'entity.replied': { entity: OutreachEntity; reply: EmailReply };
  'error': { stage: string; error: Error; entity?: OutreachEntity };
}

// Lobster workflows can subscribe to events
skill.on('entity.sent', async (event) => {
  await notifySlack(`Email sent to ${event.entity.name}`);
});
```

---

## Migration Plan

### Phase 1: Foundation (Week 1-2)

1. **Create Unified Structure**
   - Set up new skill directory
   - Implement base entity interfaces
   - Create strategy registry pattern
   - Build configuration loader

2. **Port Shared Components**
   - Extract validation logic from existing scripts
   - Port email sending functionality
   - Migrate rate limiting and tracking
   - Set up storage abstraction (sheets/DB)

### Phase 2: VC Migration (Week 3-4)

1. **Implement VC Strategies**
   - Port discovery logic (Crunchbase, LinkedIn)
   - Port research functionality
   - Port personalization templates
   - Port reply tracking

2. **Test VC Pipeline**
   - Run discovery on limited set
   - Validate pipeline end-to-end
   - Compare outputs with old system
   - Fix discrepancies

3. **Cutover VC**
   - Update Lobster workflows
   - Deprecate old VC scripts
   - Monitor for 1 week

### Phase 3: Municipal Migration (Week 5-6)

1. **Implement Municipal Strategies**
   - Port discovery logic
   - Port research functionality
   - Port personalization templates
   - Port reply tracking

2. **Test Municipal Pipeline**
   - Run discovery on limited set
   - Validate pipeline end-to-end
   - Compare outputs with old system

3. **Cutover Municipal**
   - Update Lobster workflows
   - Deprecate old municipal scripts
   - Monitor for 1 week

### Phase 4: Cleanup (Week 7)

1. **Remove Old Scripts**
   - Archive old VC and municipal code
   - Update documentation
   - Clean up unused dependencies

2. **Documentation**
   - Update SKILL.md
   - Create migration guide for future reference
   - Document breaking changes

### Rollback Plan

```bash
# If issues detected, rollback is simple:
# 1. Revert Lobster workflows to use old scripts
# 2. Keep unified skill code for debugging
# 3. Compare entity states between systems
```

### Migration Checklist

- [ ] Unified skill directory created
- [ ] Base interfaces defined
- [ ] Strategy pattern implemented
- [ ] Configuration schema defined
- [ ] Default strategies working
- [ ] VC strategies ported
- [ ] VC pipeline tested
- [ ] VC Lobster workflows updated
- [ ] Municipal strategies ported
- [ ] Municipal pipeline tested
- [ ] Municipal Lobster workflows updated
- [ ] Old scripts archived
- [ ] Documentation updated
- [ ] Monitoring dashboards updated

---

## Data Model

### Storage Schema

```typescript
// Entity storage format (sheets/csv compatible)
interface EntityRow {
  id: string;
  type: 'vc' | 'municipal';
  name: string;
  email: string;
  website: string;
  city: string;
  state: string;
  country: string;
  status: string;
  priority: string;
  discovered_at: string;  // ISO 8601
  last_updated_at: string;
  outreach_count: number;
  research_notes: string;
  // Type-specific JSON blob
  type_data: string;  // JSON stringified
  // Personalization context
  personalization_context: string;  // JSON stringified
}

// Outreach history
interface OutreachHistoryRow {
  id: string;
  entity_id: string;
  type: 'vc' | 'municipal';
  action: string;
  timestamp: string;
  details: string;  // JSON stringified
  success: boolean;
  error_message?: string;
}

// Reply tracking
interface ReplyRow {
  id: string;
  entity_id: string;
  message_id: string;
  received_at: string;
  subject: string;
  snippet: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  intent: 'meeting' | 'pass' | 'info_request' | 'follow_up' | 'other';
  extracted_data: string;  // JSON stringified
}
```

---

## Testing Strategy

### Unit Tests
```typescript
// Strategy tests
describe('VCDiscoveryStrategy', () => {
  it('should discover firms from Crunchbase', async () => {
    // Mock API responses
    // Test discovery logic
  });
});

describe('DefaultValidationStrategy', () => {
  it('should validate email format', () => {
    // Test validation rules
  });
  
  it('should detect disposable emails', () => {
    // Test disposable detection
  });
});
```

### Integration Tests
```typescript
// Pipeline integration
describe('OutreachPipeline', () => {
  it('should process entity through all stages', async () => {
    // Create test entity
    // Run pipeline
    // Assert final state
  });
});
```

### E2E Tests
```bash
# CLI tests
alygn-outreach --type=vc --action=discover --limit=1 --dry-run
alygn-outreach --type=municipal --action=validate --input=./test-entities.json
```

---

## Monitoring & Observability

### Metrics

```typescript
// Key metrics to track
interface OutreachMetrics {
  // Pipeline metrics
  'pipeline.started': Counter;
  'pipeline.completed': Counter;
  'pipeline.failed': Counter;
  'pipeline.duration': Histogram;
  
  // Stage metrics
  'stage.discover.entities_found': Counter;
  'stage.validate.success_rate': Gauge;
  'stage.research.avg_duration': Histogram;
  'stage.personalize.tokens_used': Counter;
  'stage.send.emails_sent': Counter;
  
  // Entity metrics
  'entities.by_status': Gauge;
  'entities.by_priority': Gauge;
  'entities.replies_received': Counter;
  'entities.meetings_booked': Counter;
  
  // Quality metrics
  'bounce_rate': Gauge;
  'reply_rate': Gauge;
  'positive_reply_rate': Gauge;
}
```

### Logging

```typescript
// Structured logging
{
  "timestamp": "2024-01-15T09:30:00Z",
  "level": "info",
  "component": "OutreachPipeline",
  "type": "vc",
  "action": "discover",
  "entityId": "vc-123",
  "message": "Discovered 3 new firms",
  "metadata": {
    "query": "fintech seed",
    "results": 3,
    "duration": 2500
  }
}
```

---

## Security Considerations

### Data Protection
- API keys stored in environment variables
- No credentials in config files
- Email content encryption at rest
- Access controls on storage

### Rate Limiting
- Respect external API limits
- Configurable per-provider limits
- Exponential backoff on failures

### Compliance
- CAN-SPAM compliance for emails
- GDPR considerations for EU contacts
- Opt-out handling

---

## Appendix

### A. Type-Specific Field Reference

**VC Fields:**
- `firmType`: vc, angel, corporate, accelerator
- `stageFocus`: pre-seed, seed, series-a, series-b, growth
- `sectorFocus`: Array of sector strings
- `checkSizeMin/Max`: Dollar amounts
- `aum`: Assets under management
- `partners`: Array of partner objects
- `portfolioCompanies`: Array of company names
- `recentInvestments`: Array with date, amount, stage

**Municipal Fields:**
- `governmentType`: city, county, state, regional
- `population`: Number of residents
- `budget`: Annual budget in dollars
- `departments`: Array with name, head, focus
- `keyContacts`: Array of contact objects
- `initiatives`: Array of initiative objects
- `painPoints`: Array of pain point strings
- `decisionMakers`: Array with name, title, influence

### B. Template Variables

**Available in all templates:**
- `{{entity.name}}`
- `{{entity.location.city}}`
- `{{entity.location.state}}`
- `{{research.notes}}`

**VC-specific:**
- `{{vc.stageFocus}}`
- `{{vc.recentInvestment}}`
- `{{vc.partner.name}}`
- `{{vc.portfolioCompany}}`

**Municipal-specific:**
- `{{municipal.initiative}}`
- `{{municipal.painPoint}}`
- `{{municipal.department}}`
- `{{municipal.decisionMaker}}`

### C. Error Codes

| Code | Description | Retryable |
|------|-------------|-----------|
| `DISCOVER_API_ERROR` | External API failure | Yes |
| `VALIDATION_INVALID_EMAIL` | Email validation failed | No |
| `VALIDATION_MX_FAILED` | MX record check failed | Yes |
| `RESEARCH_TIMEOUT` | Research took too long | Yes |
| `PERSONALIZE_LLM_ERROR` | LLM generation failed | Yes |
| `SEND_RATE_LIMITED` | Rate limit hit | Yes |
| `SEND_PROVIDER_ERROR` | Email provider error | Yes |
| `STORAGE_WRITE_ERROR` | Failed to save entity | Yes |

---

## Conclusion

This unified skill design consolidates VC and municipal outreach into a single, maintainable system. The strategy pattern allows type-specific behaviors while sharing core infrastructure. The migration plan ensures a smooth transition from existing scripts with rollback capability.

**Next Steps:**
1. Review design with stakeholders
2. Create implementation tickets
3. Set up development environment
4. Begin Phase 1 implementation
