/**
 * GrantDiscoveryStrategy
 * Multi-source discovery combining Grok, Perplexity, and web_fetch
 * 
 * Pattern:
 * 1. Check cache file first (cache-first architecture)
 * 2. If USE_DIRECT_API=true, call APIs directly
 * 3. Otherwise, write request file for external sub-agent processing
 * 4. Sub-agent reads request → executes discovery → saves results
 */

import fs from 'fs';
import path from 'path';
import { GrantEntity } from '../../entities/GrantEntity';
import type { ResearchSourceType } from '../../types/index';

interface DiscoveryConfig {
  sources: ResearchSourceType[];
  focusAreas: string[];
  excludeClosed: boolean;
}

interface DiscoveryOptions {
  dryRun?: boolean;
  limit?: number;
  useCache?: boolean;
}

/**
 * Strategy for discovering grants from multiple sources
 * Supports Grok, Perplexity, and web_fetch sources
 */
export class GrantDiscoveryStrategy {
  private config: DiscoveryConfig;
  private name = 'grant-discovery';

  /**
   * Creates a new GrantDiscoveryStrategy
   * 
   * @param {DiscoveryConfig} config - Discovery configuration
   */
  constructor(config: DiscoveryConfig) {
    this.config = config;
  }

  /**
   * Main discovery method - orchestrates multi-source discovery
   * 
   * @param {DiscoveryConfig} discoveryConfig - Discovery parameters
   * @param {DiscoveryOptions} [options] - Execution options
   * @returns {Promise<GrantEntity[]>} Discovered grants
   */
  async discover(
    discoveryConfig: DiscoveryConfig,
    options: DiscoveryOptions = {}
  ): Promise<GrantEntity[]> {
    const { dryRun = false, limit = 50, useCache = true } = options;
    
    console.log(`🔍 Grant Discovery: Starting multi-source search...`);
    console.log(`   Sources: ${discoveryConfig.sources.join(', ')}`);
    console.log(`   Focus Areas: ${discoveryConfig.focusAreas.join(', ')}`);
    console.log(`   Exclude Closed: ${discoveryConfig.excludeClosed ? 'YES' : 'NO'}`);

    if (dryRun) {
      console.log(`   [DRY RUN] Generating mock grants...`);
      return this.generateMockGrants(limit);
    }

    const allResults: Partial<GrantEntity>[] = [];

    // Execute discovery for each configured source
    for (const source of discoveryConfig.sources) {
      try {
        console.log(`\n   📡 Discovering from ${source}...`);
        const sourceResults = await this.discoverFromSource(source, discoveryConfig.focusAreas);
        allResults.push(...sourceResults);
        console.log(`   ✅ Found ${sourceResults.length} grants from ${source}`);
      } catch (error) {
        console.error(`   ❌ Error discovering from ${source}:`, 
          error instanceof Error ? error.message : String(error));
      }
    }

    // Merge and deduplicate results
    const mergedGrants = this.mergeResults(allResults, discoveryConfig.excludeClosed);
    
    console.log(`\n✅ Discovery complete: ${mergedGrants.length} unique grants`);
    
    return mergedGrants.slice(0, limit);
  }

  /**
   * Discover grants from a specific source
   * 
   * @param {ResearchSourceType} source - Source to query
   * @param {string[]} focusAreas - Research areas to focus on
   * @returns {Promise<Partial<GrantEntity>[]>} Raw grant data
   * @private
   */
  private async discoverFromSource(
    source: ResearchSourceType,
    focusAreas: string[]
  ): Promise<Partial<GrantEntity>[]> {
    switch (source) {
      case 'grok':
        return this.discoverFromGrok(this.buildQueries(focusAreas));
      case 'perplexity':
        return this.discoverFromPerplexity(this.buildQueries(focusAreas));
      case 'web_fetch':
        return this.discoverFromWebFetch(this.buildUrls(focusAreas));
      default:
        console.warn(`   ⚠️  Unknown source: ${source}`);
        return [];
    }
  }

