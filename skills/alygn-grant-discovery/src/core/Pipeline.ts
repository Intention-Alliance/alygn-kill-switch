/**
 * GrantDiscoveryPipeline
 * Orchestrates the full grant discovery and research pipeline
 * 
 * Phases:
 * 1. discover - Find grants from multiple sources
 * 2. research - Deep research on discovered grants
 * 3. validate - Validate alignment with ALYGN
 * 4. sync - Sync to Notion and notify stakeholders
 */

import { GrantEntity } from '../entities/GrantEntity';
import { GrantDiscoveryStrategy } from '../strategies/discovery/GrantDiscoveryStrategy';
import { GrantResearchStrategy } from '../strategies/research/GrantResearchStrategy';
import { ALYGNAlignmentValidator } from '../strategies/alignment/ALYGNAlignmentValidator';
import { NotionGrantSync } from '../notion/NotionSync';
import { GrantDiscoveryEmailService } from '../email/EmailService';
import type { 
  PipelineConfig, 
  PipelineResult, 
  GrantChange 
} from '../types/index';
import fs from 'fs';
import path from 'path';

interface RunOptions {
  dryRun?: boolean;
  limit?: number;
  focusAreas?: string[];
}

/**
 * Main pipeline for grant discovery, research, validation, and sync
 */
export class GrantDiscoveryPipeline {
  private config: PipelineConfig;
  private discoveryStrategy: GrantDiscoveryStrategy;
  private researchStrategy: GrantResearchStrategy;
  private alignmentValidator: ALYGNAlignmentValidator;
  private notionSync?: NotionGrantSync;
  private emailService?: GrantDiscoveryEmailService;
  private grants: GrantEntity[] = [];

  /**
   * Creates a new pipeline instance
   * 
   * @param {PipelineConfig} config - Pipeline configuration
   */
  constructor(config: PipelineConfig) {
    this.config = config;
    
    this.discoveryStrategy = new GrantDiscoveryStrategy({
      sources: config.discovery.sources,
      focusAreas: config.discovery.focusAreas,
      excludeClosed: config.discovery.excludeClosed
    });

    this.researchStrategy = new GrantResearchStrategy({
      grokApiKey: config.grok?.apiKey,
      perplexityApiKey: config.perplexity?.apiKey,
      useDirectAPI: process.env.USE_DIRECT_API === 'true'
    });

    this.alignmentValidator = new ALYGNAlignmentValidator();

    if (config.notion?.apiKey && config.notion?.databaseId) {
      this.notionSync = new NotionGrantSync(config.notion.apiKey, config.notion.databaseId);
    }

    if (config.email) {
      this.emailService = new GrantDiscoveryEmailService(config.email);
    }
  }

