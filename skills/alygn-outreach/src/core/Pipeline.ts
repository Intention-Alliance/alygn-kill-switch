/**
 * Pipeline - Orchestrates the outreach pipeline stages
 * discover → validate → research → personalize → send
 */
import fs from 'fs';
import path from 'path';
import { traceOperation } from './tracing-utils';
import { MunicipalEntity } from '../entities/MunicipalEntity';
import { OutreachEntity } from '../entities/OutreachEntity';
import { VCEntity } from '../entities/VCEntity';
import { StrategyRegistry } from '../strategies/StrategyRegistry';
import { MunicipalDiscoveryStrategy } from '../strategies/discovery/MunicipalDiscoveryStrategy';
import { VCDiscoveryStrategy } from '../strategies/discovery/VCDiscoveryStrategy';
import { MunicipalPersonalizationStrategy } from '../strategies/personalization/MunicipalPersonalizationStrategy';
import { VCPersonalizationStrategy } from '../strategies/personalization/VCPersonalizationStrategy';
import { MunicipalResearchStrategy } from '../strategies/research/MunicipalResearchStrategy';
import { VCResearchStrategy } from '../strategies/research/VCResearchStrategy';
import { SendingStrategy } from '../strategies/sending/SendingStrategy';
import { ValidationStrategy } from '../strategies/validation/ValidationStrategy';

interface PipelineOptions {
  dryRun?: boolean;
  limit?: number;
  region?: string | null;
  input?: string | null;
  draftStatus?: string;
  sendToList?: string[];
  deepResearch?: boolean;
}

interface RunOptions {
  dryRun: boolean;
  limit: number;
  region?: string | null;
  input?: string | null;
  deepResearch?: boolean;
}

interface StageResult {
  action: string;
  dryRun?: boolean;
  discovered?: number;
  validated?: number;
  researched?: number;
  personalized?: number;
  sent?: number;
  failed?: number;
  results: Array<Record<string, unknown>>;
  stateFile?: string;
  skipped?: boolean;
  reason?: string;
}

interface EntityData {
  type?: string;
  [key: string]: unknown;
}

export class Pipeline {
  type: 'vc' | 'municipal';
  config: Record<string, unknown>;
  registry: StrategyRegistry;
  entities: OutreachEntity[];
  phase: string | null;

  constructor(type: 'vc' | 'municipal', config: Record<string, unknown> = {}) {
    this.type = type;
    this.config = config;
    this.registry = new StrategyRegistry();
    this.entities = [];
    this.phase = null;
    
    this.initializeStrategies();
  }
  
  /**
   * Initialize all strategies
   */
  initializeStrategies(): void {
    // Discovery strategies
    this.registry.register('vc', 'discover', new VCDiscoveryStrategy(this.config.discovery as Record<string, unknown>));
    this.registry.register('municipal', 'discover', new MunicipalDiscoveryStrategy(this.config.discovery as Record<string, unknown>));
    
    // Validation strategy (shared)
    this.registry.register('default', 'validate', new ValidationStrategy(this.config.validation as Record<string, unknown>));
    
    // Research strategies
    this.registry.register('vc', 'research', new VCResearchStrategy(this.config.research as Record<string, unknown>));
    this.registry.register('municipal', 'research', new MunicipalResearchStrategy(this.config.research as Record<string, unknown>));
    
    // Personalization strategies
    this.registry.register('vc', 'personalize', new VCPersonalizationStrategy(this.config.personalization as Record<string, unknown>));
    this.registry.register('municipal', 'personalize', new MunicipalPersonalizationStrategy(this.config.personalization as Record<string, unknown>));
    
    // Sending strategy (shared)
    this.registry.register('default', 'send', new SendingStrategy(this.config.sending as Record<string, unknown>));
  }
  
  /**
   * Get state file path
   */
  getStateFilePath(phase: string): string {
    const timestamp = new Date().toISOString().split('T')[0];
    const stateSubFolder = this.getStateSubFolder(phase);
    
    // For VC researched phase, save to vc-waves folder with expected naming
    if (this.type === 'vc' && phase === 'researched') {
      return `${process.env.HOME}/.openclaw/workspace/reports/alygn/vc-waves/${timestamp}.json`;
    }
    
    return `${process.env.HOME}/.openclaw/workspace/reports/alygn/${stateSubFolder}/alygn-${this.type}-${phase}-${timestamp}.json`;
  }

