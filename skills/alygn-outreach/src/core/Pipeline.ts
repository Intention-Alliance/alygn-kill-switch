/**
 * Pipeline - Orchestrates the outreach pipeline stages
 * discover → validate → research → personalize → send
 */
import fs from 'fs';
import path from 'path';
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
   * Save state to file
   */
  saveState(phase: string, data: Record<string, unknown>): string {
    const filePath = this.getStateFilePath(phase);
    fs.writeFileSync(filePath, JSON.stringify({
      timestamp: new Date().toISOString(),
      type: this.type,
      phase,
      data
    }, null, 2));
    return filePath;
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
    const { dryRun = false, limit = 20, region = null, input = null } = options;
    
    console.log(`\n🚀 Running ${this.type.toUpperCase()} pipeline: ${action}`);
    console.log(`   Dry run: ${dryRun ? 'YES' : 'NO'}`);
    console.log(`   Limit: ${limit}`);
    if (region) console.log(`   Region: ${region}`);
    console.log('');
    
    switch (action) {
      case 'discover':
        return await this.runDiscover({ dryRun, limit, region });
        
      case 'validate':
        return await this.runValidate({ dryRun, limit, input });
        
      case 'research':
        return await this.runResearch({ dryRun, limit, input });
        
      case 'personalize':
        return await this.runPersonalize({ dryRun, limit, input });
        
      case 'send':
        return await this.runSend({ dryRun, limit, input, draftStatus: options.draftStatus, sendToList: options.sendToList });
        
      case 'pipeline':
        return await this.runFullPipeline({ dryRun, limit, region, input }) as StageResult;
        
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }
  
  /**
   * Run discovery stage
   */
  async runDiscover(options: { dryRun: boolean; limit: number; region?: string | null }): Promise<StageResult> {
    const { dryRun, limit, region } = options;
    const strategy = this.registry.get(this.type, 'discover') as { discover: (query: string, opts: Record<string, unknown>) => Promise<OutreachEntity[]> };
    
    const query = this.type === 'vc' 
      ? 'AI safety venture capital'
      : (region === 'costa-rica' ? 'costa-rica-cantones' : 'municipal government');
    
    const discovered = await strategy.discover(query, { dryRun, limit, region });
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
      const result = await strategy.validate(entity);
      results.push({
        name: entity.name,
        email: entity.email,
        result: result.result,
        confidence: result.confidence
      });
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
  async runResearch(options: { dryRun: boolean; limit: number; input?: string | null }): Promise<StageResult> {
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
    
    const strategy = this.registry.get(this.type, 'research') as { 
      research: (entity: OutreachEntity) => Promise<{ success: boolean; research?: Record<string, unknown>; entity?: OutreachEntity; error?: string }>; 
      researchDryRun?: (entity: OutreachEntity) => Promise<{ success: boolean; research?: Record<string, unknown>; entity?: OutreachEntity; error?: string }> 
    };
    const results: Array<Record<string, unknown>> = [];
    
    for (const entity of entities) {
      let result: { success: boolean; research?: Record<string, unknown>; entity?: OutreachEntity; error?: string };
      if (dryRun && strategy.researchDryRun) {
        result = await strategy.researchDryRun(entity);
      } else {
        result = await strategy.research(entity);
      }
      results.push(result);
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
   */
  async wasAlreadySent(entity: OutreachEntity): Promise<boolean> {
    if (!entity.email) return false;
    
    try {
      // Use local SentEmailTracker
      const { SentEmailTracker } = await import('../lib/SentEmailTracker');
      const tracker = new SentEmailTracker();
      const existing = tracker.getSentEntry(entity.email, '', entity.type);
      if (existing) {
        console.log(`   ⚠️  Skipping ${entity.name}: Already sent on ${new Date(existing.sentAt || '').toLocaleDateString()}`);
        return true;
      }
    } catch { /* ignore */ }
    
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
      let result: { success: boolean; subject?: string; entity?: OutreachEntity; error?: string };
      if (dryRun && strategy.personalizeDryRun) {
        result = await strategy.personalizeDryRun(entity);
      } else {
        result = await strategy.personalize(entity);
      }
      results.push(result);
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
    const { dryRun, limit, input, draftStatus = 'Approved', sendToList = [] } = options;
    
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
      const result = await strategy.send(entity, { dryRun, draftStatus, sendToList });
      results.push(result);
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
  async runFullPipeline(options: { dryRun: boolean; limit: number; region?: string | null; input?: string | null }): Promise<Record<string, unknown>> {
    const { dryRun, limit, region, input } = options;
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
    const discoverResult = await this.runDiscover({ dryRun, limit, region });
    (results.stages as Record<string, unknown>).discover = discoverResult;
    (results.summary as Record<string, number>).discovered = discoverResult.discovered || 0;
    
    // 2. Validate
    const validateResult = await this.runValidate({ dryRun, limit });
    (results.stages as Record<string, unknown>).validate = validateResult;
    (results.summary as Record<string, number>).validated = validateResult.validated || 0;
    
    // 3. Research
    const researchResult = await this.runResearch({ dryRun, limit });
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