  /**
   * Discover grants using Grok AI
   * 
   * @param {string[]} queries - Search queries
   * @returns {Promise<Partial<GrantEntity>[]>} Discovered grants
   * @private
   */
  private async discoverFromGrok(queries: string[]): Promise<Partial<GrantEntity>[]> {
    // Check cache first
    const cacheFile = `/tmp/grant-discovery-grok-result.json`;
    if (fs.existsSync(cacheFile)) {
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      if (cached.results?.length > 0) {
        console.log(`   📁 Using cached Grok results`);
        fs.unlinkSync(cacheFile);
        return cached.results;
      }
    }

    // Direct API if enabled
    if (process.env.USE_DIRECT_API === 'true' && process.env.GROK_API_KEY) {
      try {
        const results = await this.callGrokAPI(queries);
        fs.writeFileSync(cacheFile, JSON.stringify({ results, timestamp: new Date().toISOString() }));
        return results;
      } catch (error) {
        console.error(`   ❌ Grok API failed:`, error);
      }
    }

    // Request file pattern for sub-agent
    const requestFile = `/tmp/grant-discovery-grok-request.json`;
    const request = {
      type: 'grant-discovery',
      source: 'grok',
      queries,
      outputFile: cacheFile,
      timestamp: new Date().toISOString(),
      instructions: `Use Grok to search for grants matching these queries. Return JSON array of grant objects with: name, organization, amount, deadline, eligibility, researchAreas.`
    };
    
    fs.writeFileSync(requestFile, JSON.stringify(request, null, 2));
    console.log(`   📝 Wrote request file: ${requestFile}`);
    
    return [];
  }

  /**
   * Discover grants using Perplexity AI
   * 
   * @param {string[]} queries - Search queries
   * @returns {Promise<Partial<GrantEntity>[]>} Discovered grants
   * @private
   */
  private async discoverFromPerplexity(queries: string[]): Promise<Partial<GrantEntity>[]> {
    const cacheFile = `/tmp/grant-discovery-perplexity-result.json`;
    if (fs.existsSync(cacheFile)) {
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      if (cached.results?.length > 0) {
        console.log(`   📁 Using cached Perplexity results`);
        fs.unlinkSync(cacheFile);
        return cached.results;
      }
    }

    // Direct API if enabled
    if (process.env.USE_DIRECT_API === 'true') {
      try {
        const results = await this.callPerplexityAPI(queries);
        fs.writeFileSync(cacheFile, JSON.stringify({ results, timestamp: new Date().toISOString() }));
        return results;
      } catch (error) {
        console.error(`   ❌ Perplexity API failed:`, error);
      }
    }

    // Request file pattern
    const requestFile = `/tmp/grant-discovery-perplexity-request.json`;
    const request = {
      type: 'grant-discovery',
      source: 'perplexity',
      queries: queries.map(q => `${q} grant funding 2024 2025`),
      outputFile: cacheFile,
      timestamp: new Date().toISOString(),
      instructions: `Use Perplexity web_search to find grants. Return JSON array with: name, organization, amount (min/max/currency), deadline, eligibility (entityTypes/requirements), researchAreas.`
    };
    
    fs.writeFileSync(requestFile, JSON.stringify(request, null, 2));
    console.log(`   📝 Wrote request file: ${requestFile}`);
    
    return [];
  }

  /**
   * Discover grants by scraping known grant directories
   * 
   * @param {string[]} urls - URLs to scrape
   * @returns {Promise<Partial<GrantEntity>[]>} Discovered grants
   * @private
   */
  private async discoverFromWebFetch(urls: string[]): Promise<Partial<GrantEntity>[]> {
    const cacheFile = `/tmp/grant-discovery-webfetch-result.json`;
    if (fs.existsSync(cacheFile)) {
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      if (cached.results?.length > 0) {
        console.log(`   📁 Using cached web_fetch results`);
        fs.unlinkSync(cacheFile);
        return cached.results;
      }
    }

    // Request file for sub-agent
    const requestFile = `/tmp/grant-discovery-webfetch-request.json`;
    const request = {
      type: 'grant-discovery',
      source: 'web_fetch',
      urls,
      outputFile: cacheFile,
      timestamp: new Date().toISOString(),
      instructions: `Fetch these URLs and extract grant information. Return JSON array of grant objects.`
    };
    
    fs.writeFileSync(requestFile, JSON.stringify(request, null, 2));
    console.log(`   📝 Wrote request file: ${requestFile}`);
    
    return [];
  }