  /**
   * Get the state sub-folder according to the DEPLOYMENT.md
   */
  getStateSubFolder(phase: string): string {
    const subFolderType = this.type === 'vc' ? 'vc' : 'muni';
    switch (phase) {
      case 'discovered':
        return  `${subFolderType}-discover`;
      case 'validated':
        return `${subFolderType}-validate`;
      case 'researched':
        return `${subFolderType}-research`;
      case 'personalized':
        return `${subFolderType}-personalize`;
      case 'sent':
        return `${subFolderType}-sent`;
      default:
        console.warn('   ⚠️  Unknown phase for state file naming, using generic format [NOTE: This may not match DEPLOYMENT.md structure and may fail to load in later stages]');
        return `${subFolderType}-${phase}`;
    }
  }
  
  /**
   * Get wave-state.json path for this pipeline type
   */
  getWaveStatePath(): string {
    const subFolder = this.type === 'vc' ? 'vc-waves' : 'muni-waves';
    return `${process.env.HOME}/.openclaw/workspace/reports/alygn/${subFolder}/wave-state.json`;
  }

  /**
   * Save state to file and update wave-state.json
   */
  saveState(phase: string, data: Record<string, unknown>): string {
    const filePath = this.getStateFilePath(phase);
    const stateContent = {
      timestamp: new Date().toISOString(),
      type: this.type,
      phase,
      data
    };
    fs.writeFileSync(filePath, JSON.stringify(stateContent, null, 2));

    // Also update wave-state.json with entity data (preserves typeData across phases)
    this.updateWaveState(data);

    return filePath;
  }

  /**
   * Update wave-state.json with current entity data
   * This ensures typeData and other in-memory changes are persisted
   * to the canonical state file used by sending and other stages.
   */
  updateWaveState(data: Record<string, unknown>): void {
    const waveStatePath = this.getWaveStatePath();
    const entities = data.entities as Array<Record<string, unknown>> | undefined;
    if (!entities || entities.length === 0) return;

    // Serialize entities properly (handles class instances with toJSON)
    const serializedEntities = entities.map(e => {
      if (typeof (e as any).toJSON === 'function') {
        return (e as any).toJSON();
      }
      return e;
    });

    try {
      let waveState: Record<string, unknown>;

      if (fs.existsSync(waveStatePath)) {
        // Merge: update existing entities by ID, add new ones
        const existing = JSON.parse(fs.readFileSync(waveStatePath, 'utf8'));
        const existingEntities = ((existing as Record<string, unknown>).data as Record<string, unknown>)?.entities as Array<Record<string, unknown>> || [];

        // Build lookup by ID
        const entityMap = new Map<string, Record<string, unknown>>();
        for (const e of existingEntities) {
          if (e.id) entityMap.set(e.id as string, e);
        }

        // Update with new data (preserves typeData from research)
        for (const e of serializedEntities) {
          if (e.id) entityMap.set(e.id as string, e);
        }

        waveState = {
          ...existing,
          timestamp: new Date().toISOString(),
          phase: (data as Record<string, unknown>).phase || (existing as Record<string, unknown>).phase,
          data: {
            ...((existing as Record<string, unknown>).data as Record<string, unknown>),
            entities: Array.from(entityMap.values())
          }
        };
      } else {
        // Create new wave-state.json
        const dir = path.dirname(waveStatePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        waveState = {
          timestamp: new Date().toISOString(),
          type: this.type,
          phase: 'discovered',
          data: { entities: serializedEntities }
        };
      }

      fs.writeFileSync(waveStatePath, JSON.stringify(waveState, null, 2));
      console.log(`   💾 Updated wave-state.json (${serializedEntities.length} entities)`);
    } catch (error) {
      console.warn(`   ⚠️  Failed to update wave-state.json: ${(error as Error).message}`);
    }
  }
  
  /**
   * Load state from file
   */
  loadState(filePath: string): { timestamp: string; type: string; phase: string; data: Record<string, unknown> } | null {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      console.error(`Failed to load state: ${(error as Error).message}`);
      return null;
    }
  }
  
  /**
   * Load latest state for type
   */
  loadLatestState(phase: string): { timestamp: string; type: string; phase: string; data: Record<string, unknown> } | null {
    const pattern = new RegExp(`alygn-${this.type}-${phase}-.*\\.json$`);
    const tmpDir = '/tmp';
    
    let files: string[] = [];
    try {
      files = fs.readdirSync(tmpDir)
        .filter(f => pattern.test(f))
        .map(f => path.join(tmpDir, f))
        .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    } catch {
      // Directory may not exist or be readable
    }
    
    if (files.length === 0) {
      return null;
    }
    
    return this.loadState(files[0]);
  }
  
