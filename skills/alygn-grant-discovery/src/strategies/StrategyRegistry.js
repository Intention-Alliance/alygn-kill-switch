// StrategyRegistry - Factory for creating and managing discovery strategies
import { GrantEntity } from '../entities/GrantEntity.js';
import { GrokDiscoveryStrategy } from './discovery/GrokDiscoveryStrategy.js';
import { PerplexityDiscoveryStrategy } from './discovery/PerplexityDiscoveryStrategy.js';
import { FirecrawlDiscoveryStrategy } from './discovery/FirecrawlDiscoveryStrategy.js';
import { CrossReferenceStrategy } from './discovery/CrossReferenceStrategy.js';
import { DeepResearchStrategy } from './research/DeepResearchStrategy.js';
import { EligibilityResearchStrategy } from './research/EligibilityResearchStrategy.js';
import { AlygnFitScorer } from './scoring/AlygnFitScorer.js';
import { PriorityScorer } from './scoring/PriorityScorer.js';
import { logger } from '../utils/logger.js';

export class StrategyRegistry {
  constructor(config = {}) {
    this.config = config;
    this._strategies = new Map();
    this._registerDefaults();
  }

  _registerDefaults() {
    // Discovery strategies
    this.register('grok-discovery', new GrokDiscoveryStrategy(this.config.grok));
    this.register('perplexity-discovery', new PerplexityDiscoveryStrategy(this.config.perplexity));
    this.register('firecrawl-discovery', new FirecrawlDiscoveryStrategy(this.config.firecrawl));
    this.register('cross-reference', new CrossReferenceStrategy());

    // Research strategies
    this.register('deep-research', new DeepResearchStrategy(this.config.deepResearch));
    this.register('eligibility-research', new EligibilityResearchStrategy());

    // Scoring strategies
    this.register('alygn-fit', new AlygnFitScorer(this.config.scoringWeights?.alygnFit));
    this.register('priority', new PriorityScorer(this.config.scoringWeights?.priority));
  }

  register(name, strategy) {
    this._strategies.set(name, strategy);
    logger.debug(`Strategy registered: ${name}`);
  }

  get(name) {
    const strategy = this._strategies.get(name);
    if (!strategy) {
      throw new Error(`Strategy not found: ${name}`);
    }
    return strategy;
  }

  has(name) {
    return this._strategies.has(name);
  }

  listStrategies() {
    return Array.from(this._strategies.keys());
  }

  // Execute a discovery phase using all enabled sources
  async runDiscovery(context) {
    const grants = [];
    const errors = [];

    const sources = [
      { name: 'grok', strategy: 'grok-discovery', enabled: this.config.grok?.enabled !== false },
      { name: 'perplexity', strategy: 'perplexity-discovery', enabled: this.config.perplexity?.enabled !== false },
      { name: 'firecrawl', strategy: 'firecrawl-discovery', enabled: this.config.firecrawl?.enabled !== false }
    ];

    for (const source of sources) {
      if (!source.enabled) continue;
      try {
        const results = await this.get(source.strategy).discover(context);
        grants.push(...results.map(g => ({ ...g, _source: source.name })));
        logger.info(`Discovery source '${source.name}' returned ${results.length} grants`);
      } catch (error) {
        logger.error(`Discovery source '${source.name}' failed`, { error: error.message });
        errors.push({ source: source.name, error: error.message });
      }
    }

    // Cross-reference and deduplicate
    const deduplicated = await this.get('cross-reference').discover({
      grants,
      context
    });

    return { grants: deduplicated, errors };
  }

  // Execute research phase
  async runResearch(grants, context) {
    const results = [];

    for (const grant of grants) {
      try {
        const deepResearch = await this.get('deep-research').research(grant, context);
        const eligibilityResearch = await this.get('eligibility-research').research(grant, context);
        results.push({ ...deepResearch, ...eligibilityResearch });
      } catch (error) {
        logger.error(`Research failed for grant ${grant.id}`, { error: error.message });
        results.push({ ...grant, researchError: error.message });
      }
    }

    return results;
  }

  // Execute scoring phase
  async runScoring(grants, context) {
    const results = [];

    for (const grant of grants) {
      try {
        const fitScore = await this.get('alygn-fit').score(grant, context);
        const priorityScore = await this.get('priority').score(grant, context);
        results.push({
          ...grant,
          typeData: {
            ...grant.typeData,
            alignmentScore: fitScore.score,
            priorityScore: priorityScore.score,
            scoringDetails: { fit: fitScore, priority: priorityScore }
          }
        });
      } catch (error) {
        logger.error(`Scoring failed for grant ${grant.id}`, { error: error.message });
        results.push(grant);
      }
    }

    return results;
  }
}
