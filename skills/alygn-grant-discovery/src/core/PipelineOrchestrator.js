// PipelineOrchestrator - Cron-triggered master runner
import { StrategyRegistry } from '../strategies/StrategyRegistry.js';
import { GrantDatabase } from '../notion/GrantDatabase.js';
import { StateManager } from './StateManager.js';
import { NotificationService } from './NotificationService.js';
import { logger } from '../utils/logger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class PipelineOrchestrator {
  constructor(config = {}) {
    this.config = config;
    this.registry = new StrategyRegistry(this._loadConfig());
    this.db = new GrantDatabase();
    this.state = new StateManager('grant-discovery');
    this.notifier = new NotificationService();
  }

  _loadConfig() {
    const configPath = path.join(__dirname, '../../config/discovery-sources.json');
    const weightsPath = path.join(__dirname, '../../config/scoring-weights.json');
    const channelsPath = path.join(__dirname, '../../config/notification-channels.json');

    const discoveryConfig = fs.existsSync(configPath)
      ? JSON.parse(fs.readFileSync(configPath, 'utf8'))
      : { grok: {}, perplexity: {}, firecrawl: {} };

    const scoringWeights = fs.existsSync(weightsPath)
      ? JSON.parse(fs.readFileSync(weightsPath, 'utf8'))
      : { alygnFit: {}, priority: {} };

    const channels = fs.existsSync(channelsPath)
      ? JSON.parse(fs.readFileSync(channelsPath, 'utf8'))
      : {};

    return { ...discoveryConfig, scoringWeights, channels };
  }

  async run(action) {
    logger.info(`Starting action: ${action}`);

    switch (action) {
      case 'pipeline':
        return this.runFullPipeline();
      case 'discover':
        return this.runDiscovery();
      case 'research':
        return this.runResearch();
      case 'validate':
        return this.runValidation();
      case 'score':
        return this.runScoring();
      case 'notify':
        return this.runNotification();
      case 'monitor-deadlines':
        return this.monitorDeadlines();
      case 'sync-notion':
        return this.syncNotion();
      case 'report':
        return this.generateReport();
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  async runFullPipeline() {
    const startTime = Date.now();
    logger.info('Starting full grant discovery pipeline');

    try {
      // Phase 1: Discovery
      const { grants: discovered, errors: discoveryErrors } = await this.runDiscovery();
      logger.info(`Discovery complete: ${discovered.length} grants found`);

      // Phase 2: Research
      const researched = await this.runResearch(discovered);
      logger.info(`Research complete: ${researched.length} grants processed`);

      // Phase 3: Validation (inline with research/scoring)
      const validated = await this.runValidation(researched);
      logger.info(`Validation complete: ${validated.length} grants validated`);

      // Phase 4: Scoring
      const scored = await this.runScoring(validated);
      logger.info(`Scoring complete: ${scored.length} grants scored`);

      // Phase 5: Notification
      const notified = await this.runNotification(scored);
      logger.info(`Notification complete`);

      const duration = Date.now() - startTime;
      const result = {
        success: true,
        phases: {
          discovered: discovered.length,
          researched: researched.length,
          validated: validated.length,
          scored: scored.length
        },
        notifications: notified,
        durationMs: duration,
        errors: discoveryErrors
      };

      logger.info('Full pipeline complete', result);
      return result;

    } catch (error) {
      logger.error('Pipeline failed', { error: error.message, stack: error.stack });
      throw error;
    }
  }

  async runDiscovery() {
    const context = { limit: this.config.limit || 50 };
    const { grants, errors } = await this.registry.runDiscovery(context);

    // Filter by grant type if specified
    let filtered = grants;
    if (this.config.grantType && this.config.grantType !== 'all') {
      filtered = grants.filter(g => g.grantType === this.config.grantType);
    }

    // Filter by minimum score if already scored
    if (this.config.minScore > 0) {
      filtered = filtered.filter(g => (g.typeData?.alignmentScore || 0) >= this.config.minScore);
    }

    // Save state
    await this.state.save('discovered', filtered);

    // Write to Notion (unless dry-run)
    if (!this.config.dryRun) {
      for (const grant of filtered) {
        await this.db.upsertGrant(grant);
      }
    }

    return { grants: filtered, errors };
  }

  async runResearch(grants) {
    if (!grants || grants.length === 0) {
      const state = await this.state.load('discovered');
      grants = state?.grants || [];
    }

    const researched = await this.registry.runResearch(grants, {});
    await this.state.save('researched', researched);

    if (!this.config.dryRun) {
      for (const grant of researched) {
        await this.db.updateGrant(grant);
      }
    }

    return researched;
  }

  async runValidation(grants) {
    if (!grants || grants.length === 0) {
      const state = await this.state.load('researched');
      grants = state?.grants || [];
    }

    // Validation is currently embedded in scoring
    // This is a placeholder for future explicit validation phase
    await this.state.save('validated', grants);
    return grants;
  }

  async runScoring(grants) {
    if (!grants || grants.length === 0) {
      const state = await this.state.load('validated');
      grants = state?.grants || [];
    }

    const scored = await this.registry.runScoring(grants, {});
    await this.state.save('scored', scored);

    if (!this.config.dryRun) {
      for (const grant of scored) {
        await this.db.updateGrant(grant);
      }
    }

    return scored;
  }

  async runNotification(grants) {
    if (!grants || grants.length === 0) {
      const state = await this.state.load('scored');
      grants = state?.grants || [];
    }

    const results = [];

    // Email report to Tania
    results.push({
      channel: 'email',
      recipient: this.config.recipient || 'tania',
      status: await this.notifier.sendEmailReport(grants, this.config)
    });

    // Discord digest
    results.push({
      channel: 'discord',
      channelName: this.config.channel || 'alygn-grants',
      status: await this.notifier.sendDiscordDigest(grants, this.config)
    });

    return results;
  }

  async monitorDeadlines() {
    const days = this.config.days || 14;
    const grants = await this.db.getGrantsWithDeadline(days);

    const critical = grants.filter(g => this._daysUntil(g.deadline.full) <= 7);
    const warnings = grants.filter(g => {
      const d = this._daysUntil(g.deadline.full);
      return d > 7 && d <= days;
    });

    const result = { critical, warnings, days };

    // Alert on critical
    if (critical.length > 0) {
      await this.notifier.alertCriticalDeadlines(critical);
    }

    return result;
  }

  async syncNotion() {
    const recalculate = this.config.recalculateScores || false;
    const grants = await this.db.getAllGrants();

    if (recalculate) {
      // Recalculate priority scores for all grants
      const rescored = await this.registry.runScoring(grants, {});
      for (const grant of rescored) {
        await this.db.updateGrant(grant);
      }
      return { synced: rescored.length, rescored: true };
    }

    return { synced: grants.length, rescored: false };
  }

  async generateReport() {
    const format = this.config.format || 'email';
    const grants = await this.db.getAllGrants();

    switch (format) {
      case 'email':
        return this.notifier.generateEmailReport(grants);
      case 'discord':
        return this.notifier.generateDiscordReport(grants);
      case 'analysis':
        const grantId = this.config.grantId;
        const grant = grantId ? grants.find(g => g.id === grantId) : null;
        return this.notifier.generateAnalysisReport(grant);
      default:
        throw new Error(`Unknown format: ${format}`);
    }
  }

  _daysUntil(dateStr) {
    if (!dateStr) return Infinity;
    const deadline = new Date(dateStr);
    const now = new Date();
    return Math.ceil((deadline - now) / (1000 * 60 * 60 * 24));
  }
}