  /**
   * Run pipeline action
   */
  async run(action: string, options: PipelineOptions = {}): Promise<StageResult> {
    const { dryRun = false, limit = 20, region = null, input = null, deepResearch = false } = options;
    
    console.log(`\n🚀 Running ${this.type.toUpperCase()} pipeline: ${action}`);
    console.log(`   Dry run: ${dryRun ? 'YES' : 'NO'}`);
    console.log(`   Limit: ${limit}`);
    if (region) console.log(`   Region: ${region}`);
    console.log('');
    
    switch (action) {
      case 'discover':
        return await this.runDiscover({ dryRun, limit, region, deepResearch });
        
      case 'validate':
        return await this.runValidate({ dryRun, limit, input });
        
      case 'research':
        return await this.runResearch({ dryRun, limit, input, deepResearch });
        
      case 'personalize':
        return await this.runPersonalize({ dryRun, limit, input });
        
      case 'send':
        return await this.runSend({ dryRun, limit, input, draftStatus: options.draftStatus, sendToList: options.sendToList });
        
      case 'pipeline':
        return await this.runFullPipeline({ dryRun, limit, region, input, deepResearch }) as StageResult;
        
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }
  
  /**
   * Run discovery stage
   */
  async runDiscover(options: { dryRun: boolean; limit: number; region?: string | null; deepResearch?: boolean }): Promise<StageResult> {
    const { dryRun, limit, region, deepResearch } = options;
    const strategy = this.registry.get(this.type, 'discover') as { discover: (query: string, opts: Record<string, unknown>) => Promise<OutreachEntity[]> };
    
    const query = this.type === 'vc' 
      ? 'AI safety venture capital'
      : (region === 'costa-rica' ? 'costa-rica-cantones' : 'municipal government');
    
    const discoverOpts: Record<string, unknown> = { dryRun, limit, region };
    if (deepResearch) {
      discoverOpts.deepResearch = true;
      console.log(`   🔬 Deep research enabled for discovery (Perplexity + Firecrawl + web search)`);
    }
    
    const discovered = await traceOperation(
      'pipeline.discover',
      async () => strategy.discover(query, discoverOpts),
      { entity_type: this.type, limit, dryRun: String(dryRun), region: region ?? 'global', deepResearch: String(!!deepResearch) }
    );
    this.entities = discovered;
    
    const stateFile = this.saveState('discovered', {
      count: discovered.length,
      entities: discovered.map(e => e.toJSON())
    });
    
    return {
      action: 'discover',
      dryRun,
      discovered: discovered.length,
      results: discovered.map(e => ({
        id: e.id,
        name: e.name,
        email: e.email,
        website: e.website
      })),
      stateFile
    };
  }
  
  /**
   * Create proper entity instance from plain data
   */
  createEntityFromData(data: EntityData): OutreachEntity | null {
    if (!data) return null;
    
    const entityType = (data.type as string) || this.type;
    
    if (entityType === 'vc') {
      return VCEntity.fromJSON(data);
    } else if (entityType === 'municipal') {
      return MunicipalEntity.fromJSON(data);
    } else {
      return new OutreachEntity(data as Parameters<typeof OutreachEntity>[0]);
    }
  }

  /**
   * Run validation stage
   */
  async runValidate(options: { dryRun: boolean; limit: number; input?: string | null }): Promise<StageResult> {
    const { dryRun, limit, input } = options;
    
    let entities = this.entities;
    if (input) {
      const state = this.loadState(input);
      const stateEntities = state?.data?.entities as EntityData[] | undefined;
      entities = stateEntities?.map((e: EntityData) => this.createEntityFromData(e)).filter((e): e is OutreachEntity => e !== null) || [];
    } else if (entities.length === 0) {
      const state = this.loadLatestState('validated');
      const stateEntities = state?.data?.entities as EntityData[] | undefined;
      entities = stateEntities?.map((e: EntityData) => this.createEntityFromData(e)).filter((e): e is OutreachEntity => e !== null) || [];
    }
    
    entities = entities.slice(0, limit);
    
    if (dryRun) {
      console.log(`[DRY RUN] Would validate ${entities.length} entities`);
      
      const results = entities.map(e => ({
        name: e.name,
        email: e.email,
        wouldValidate: true,
        result: e.email ? 'valid' : 'no_email'
      }));
      
      const stateFile = this.saveState('validated', {
        count: entities.length,
        entities: entities,
        results
      });
      
      return {
        action: 'validate',
        dryRun: true,
        validated: entities.length,
        results,
        stateFile
      };
    }
    
    const strategy = this.registry.get('default', 'validate') as { validate: (entity: OutreachEntity) => Promise<Record<string, unknown>> };
    const results: Array<Record<string, unknown>> = [];
    
    for (const entity of entities) {
      await traceOperation(
        'pipeline.validate',
        async () => {
          const result = await strategy.validate(entity);
          results.push({
            name: entity.name,
            email: entity.email,
            result: result.result,
            confidence: result.confidence
          });
        },
        { entity_name: entity.name, entity_type: entity.type }
      );
    }
    
    this.entities = entities;
    
    const stateFile = this.saveState('validated', {
      count: entities.length,
      entities: entities.map(e => e.toJSON()),
      results
    });
    
    return {
      action: 'validate',
      validated: entities.length,
      results,
      stateFile
    };
  }
  
  /**
   * Run research stage
   */
  async runResearch(options: { dryRun: boolean; limit: number; input?: string | null; deepResearch?: boolean }): Promise<StageResult> {
    const { dryRun, limit, input, deepResearch } = options;
    
    let entities = this.entities;
    if (input) {
      const state = this.loadState(input);
      const stateEntities = state?.data?.entities as EntityData[] | undefined;
      entities = stateEntities?.map((e: EntityData) => this.createEntityFromData(e)).filter((e): e is OutreachEntity => e !== null) || [];
    } else if (entities.length === 0) {
      const state = this.loadLatestState('validated');
      const stateEntities = state?.data?.entities as EntityData[] | undefined;
      entities = stateEntities?.map((e: EntityData) => this.createEntityFromData(e)).filter((e): e is OutreachEntity => e !== null) || [];
    }
    
    entities = entities.slice(0, limit);
    
    const strategy = this.registry.get(this.type, 'research') as { 
      research: (entity: OutreachEntity, opts?: Record<string, unknown>) => Promise<{ success: boolean; research?: Record<string, unknown>; entity?: OutreachEntity; error?: string }>; 
      researchDryRun?: (entity: OutreachEntity, opts?: Record<string, unknown>) => Promise<{ success: boolean; research?: Record<string, unknown>; entity?: OutreachEntity; error?: string }> 
    };
    const results: Array<Record<string, unknown>> = [];
    const researchOpts: Record<string, unknown> = {};
    if (deepResearch) {
      researchOpts.deepResearch = true;
      console.log(`   🔬 Deep research enabled (Perplexity + Firecrawl + web search)`);
    }
    
    for (let i = 0; i < entities.length; i++) {
      const entity = entities[i];
      const wrapped = await traceOperation(
        'pipeline.research',
        async () => {
          if (dryRun && strategy.researchDryRun) {
            return strategy.researchDryRun(entity, researchOpts);
          }
          return strategy.research(entity, researchOpts);
        },
        { entity_name: entity.name, entity_type: this.type, dryRun: String(dryRun), deepResearch: String(!!deepResearch) }
      );
      results.push(wrapped);
      if (wrapped.entity) {
        entities[i] = wrapped.entity;
      }
    }
    
    this.entities = entities;
    
    const stateFile = this.saveState('researched', {
      count: entities.length,
      entities: entities,
      results
    });
    
    return {
      action: 'research',
      dryRun,
      researched: entities.length,
      results: results.map((r, i) => ({
        name: entities[i]?.name || 'Unknown',
        success: r.success !== false
      })),
      stateFile
    };
  }
  
  /**
   * Check if entity was already sent
   * TWO-VERIFICATION SYSTEM:
   * 1. Check local SentEmailTracker
   * 2. Check Supabase database (for municipalities)
   */
  async wasAlreadySent(entity: OutreachEntity): Promise<boolean> {
    if (!entity.email) return false;
    
    // Verification 1: Check local SentEmailTracker
    try {
      const { SentEmailTracker } = await import('../lib/SentEmailTracker');
      const tracker = new SentEmailTracker();
      const existing = tracker.getSentEntry(entity.email, '', entity.type);
      if (existing) {
        console.log(`   ⚠️  Skipping ${entity.name}: Already sent on ${new Date(existing.sentAt || '').toLocaleDateString()} (local tracker)`);
        return true;
      }
    } catch { /* ignore */ }
    
    // Verification 2: Check Supabase (for municipalities)
    if (entity.type === 'municipal') {
      try {
        // Load credentials
        const credentialsPath = path.join(process.env.HOME || '', '.openclaw/workspace/config/credentials.json');
        if (fs.existsSync(credentialsPath)) {
          const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
          if (credentials?.supabase?.url && credentials?.supabase?.key) {
            const { createClient } = await import('@supabase/supabase-js');
            const supabase = createClient(credentials.supabase.url, credentials.supabase.key);
            
            // Check municipalities table
            const { data, error } = await supabase
              .from('municipalities')
              .select('name, outreach_sent_at')
              .eq('mayor_email', entity.email)
              .not('outreach_sent_at', 'is', null)
              .maybeSingle();
            
            if (!error && data?.outreach_sent_at) {
              console.log(`   ⚠️  Skipping ${entity.name}: Already sent on ${new Date(data.outreach_sent_at).toLocaleDateString()} (Supabase)`);
              return true;
            }
          }
        }
      } catch { /* ignore */ }
    }
    
    return false;
  }

  /**
   * Run personalization stage
   */
  async runPersonalize(options: { dryRun: boolean; limit: number; input?: string | null }): Promise<StageResult> {
    const { dryRun, limit, input } = options;
    
    let entities = this.entities;
    if (input) {
      const state = this.loadState(input);
      const stateEntities = state?.data?.entities as EntityData[] | undefined;
      entities = stateEntities?.map((e: EntityData) => this.createEntityFromData(e)).filter((e): e is OutreachEntity => e !== null) || [];
    } else if (entities.length === 0) {
      const state = this.loadLatestState('researched');
      const stateEntities = state?.data?.entities as EntityData[] | undefined;
      entities = stateEntities?.map((e: EntityData) => this.createEntityFromData(e)).filter((e): e is OutreachEntity => e !== null) || [];
    }
    
    entities = entities.slice(0, limit);
    
    // Filter out already-sent entities
    entities = await this.filterAlreadySent(entities);
    
    if (entities.length === 0) {
      console.log('⚠️  No entities remaining after duplicate filter (personalize stage)');
      this.entities = [];
      return {
        action: 'personalize',
        dryRun,
        personalized: 0,
        skipped: true,
        reason: 'All entities already sent',
        results: []
      };
    }
    
    const strategy = this.registry.get(this.type, 'personalize') as { 
      personalize: (entity: OutreachEntity) => Promise<{ success: boolean; subject?: string; entity?: OutreachEntity; error?: string }>; 
      personalizeDryRun?: (entity: OutreachEntity) => Promise<{ success: boolean; subject?: string; entity?: OutreachEntity; error?: string }> 
    };
    const results: Array<Record<string, unknown>> = [];
    
    for (const entity of entities) {
      const wrapped = await traceOperation(
        'pipeline.personalize',
        async () => {
          if (dryRun && strategy.personalizeDryRun) {
            return strategy.personalizeDryRun(entity);
          }
          return strategy.personalize(entity);
        },
        { entity_name: entity.name, entity_type: this.type, dryRun: String(dryRun) }
      );
      results.push(wrapped);
    }
    
    this.entities = entities;
    
    const stateFile = this.saveState('personalized', {
      count: entities.length,
      entities: entities,
      results
    });
    
    return {
      action: 'personalize',
      dryRun,
      personalized: entities.length,
      results: results.map(r => ({
        name: (r.entity as OutreachEntity)?.name,
        subject: r.subject,
        success: r.success
      })),
      stateFile
    };
  }
  
  /**
   * Filter out already-sent entities
   */
  async filterAlreadySent(entities: OutreachEntity[]): Promise<OutreachEntity[]> {
    const filtered: OutreachEntity[] = [];
    
    for (const entity of entities) {
      const alreadySent = await this.wasAlreadySent(entity);
      if (!alreadySent) {
        filtered.push(entity);
      }
    }
    
    const skipped = entities.length - filtered.length;
    if (skipped > 0) {
      console.log(`   ℹ️  Filtered out ${skipped} already-sent entities`);
    }
    
    return filtered;
  }

  /**
   * Run send stage
   */
  async runSend(options: { dryRun: boolean; limit: number; input?: string | null; draftStatus?: string; sendToList?: string[] }): Promise<StageResult> {
    // For municipalities, use 'Not drafted' as default since they don't go through Notion approval
    const defaultDraftStatus = this.type === 'municipal' ? 'Not drafted' : 'Approved';
    const { dryRun, limit, input, draftStatus = defaultDraftStatus, sendToList = [] } = options;
    
    let entities = this.entities;
    if (input) {
      const state = this.loadState(input);
      const stateEntities = state?.data?.entities as EntityData[] | undefined;
      entities = stateEntities?.map((e: EntityData) => this.createEntityFromData(e)).filter((e): e is OutreachEntity => e !== null) || [];
    } else if (entities.length === 0) {
      const state = this.loadLatestState('personalized');
      const stateEntities = state?.data?.entities as EntityData[] | undefined;
      entities = stateEntities?.map((e: EntityData) => this.createEntityFromData(e)).filter((e): e is OutreachEntity => e !== null) || [];
    }
    
    // Filter out already-sent entities
    entities = await this.filterAlreadySent(entities);
    entities = entities.slice(0, limit);
    
    if (entities.length === 0) {
      console.log('⚠️  No entities remaining after duplicate filter');
      return {
        action: 'send',
        dryRun,
        sent: 0,
        failed: 0,
        skipped: true,
        reason: 'All entities already sent',
        results: []
      };
    }
    
    const strategy = this.registry.get('default', 'send') as { send: (entity: OutreachEntity, opts: Record<string, unknown>) => Promise<Record<string, unknown>> };
    const results: Array<Record<string, unknown>> = [];
    
    for (const entity of entities) {
      await traceOperation(
        'pipeline.send',
        async () => {
          const result = await strategy.send(entity, { dryRun, draftStatus, sendToList });
          results.push(result);
        },
        { entity_name: entity.name, entity_email: entity.email ?? '', entity_type: entity.type, dryRun: String(dryRun) }
      );
    }
    
    const stateFile = this.saveState('sent', {
      count: entities.length,
      entities: entities,
      results
    });
    
    return {
      action: 'send',
      dryRun,
      sent: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results,
      stateFile
    };
  }
  
  /**
   * Run full pipeline
   */
  async runFullPipeline(options: { dryRun: boolean; limit: number; region?: string | null; input?: string | null; deepResearch?: boolean }): Promise<Record<string, unknown>> {
    const { dryRun, limit, region, input, deepResearch } = options;
    const useDirectApi = process.env.USE_DIRECT_API === 'true';
    const isModeB = dryRun && useDirectApi;
    
    console.log(`\n🔄 Running full pipeline (${this.type})`);
    console.log(`   Mode: ${isModeB ? '🚀 MODE B (Dry-Run + Direct API)' : (dryRun ? '📝 Dry-Run' : '⚡ Production')}\n`);
    
    const results: Record<string, unknown> = {
      dryRun,
      type: this.type,
      mode: isModeB ? 'dry-run-direct-api' : (dryRun ? 'dry-run' : 'production'),
      stages: {},
      summary: {
        discovered: 0,
        validated: 0,
        researched: 0,
        personalized: 0,
        sent: 0
      }
    };
    
    // Mode B: Show enhanced header
    if (isModeB) {
      console.log('   ╔══════════════════════════════════════════════════════════╗');
      console.log('   ║  MODE B: API calls + DB simulation + Discord reporting   ║');
      console.log('   ╚══════════════════════════════════════════════════════════╝\n');
    }
    
    // 1. Discover
    const discoverResult = await this.runDiscover({ dryRun, limit, region, deepResearch });
    (results.stages as Record<string, unknown>).discover = discoverResult;
    (results.summary as Record<string, number>).discovered = discoverResult.discovered || 0;
    
    // 2. Validate
    const validateResult = await this.runValidate({ dryRun, limit });
    (results.stages as Record<string, unknown>).validate = validateResult;
    (results.summary as Record<string, number>).validated = validateResult.validated || 0;
    
    // 3. Research
    const researchResult = await this.runResearch({ dryRun, limit, deepResearch });
    (results.stages as Record<string, unknown>).research = researchResult;
    (results.summary as Record<string, number>).researched = researchResult.researched || 0;
    
    // 4. Personalize
    const personalizeResult = await this.runPersonalize({ dryRun, limit });
    (results.stages as Record<string, unknown>).personalize = personalizeResult;
    (results.summary as Record<string, number>).personalized = personalizeResult.personalized || 0;
    
    // 5. Send
    const sendResult = await this.runSend({ dryRun, limit });
    (results.stages as Record<string, unknown>).send = sendResult;
    (results.summary as Record<string, number>).sent = sendResult.sent || 0;
    
    // Save full pipeline state
    const stateFile = this.saveState('pipeline', results);
    (results as Record<string, unknown>).stateFile = stateFile;
    
    return results;
  }
}

export default Pipeline;