  /**
   * Run a specific phase of the pipeline
   * 
   * @param {'discover' | 'research' | 'validate' | 'sync'} phase - Phase to run
   * @param {RunOptions} [options] - Execution options
   * @returns {Promise<PipelineResult>} Pipeline execution result
   */
  async run(
    phase: 'discover' | 'research' | 'validate' | 'sync',
    options: RunOptions = {}
  ): Promise<PipelineResult> {
    const { dryRun = false, limit = 50, focusAreas = this.config.discovery.focusAreas } = options;

    console.log(`\n🚀 Running Grant Discovery Pipeline: ${phase.toUpperCase()}`);
    console.log(`   Dry run: ${dryRun ? 'YES' : 'NO'}`);
    console.log(`   Limit: ${limit}`);
    console.log(`   Focus areas: ${focusAreas.join(', ')}\n`);

    const startTime = Date.now();
    const errors: string[] = [];

    try {
      let grants: GrantEntity[] = [];
      let changes: GrantChange[] | undefined;

      switch (phase) {
        case 'discover':
          grants = await this.discoverPhase(limit, dryRun);
          break;
        case 'research':
          grants = await this.researchPhase(limit, dryRun);
          break;
        case 'validate':
          grants = await this.validatePhase(limit, dryRun);
          break;
        case 'sync':
          const result = await this.syncPhase(limit, dryRun);
          grants = result.grants;
          changes = result.changes;
          break;
        default:
          throw new Error(`Unknown phase: ${phase}`);
      }

      const duration = Date.now() - startTime;
      const stateFile = this.saveState(phase, grants, changes);

      console.log(`\n✅ Phase complete in ${duration}ms`);
      console.log(`   Grants processed: ${grants.length}`);
      if (changes) console.log(`   Changes detected: ${changes.length}`);
      console.log(`   State saved to: ${stateFile}`);

      return {
        phase,
        success: errors.length === 0,
        grantsProcessed: grants.length,
        grants,
        errors,
        changes,
        stateFile
      };

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`\n❌ Pipeline failed: ${message}`);
      errors.push(message);

      return {
        phase,
        success: false,
        grantsProcessed: 0,
        grants: [],
        errors,
        changes: []
      };
    }
  }

  /**
   * Run full pipeline through all phases
   * 
   * @param {RunOptions} options - Execution options
   * @returns {Promise<PipelineResult[]>} Results from all phases
   */
  async runFullPipeline(options: RunOptions = {}): Promise<PipelineResult[]> {
    const phases: ('discover' | 'research' | 'validate' | 'sync')[] = 
      ['discover', 'research', 'validate', 'sync'];
    const results: PipelineResult[] = [];

    for (const phase of phases) {
      const result = await this.run(phase, options);
      results.push(result);
      
      if (!result.success) {
        console.error(`\n❌ Stopping pipeline due to failure in ${phase} phase`);
        break;
      }
    }

    return results;
  }

  /**
   * Discovery phase - find grants from multiple sources
   * 
   * @param {number} limit - Maximum grants to discover
   * @param {boolean} dryRun - Whether to generate mock data
   * @returns {Promise<GrantEntity[]>} Discovered grants
   * @private
   */
  private async discoverPhase(limit: number, dryRun: boolean): Promise<GrantEntity[]> {
    const grants = await this.discoveryStrategy.discover(
      {
        sources: this.config.discovery.sources,
        focusAreas: this.config.discovery.focusAreas,
        excludeClosed: this.config.discovery.excludeClosed
      },
      { dryRun, limit }
    );

    this.grants = grants;
    return grants;
  }

  /**
   * Research phase - deep research on discovered grants
   * 
   * @param {number} limit - Maximum grants to research
   * @param {boolean} dryRun - Whether to skip research
   * @returns {Promise<GrantEntity[]>} Researched grants
   * @private
   */
  private async researchPhase(limit: number, dryRun: boolean): Promise<GrantEntity[]> {
    // Load from previous phase if needed
    if (this.grants.length === 0) {
      const latest = this.loadLatestState('discover');
      if (latest) {
        this.grants = latest.grants;
      }
    }

    if (dryRun) {
      console.log(`[DRY RUN] Skipping research for ${Math.min(this.grants.length, limit)} grants`);
      return this.grants.slice(0, limit);
    }

    const researched: GrantEntity[] = [];
    
    for (const grant of this.grants.slice(0, limit)) {
      try {
        const researchedGrant = await this.researchStrategy.research(grant);
        researched.push(researchedGrant);
      } catch (error) {
        console.error(`   ❌ Failed to research ${grant.name}:`, error);
        // Still include the grant, just without research
        researched.push(grant);
      }
    }

    this.grants = researched;
    return researched;
  }

  /**
   * Validation phase - validate alignment with ALYGN
   * 
   * @param {number} limit - Maximum grants to validate
   * @param {boolean} dryRun - Whether to skip validation
   * @returns {Promise<GrantEntity[]>} Validated grants
   * @private
   */
  private async validatePhase(limit: number, dryRun: boolean): Promise<GrantEntity[]> {
    // Load from previous phase if needed
    if (this.grants.length === 0) {
      const latest = this.loadLatestState('research') || this.loadLatestState('discover');
      if (latest) {
        this.grants = latest.grants;
      }
    }

    if (dryRun) {
      console.log(`[DRY RUN] Assigning mock alignment scores`);
      return this.grants.slice(0, limit).map(g => {
        g.alignmentScore = Math.floor(Math.random() * 10) + 1;
        g.alignmentRationale = '[DRY RUN] Mock alignment rationale';
        g.updateStatus('aligned');
        return g;
      });
    }

    const validated: GrantEntity[] = [];
    
    for (const grant of this.grants.slice(0, limit)) {
      try {
        const result = this.alignmentValidator.validate(grant);
        grant.alignmentScore = result.score;
        grant.alignmentRationale = result.rationale;
        
        if (result.repositioning?.required) {
          grant.repositioningRequired = {
            from: grant.researchAreas.join(', '),
            to: result.repositioning.recommendations.join('; ')
          };
        }
        
        if (result.score >= 4) {
          grant.updateStatus('aligned');
        }
        
        validated.push(grant);
      } catch (error) {
        console.error(`   ❌ Failed to validate ${grant.name}:`, error);
        validated.push(grant);
      }
    }

    this.grants = validated;
    return validated;
  }

  /**
   * Sync phase - sync to Notion and send notifications
   * 
   * @param {number} limit - Maximum grants to sync
   * @param {boolean} dryRun - Whether to skip sync
   * @returns {Promise<{ grants: GrantEntity[]; changes: GrantChange[] }>} Sync results
   * @private
   */
  private async syncPhase(limit: number, dryRun: boolean): Promise<{ 
    grants: GrantEntity[]; 
    changes: GrantChange[] 
  }> {
    // Load from previous phase if needed
    if (this.grants.length === 0) {
      const latest = this.loadLatestState('validate') || 
                     this.loadLatestState('research') || 
                     this.loadLatestState('discover');
      if (latest) {
        this.grants = latest.grants;
      }
    }

    const grantsToSync = this.grants.slice(0, limit);
    const changes: GrantChange[] = [];

    if (dryRun) {
      console.log(`[DRY RUN] Would sync ${grantsToSync.length} grants to Notion`);
      if (this.emailService) {
        console.log(`[DRY RUN] Would send email summary`);
      }
      return { grants: grantsToSync, changes };
    }

    // Sync to Notion
    if (this.notionSync) {
      console.log(`   📓 Syncing to Notion...`);
      
      // Get existing grants to detect changes
      const existingGrants = await this.notionSync.getExistingGrants();
      const detectedChanges = await this.notionSync.detectChanges(existingGrants, grantsToSync);
      changes.push(...detectedChanges);

      // Sync each grant
      for (const grant of grantsToSync) {
        try {
          const pageId = await this.notionSync.syncGrant(grant);
          grant.notionPageId = pageId;
          grant.lastSyncedAt = new Date();
        } catch (error) {
          console.error(`   ❌ Failed to sync ${grant.name}:`, error);
        }
      }

      // Update quick reference
      await this.notionSync.updateQuickReference(grantsToSync);
    }

    // Send email summary
    if (this.emailService) {
      console.log(`   📧 Sending email summary...`);
      const newGrants = grantsToSync.filter(g => 
        !changes.some(c => c.grantId === g.id && c.type !== 'new')
      );
      
      try {
        await this.emailService.sendSummaryToTania(newGrants, changes);
      } catch (error) {
        console.error(`   ❌ Failed to send email:`, error);
      }
    }

    return { grants: grantsToSync, changes };
  }

  /**
   * Save pipeline state to file
   * 
   * @param {string} phase - Current phase
   * @param {GrantEntity[]} grants - Grants to save
   * @param {GrantChange[]} [changes] - Detected changes
   * @returns {string} Path to state file
   * @private
   */
  private saveState(phase: string, grants: GrantEntity[], changes?: GrantChange[]): string {
    const timestamp = new Date().toISOString().split('T')[0];
    const filePath = `/tmp/alygn-grant-${phase}-${timestamp}.json`;
    
    fs.writeFileSync(filePath, JSON.stringify({
      timestamp: new Date().toISOString(),
      phase,
      grants: grants.map(g => g.toJSON()),
      changes
    }, null, 2));
    
    return filePath;
  }

  /**
   * Load state from file
   * 
   * @param {string} filePath - Path to state file
   * @returns {{ grants: GrantEntity[]; changes?: GrantChange[] } | null} Loaded state
   * @private
   */
  private loadState(filePath: string): { grants: GrantEntity[]; changes?: GrantChange[] } | null {
    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(content);
      
      return {
        grants: data.grants.map((g: Record<string, unknown>) => GrantEntity.fromJSON(g)),
        changes: data.changes
      };
    } catch (error) {
      console.error(`Failed to load state: ${error}`);
      return null;
    }
  }

  /**
   * Load latest state for a phase
   * 
   * @param {string} phase - Phase to load
   * @returns {{ grants: GrantEntity[]; changes?: GrantChange[] } | null} Latest state
   * @private
   */
  private loadLatestState(phase: string): { grants: GrantEntity[]; changes?: GrantChange[] } | null {
    const pattern = new RegExp(`alygn-grant-${phase}-.*\\.json$`);
    const tmpDir = '/tmp';
    
    if (!fs.existsSync(tmpDir)) {
      return null;
    }

    const files = fs.readdirSync(tmpDir)
      .filter(f => pattern.test(f))
      .map(f => path.join(tmpDir, f))
      .sort((a, b) => fs.statSync(b).mtime.getTime() - fs.statSync(a).mtime.getTime());
    
    if (files.length === 0) {
      return null;
    }

    return this.loadState(files[0]);
  }
}

export default GrantDiscoveryPipeline;