  /**
   * Build search queries from focus areas
   * 
   * @param {string[]} focusAreas - Research focus areas
   * @returns {string[]} Search queries
   * @private
   */
  private buildQueries(focusAreas: string[]): string[] {
    const baseQueries = [
      'AI safety research grants',
      'AI governance funding opportunities',
      'AI alignment research grants',
      'existential risk research grants',
      'AGI governance funding'
    ];

    if (focusAreas.length === 0) return baseQueries;

    return focusAreas.flatMap(area => [
      `${area} research grants`,
      `${area} funding opportunities`,
      `${area} grants 2024 2025`
    ]);
  }

  /**
   * Build URLs for web scraping
   * 
   * @param {string[]} focusAreas - Research focus areas
   * @returns {string[]} URLs to scrape
   * @private
   */
  private buildUrls(focusAreas: string[]): string[] {
    // Known grant directories
    return [
      'https://www.nsf.gov/funding/funding-opportunities.jsp',
      'https://www.grants.gov/web/grants/search-grants.html',
      'https://openphilanthropy.org/grants'
    ];
  }

  /**
   * Merge and deduplicate discovery results
   * 
   * @param {Partial<GrantEntity>[]} results - Raw results from all sources
   * @param {boolean} excludeClosed - Whether to exclude closed grants
   * @returns {GrantEntity[]} Merged, deduplicated grants
   * @private
   */
  private mergeResults(results: Partial<GrantEntity>[], excludeClosed: boolean): GrantEntity[] {
    const seen = new Set<string>();
    const merged: GrantEntity[] = [];

    for (const result of results) {
      // Create a key for deduplication
      const key = `${result.organization?.toLowerCase()}-${result.name?.toLowerCase()}`.replace(/\s+/g, '-');
      
      if (seen.has(key)) continue;
      seen.add(key);

      // Skip closed grants if configured
      if (excludeClosed && result.deadlineType === 'closed') {
        continue;
      }

      // Create full GrantEntity
      const grant = GrantEntity.fromPartial(result);
      
      // Add discovery source
      grant.addResearchSource({
        url: result.researchSources?.[0]?.url || '',
        source: result.researchSources?.[0]?.source || 'grok',
        date: new Date(),
        confidence: 0.6 // Initial discovery confidence
      });

      merged.push(grant);
    }

    return merged.sort((a, b) => {
      // Sort by deadline (soonest first)
      if (!a.deadline) return 1;
      if (!b.deadline) return -1;
      return a.deadline.getTime() - b.deadline.getTime();
    });
  }

