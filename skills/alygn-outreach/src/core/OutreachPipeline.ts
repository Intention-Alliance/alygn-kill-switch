/**
 * OutreachPipeline - Unified pipeline for processing outreach entities
 */
import { StrategyRegistry } from '../strategies/StrategyRegistry.js';
import type { OutreachEntity } from '../entities/OutreachEntity.js';

/**
 * @typedef {'discover'|'validate'|'research'|'personalize'|'send'} PipelineStage
 */

/**
 * @typedef {Object} PipelineContext
 * @property {'vc'|'municipal'} type
 * @property {Object} config
 * @property {Object} [logger]
 * @property {Object} [metrics]
 * @property {boolean} [dryRun]
 */

export type PipelineContext = {
  type: 'vc' | 'municipal';
  config: Record<string, unknown>;
  logger?: Console;
  metrics?: Record<string, unknown>;
  dryRun?: boolean;
};

export class OutreachPipeline {
  context: PipelineContext;
  strategies: StrategyRegistry;

  constructor(context: PipelineContext) {
    this.context = context;
    this.strategies = new StrategyRegistry();
    this.initializeDefaultStrategies();
  }

  /**
   * Initialize default strategies
   */
  initializeDefaultStrategies(): void {
    // Will be populated when strategies are registered
  }

  /**
   * Register a strategy for this pipeline
   */
  registerStrategy(action: string, strategy: unknown, isDefault = false): void {
    if (isDefault) {
      this.strategies.registerDefault(action, strategy);
    } else {
      this.strategies.register(this.context.type, action, strategy);
    }
  }

  /**
   * Get strategy for action
   */
  getStrategy(action: string): unknown | undefined {
    return this.strategies.get(this.context.type, action);
  }

  /**
   * Map stage name to entity status
   */
  stageToStatus(stage: string): string {
    const mapping: Record<string, string> = {
      'discover': 'discovered',
      'validate': 'validated',
      'research': 'researched',
      'personalize': 'personalized',
      'send': 'sent'
    };
    return mapping[stage] || stage;
  }

  /**
   * Execute a single stage
   */
  async executeStage(stage: string, entity: OutreachEntity): Promise<{ success: boolean; error?: string; duration?: number }> {
    const strategy = this.getStrategy(stage);
    
    if (!strategy) {
      return { success: false, error: `No strategy registered for stage: ${stage}` };
    }

    const startTime = Date.now();
    
    try {
      let result: { success: boolean; entities?: OutreachEntity[]; validation?: Record<string, unknown>; error?: string };
      
      switch (stage) {
        case 'discover': {
          const discoverStrategy = strategy as { discover: (query: string, options: Record<string, unknown>) => Promise<{ success: boolean; entities: OutreachEntity[] }> };
          const discoverResult = await discoverStrategy.discover('', { limit: 1 });
          result = {
            success: discoverResult.success,
            entities: discoverResult.entities,
            error: discoverResult.error
          };
          break;
        }
        case 'validate': {
          const validateStrategy = strategy as { validate: (entity: OutreachEntity) => Promise<Record<string, unknown>> };
          const validation = await validateStrategy.validate(entity);
          result = {
            success: validation.valid || validation.result !== 'invalid',
            validation,
            entity
          };
          break;
        }
        case 'send':
          result = { success: true, entity };
          break;
        default:
          result = { success: true, entity };
      }

      return {
        ...result,
        duration: Date.now() - startTime
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Run full pipeline for an entity
   */
  async run(entity: OutreachEntity, startStage: string | null = null): Promise<{ success: boolean; failedAt?: string; error?: string; entity?: OutreachEntity; stageResults?: Record<string, unknown> }> {
    const stages = ['discover', 'validate', 'research', 'personalize', 'send'];
    const startIndex = startStage ? stages.indexOf(startStage) : 0;
    
    if (startIndex === -1) {
      return { success: false, error: `Invalid start stage: ${startStage}` };
    }

    const stageResults: Record<string, unknown> = {};
    let currentEntity: OutreachEntity = entity;

    for (let i = startIndex; i < stages.length; i++) {
      const stage = stages[i];
      
      if (this.context.dryRun) {
        console.log(`[DRY RUN] Would execute stage: ${stage}`);
        stageResults[stage] = { success: true, dryRun: true };
        currentEntity = currentEntity || entity;
        currentEntity.updateStatus(this.stageToStatus(stage) as Parameters<typeof currentEntity.updateStatus>[0]);
        continue;
      }

      const result = await this.executeStage(stage, currentEntity);
      stageResults[stage] = result;

      if (!result.success) {
        return {
          success: false,
          failedAt: stage,
          error: result.error,
          entity: currentEntity,
          stageResults
        };
      }

      // Update entity status
      currentEntity.updateStatus(this.stageToStatus(stage) as Parameters<typeof currentEntity.updateStatus>[0]);
    }

    return {
      success: true,
      entity: currentEntity,
      stageResults
    };
  }

  /**
   * Run discovery only
   */
  async discover(query: string, options: Record<string, unknown> = {}): Promise<{ success: boolean; entities: OutreachEntity[]; error?: string }> {
    const strategy = this.getStrategy('discover');
    
    if (!strategy) {
      return { success: false, entities: [], error: 'No discovery strategy registered' };
    }

    if (this.context.dryRun) {
      console.log(`[DRY RUN] Would discover ${options.limit || 20} entities with query: "${query}"`);
      return { success: true, entities: [], dryRun: true };
    }

    const discoverStrategy = strategy as { discover: (query: string, options: Record<string, unknown>) => Promise<OutreachEntity[]> };
    const entities = await discoverStrategy.discover(query, options);
    return { success: true, entities };
  }

  /**
   * Run validation only
   */
  async validate(entity: OutreachEntity): Promise<Record<string, unknown>> {
    const strategy = this.getStrategy('validate');
    
    if (!strategy) {
      return {
        valid: false,
        confidenceScore: 0,
        result: 'unknown',
        details: { reason: 'no_strategy', message: 'No validation strategy registered' }
      };
    }

    if (this.context.dryRun) {
      console.log(`[DRY RUN] Would validate entity: ${entity.name}`);
      return {
        valid: true,
        confidenceScore: 0.85,
        result: 'valid',
        details: { reason: 'dry_run', message: 'Dry run - assumed valid' }
      };
    }

    const validateStrategy = strategy as { validate: (entity: OutreachEntity) => Promise<Record<string, unknown>> };
    return await validateStrategy.validate(entity);
  }
}

export default OutreachPipeline;