  /**
   * Call Grok API directly
   * 
   * @param {string[]} queries - Search queries
   * @returns {Promise<Partial<GrantEntity>[]>} API results
   * @private
   */
  private async callGrokAPI(queries: string[]): Promise<Partial<GrantEntity>[]> {
    const apiKey = process.env.GROK_API_KEY;
    if (!apiKey) throw new Error('GROK_API_KEY not set');

    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'grok-beta',
        messages: [
          {
            role: 'system',
            content: 'You are a grant research assistant. Return ONLY a JSON array of grants. Each grant must have: name, organization, amount (object with max, currency, optional min), deadline (ISO date or null), deadlineType (fixed/rolling/annual/closed), eligibility (object with entityTypes array and requirements array), researchAreas array.'
          },
          {
            role: 'user',
            content: `Find grants matching these queries: ${queries.join(', ')}. Focus on AI safety, governance, and alignment research. Return up to 20 grants.`
          }
        ],
        max_tokens: 4000
      })
    });

    if (!response.ok) {
      throw new Error(`Grok API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '[]';
    
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : [];
  }

  /**
   * Call Perplexity API directly
   * 
   * @param {string[]} queries - Search queries
   * @returns {Promise<Partial<GrantEntity>[]>} API results
   * @private
   */
  private async callPerplexityAPI(queries: string[]): Promise<Partial<GrantEntity>[]> {
    const credentialsPath = path.join(process.env.HOME || '/home/andlersrv', '.openclaw/workspace/config/credentials.json');
    let apiKey = process.env.PERPLEXITY_API_KEY;
    
    if (!apiKey && fs.existsSync(credentialsPath)) {
      const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
      apiKey = credentials?.perplexity?.apiKey || credentials?.openrouter?.apiKey;
    }

    if (!apiKey) throw new Error('No Perplexity API key found');

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://alygn.org',
        'X-Title': 'ALYGN Grant Discovery'
      },
      body: JSON.stringify({
        model: 'perplexity/sonar-pro',
        messages: [
          {
            role: 'system',
            content: 'You are a grant research assistant. Use web_search to find grants. Return ONLY a JSON array. Each grant must have: name, organization, amount (max, currency, optional min), deadline (ISO date or null), deadlineType, eligibility (entityTypes, requirements), researchAreas.'
          },
          {
            role: 'user',
            content: `Find grants for: ${queries.join(', ')}. Focus on AI safety, governance, alignment research. Return up to 20 grants with current deadlines.`
          }
        ],
        max_tokens: 4000
      })
    });

    if (!response.ok) {
      throw new Error(`Perplexity API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '[]';
    
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : [];
  }

  /**
   * Generate mock grants for dry-run mode
   * 
   * @param {number} limit - Number of mock grants to generate
   * @returns {GrantEntity[]} Mock grant entities
   * @private
   */
  private generateMockGrants(limit: number): GrantEntity[] {
    const mockGrants: Partial<GrantEntity>[] = [
      {
        name: 'AI Safety Research Grant',
        organization: 'Open Philanthropy',
        status: 'discovered',
        amount: { max: 500000, currency: 'USD' },
        deadlineType: 'rolling',
        eligibility: {
          entityTypes: ['non-profit', 'academic'],
          requirements: ['AI safety focus', 'Open to international applicants']
        },
        researchAreas: ['AI safety', 'AI alignment', 'technical safety'],
        exclusions: ['AGI development', 'General AI research'],
        organizationCulture: {
          values: ['High impact', 'Longtermism', 'Evidence-based'],
          approach: 'Collaborative and supportive',
          community: 'Active AI safety research community'
        }
      },
      {
        name: 'Future of Life Institute Grant',
        organization: 'Future of Life Institute',
        status: 'discovered',
        amount: { min: 100000, max: 1000000, currency: 'USD' },
        deadline: new Date('2025-06-30'),
        deadlineType: 'fixed',
        eligibility: {
          entityTypes: ['academic', 'individual', 'non-profit'],
          requirements: ['PhD or equivalent experience', 'Publication track record']
        },
        researchAreas: ['AI governance', 'AI policy', 'existential risk'],
        exclusions: ['Military applications'],
        organizationCulture: {
          values: ['Existential risk reduction', 'Global coordination'],
          approach: 'Academic rigor with practical impact',
          community: 'Interdisciplinary research network'
        }
      },
      {
        name: 'NSF Safe Learning-Enabled Systems',
        organization: 'National Science Foundation',
        status: 'discovered',
        amount: { max: 1500000, currency: 'USD' },
        deadline: new Date('2025-03-15'),
        deadlineType: 'annual',
        eligibility: {
          entityTypes: ['academic'],
          geographicRestrictions: ['US institutions'],
          requirements: ['US-based PI', 'University affiliation']
        },
        researchAreas: ['Safe learning systems', 'AI verification', 'Formal methods'],
        exclusions: [],
        organizationCulture: {
          values: ['Scientific excellence', 'Broader impacts'],
          approach: 'Peer-reviewed, competitive process',
          community: 'Academic research community'
        }
      }
    ];

    return mockGrants
      .slice(0, limit)
      .map((data, index) => {
        const grant = GrantEntity.fromPartial(data);
        grant.addResearchSource({
          url: `https://example.com/grant-${index}`,
          source: 'grok',
          date: new Date(),
          confidence: 0.9
        });
        return grant;
      });
  }
}

export default GrantDiscoveryStrategy;
