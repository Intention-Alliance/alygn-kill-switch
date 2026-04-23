/**
 * VCDiscoveryStrategy - Discovers Venture Capital firms using OpenClaw Script ↔ AI Execution pattern
 * 
 * Mode B (dry-run + USE_DIRECT_API=true): 
 *   - Calls Perplexity API to get real data
 *   - Writes results to data/dry-run/ instead of returning mocks
 *   - Simulates Supabase writes
 */
import fs from 'fs';
import path from 'path';
import { DiscoveryStrategy, type IDiscoveryOptions } from './DiscoveryStrategy';
import { VCEntity } from '../../entities/VCEntity';
import { RegexMXValidator } from '../../lib/email/validators/RegexMXValidator';
import { getSupabaseSimulator } from '../../lib/simulation/SupabaseSimulator';
import { getDiscordReporter } from '../../lib/reporting/DiscordReporter';

// Relevance scoring criteria
const RELEVANCE_KEYWORDS = {
  high: ['AI safety', 'AI alignment', 'existential risk', 'AGI governance', 'AI oversight'],
  medium: ['AI governance', 'AI ethics', 'responsible AI', 'AI policy', 'AI regulation'],
  low: ['AI', 'machine learning', 'deep tech', 'frontier tech']
};

interface VCPortfolioCompany {
  name: string;
  date: string;
  stage: string;
}

interface VCSearchResult {
  name?: string;
  firmName?: string;
  website?: string;
  url?: string;
  email?: string;
  contactEmail?: string;
  city?: string;
  state?: string;
  country?: string;
  firmType?: string;
  stageFocus?: string[];
  sectorFocus?: string[];
  partners?: Array<{ name: string; title: string }>;
  portfolio?: string[];
  governanceSignals?: string[];
  recentInvestments?: VCPortfolioCompany[];
  focusAreas?: string[];
  [key: string]: unknown;
}

export class VCDiscoveryStrategy extends DiscoveryStrategy {
  private searchQueries: string[];

  constructor(config: Record<string, unknown> = {}) {
    super(config);
    this.name = 'vc-discovery';
    this.searchQueries = (config.searchQueries as string[]) || [
      'AI safety seed stage investors',
      'AI governance venture capital',
      'AI alignment funding',
      'existential risk investors',
      'AGI preparedness venture capital'
    ];
  }

  /**
   * Discover VC firms using OpenClaw Script ↔ AI Execution pattern
   * 
   * Modes:
   * - dryRun=true, USE_DIRECT_API=false: Return mock data (legacy behavior)
   * - dryRun=true, USE_DIRECT_API=true: Call Perplexity API, write to data/dry-run/, simulate DB writes (Mode B)
   * - dryRun=false: Normal operation with cache and optional API fallback
   */
  async discover(query: string, options: IDiscoveryOptions = {}): Promise<VCEntity[]> {
    const limit = options.limit || 20;
    const dryRun = options.dryRun || false;
    const useDirectApi = process.env.USE_DIRECT_API === 'true';
    
    console.log(`🔍 VC Discovery: Searching "${query}"...`);
    
    // Mode B: Dry-run with Direct API - Call real API and simulate
    if (dryRun && useDirectApi) {
      console.log(`   🌐 Mode B: Dry-run + Direct API enabled`);
      return await this.discoverModeB(query, limit, options);
    }
    
    // Legacy dry-run: Return mock data
    if (dryRun) {
      console.log(`   📝 Dry-run mode (legacy): Returning mock data`);
      return this.generateMockVCs(query, limit);
    }
    
    // Cache-first: Check for existing discovery results
    const cacheFile = `/tmp/vc-discovery-${this.sanitizeQuery(query)}-result.json`;
    if (fs.existsSync(cacheFile)) {
      console.log(`   📁 Found cached discovery results`);
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8')) as { results?: VCSearchResult[] };
      if (cached.results && cached.results.length > 0) {
        console.log(`   ✅ Using ${cached.results.length} cached VCs`);
        fs.unlinkSync(cacheFile);
        return this.convertResultsToEntities(cached.results, limit);
      }
    }
    
    // Try Perplexity API first (if enabled)
    if (useDirectApi) {
      console.log(`   🌐 Direct API mode enabled - calling Perplexity...`);
      try {
        const results = await this.fetchVCsFromAPI(query, limit);
        fs.writeFileSync(cacheFile, JSON.stringify({ results, timestamp: new Date().toISOString() }, null, 2));
        console.log(`   ✅ API returned ${results.length} VCs`);
        return this.convertResultsToEntities(results, limit);
      } catch (error) {
        const errorMessage = (error as Error).message;
        console.error(`   ❌ API failed: ${errorMessage}`);
        
        // Check for 402 (payment required) - try web_search fallback
        if (errorMessage.includes('402') || errorMessage.includes('API error: 4')) {
          console.log(`   💳 Perplexity credits issue, trying web_search...`);
        } else {
          console.log(`   ⚠️  API error, trying web_search...`);
        }
      }
    }
    
    // Fallback: Use web_search via request file pattern
    console.log(`   🔍 Attempting web_search fallback...`);
    return await this.discoverViaWebSearch(query, limit, cacheFile);
  }

  /**
   * Mode B: Dry-run with Direct API
   * - Calls Perplexity API for real data
   * - Writes results to data/dry-run/
   * - Simulates Supabase writes
   * - Sends Discord report
   */
  private async discoverModeB(query: string, limit: number, options: IDiscoveryOptions): Promise<VCEntity[]> {
    console.log(`\n   ═══════════════════════════════════════════`);
    console.log(`   🚀 MODE B: DRY-RUN + DIRECT API`);
    console.log(`   ═══════════════════════════════════════════`);
    
    // Create simulators and reporter
    const supabaseSim = getSupabaseSimulator({
      outputDir: path.join(process.cwd(), 'data', 'dry-run', 'supabase'),
      dryRunId: `vc-discovery-${Date.now()}`
    });
    
    const reporter = getDiscordReporter({
      outputDir: path.join(process.cwd(), 'data', 'dry-run', 'reports')
    });
    
    // Call the Perplexity API (same as production)
    console.log(`\n   📡 Calling Perplexity API for real data...`);
    let results: VCSearchResult[] = [];
    
    try {
      results = await this.fetchVCsFromAPI(query, limit);
    } catch (error) {
      console.error(`   ❌ API call failed: ${(error as Error).message}`);
      
      // Try web_search fallback if API fails (especially for 402)
      const errorMessage = (error as Error).message;
      if (errorMessage.includes('402') || errorMessage.includes('API error: 4')) {
        console.log(`   💳 API credits issue, trying web_search fallback...`);
        const webSearchCache = `/tmp/vc-discovery-${this.sanitizeQuery(query)}-result.json`;
        try {
          const webSearchResults = await this.discoverViaWebSearch(query, limit, webSearchCache);
          if (webSearchResults.length > 0) {
            await reporter.report('vc', 'discover', {
              discovered: webSearchResults.length,
              source: 'web_search_fallback',
              reason: `API failed: ${errorMessage}`
            }, webSearchResults.map(e => ({ name: e.name, email: e.email, website: e.website })), {
              sendToDiscord: true,
              supabaseSim
            });
            return webSearchResults;
          }
        } catch (webSearchError) {
          console.log(`   ⚠️  web_search fallback also failed: ${(webSearchError as Error).message}`);
        }
      }
      
      console.log(`   📝 Falling back to mock data`);
      const mockEntities = this.generateMockVCs(query, limit);
      
      // Report failure
      await reporter.report('vc', 'discover', {
        discovered: mockEntities.length,
        reason: `API failed: ${(error as Error).message}`
      }, mockEntities.map(e => ({ name: e.name, email: e.email, website: e.website })), {
        sendToDiscord: true,
        supabaseSim
      });
      
      return mockEntities;
    }
    
    if (results.length === 0) {
      console.log(`   ⚠️  No results from API, using mock data`);
      const mockEntities = this.generateMockVCs(query, limit);
      
      await reporter.report('vc', 'discover', {
        discovered: mockEntities.length,
        reason: 'No API results'
      }, mockEntities.map(e => ({ name: e.name, email: e.email, website: e.website })), {
        sendToDiscord: true,
        supabaseSim
      });
      
      return mockEntities;
    }
    
    console.log(`   ✅ API returned ${results.length} VC firms`);
    
    // Convert to entities
    const entities = await this.convertResultsToEntities(results, limit);
    
    // Save raw API results to data/dry-run/
    const dryRunDir = path.join(process.cwd(), 'data', 'dry-run');
    if (!fs.existsSync(dryRunDir)) {
      fs.mkdirSync(dryRunDir, { recursive: true });
    }
    
    const apiResultsFile = path.join(dryRunDir, `vc-api-results-${Date.now()}.json`);
    fs.writeFileSync(apiResultsFile, JSON.stringify({
      query,
      limit,
      timestamp: new Date().toISOString(),
      mode: 'dry-run-direct-api',
      results
    }, null, 2));
    console.log(`   💾 Raw API results saved: ${apiResultsFile}`);
    
    // Simulate Supabase writes
    console.log(`\n   📊 Simulating database writes...`);
    for (const entity of entities) {
      supabaseSim.insertPoliticalFigure(entity);
    }
    supabaseSim.save();
    
    // Send Discord report
    console.log(`\n   📤 Sending Discord report...`);
    await reporter.report('vc', 'discover', {
      discovered: entities.length
    }, entities.map(e => ({ name: e.name, email: e.email, website: e.website })), {
      sendToDiscord: true,
      supabaseSim
    });
    
    console.log(`\n   ═══════════════════════════════════════════`);
    console.log(`   ✅ MODE B COMPLETE`);
    console.log(`   ═══════════════════════════════════════════\n`);
    
    return entities;
  }

  /**
   * Fetch VCs from Perplexity API
   */
  private async fetchVCsFromAPI(query: string, limit: number): Promise<VCSearchResult[]> {
    // Load credentials
    const credentialsPath = path.resolve(__dirname, '../../../config/credentials.json');
    let credentials: { perplexity?: { apiKey?: string }; openrouter?: { apiKey?: string } } = {};
    
    if (fs.existsSync(credentialsPath)) {
      credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
    } else {
      const legacyPath = path.join(process.env.HOME || '', '.openclaw/workspace/config/credentials.json');
      if (fs.existsSync(legacyPath)) {
        credentials = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
      }
    }
    
    const apiKey = credentials?.perplexity?.apiKey || credentials?.openrouter?.apiKey;
    
    if (!apiKey) {
      throw new Error('No API key found in credentials');
    }
    
    const searchQuery = `${query} venture capital firm website contact email partners`;
    
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://alygn.org',
        'X-Title': 'Alygn VC Discovery'
      },
      body: JSON.stringify({
        model: 'perplexity/sonar-pro',
        messages: [
          {
            role: 'system',
            content: 'You are a VC research assistant. Return ONLY a JSON array of VC firms. Each item must have: name (string), website (string, optional), email (string, optional), firmType (string, default "vc"), stageFocus (array of strings), sectorFocus (array of strings), partners (array of objects with name, title, and linkedInUrl), contactFormUrl (string, optional URL of their contact form), linkedInUrl (string, optional firm LinkedIn page).'
          },
          {
            role: 'user',
            content: `Find venture capital firms matching: "${searchQuery}". Return up to ${limit} results as JSON array.`
          }
        ],
        max_tokens: 4000
      })
    });
    
    if (!response.ok) {
      const status = response.status;
      if (status === 402) {
        throw new Error('402: Perplexity credits exhausted - payment required');
      }
      throw new Error(`API error: ${status}`);
    }
    
    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content || '[]';
    
    let results: VCSearchResult[];
    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      results = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(content);
    } catch {
      throw new Error('Failed to parse API response');
    }
    
    if (!Array.isArray(results)) {
      throw new Error('API returned non-array');
    }
    
    return results;
  }

  /**
   * Discover VCs via web_search tool (via request file pattern)
   * 
   * This method writes a request file that the OpenClaw main agent can process
   * using the web_search tool. The request file contains all necessary context
   * for the agent to perform the search and write results back to cache.
   */
  private async discoverViaWebSearch(query: string, limit: number, cacheFile: string): Promise<VCEntity[]> {
    const requestFile = `/tmp/vc-websearch-${this.sanitizeQuery(query)}-${Date.now()}.json`;
    
    // Build enhanced search query for VC discovery
    const searchQuery = `${query} venture capital firm AI safety governance investors`;
    
    const request = {
      type: 'vc-discovery-via-websearch',
      query: query,
      searchQuery: searchQuery,
      limit: limit,
      outputFile: cacheFile,
      timestamp: new Date().toISOString(),
      requiredTools: ['web_search', 'web_fetch'],
      instructions: `Use web_search to find VCs matching "${searchQuery}". Extract firm names, websites, contact emails when available. Return JSON array with: name, website, email (optional), firmType ("vc"), stageFocus (array), sectorFocus (array with AI safety/governance focus), partners (array with name/title). Save full results to ${cacheFile} as { results: [...], timestamp: "..." }.`,
      fallbackResponse: this.generateMockVCsData(query, limit)
    };
    
    fs.writeFileSync(requestFile, JSON.stringify(request, null, 2));
    console.log(`   📝 Wrote web_search request file: ${requestFile}`);
    
    // Check if cache already has results from a previous run
    if (fs.existsSync(cacheFile)) {
      try {
        const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8')) as { results?: VCSearchResult[]; timestamp?: string };
        if (cached.results && cached.results.length > 0) {
          console.log(`   ✅ Found cached web_search results (${cached.results.length} VCs)`);
          fs.unlinkSync(cacheFile);
          return this.convertResultsToEntities(cached.results, limit);
        }
      } catch {
        // Cache invalid, continue with mock
      }
    }
    
    // No cached results - return mock data for now
    // The main agent should process the request file and populate the cache
    console.log(`   ⚠️  No cached web_search results found`);
    console.log(`   📋 Request file ready for main agent processing`);
    console.log(`   📤 Returning mock data (main agent can update cache)`);
    
    return this.generateMockVCs(query, limit);
  }

  /**
   * Generate mock VC data (raw format for use in fallback chain)
   */
  private generateMockVCsData(query: string, limit: number): VCSearchResult[] {
    const mockVCs = [
      {
        name: 'AI Safety Ventures',
        website: 'https://aisafetyvc.com',
        email: 'contact@aisafetyvc.com',
        firmType: 'vc',
        stageFocus: ['seed', 'series-a'],
        sectorFocus: ['AI safety', 'AI governance', 'AI alignment'],
        partners: [{ name: 'Dr. Sarah Chen', title: 'Managing Partner' }]
      },
      {
        name: 'Frontier Capital',
        website: 'https://frontiercap.com',
        email: 'investors@frontiercap.com',
        firmType: 'vc',
        stageFocus: ['series-a', 'series-b'],
        sectorFocus: ['frontier tech', 'AI', 'existential risk'],
        partners: [{ name: 'James Miller', title: 'Partner' }]
      },
      {
        name: 'Governance Fund',
        website: 'https://govfund.vc',
        email: 'hello@govfund.vc',
        firmType: 'vc',
        stageFocus: ['pre-seed', 'seed'],
        sectorFocus: ['AI policy', 'AI ethics', 'governance'],
        partners: [{ name: 'Maria Rodriguez', title: 'Founding Partner' }]
      }
    ];
    
    return mockVCs.slice(0, limit) as VCSearchResult[];
  }

  /**
   * Convert discovery results to VCEntity objects
   */
  private async convertResultsToEntities(results: VCSearchResult[], limit: number): Promise<VCEntity[]> {
    const entities: VCEntity[] = [];
    
    // Use local validator
    const validator = new RegexMXValidator();
    
    for (const result of results.slice(0, limit)) {
      const email = result.email || result.contactEmail;
      
      // Validate email with MX check before adding
      if (email) {
        console.log(`🔍 Validating email for ${result.name || 'Unknown VC'}: ${email}`);
        const validationResult = await validator.validate(email);
        
        if (validationResult.result === 'invalid') {
          console.log(`   ⚠️  Skipping ${result.name} - invalid email: ${email}`);
          continue;
        }
        console.log(`   ✅ Email validated (${validationResult.confidence * 100}% confidence)`);
      }
      
      const entity = new VCEntity({
        name: result.name || result.firmName || 'Unknown VC',
        website: result.website || result.url,
        email: email || undefined,
        location: {
          city: result.city || null,
          state: result.state || null,
          country: result.country || 'US'
        },
        typeData: {
          firmType: (result.firmType || 'vc') as 'vc' | 'angel' | 'corporate' | 'accelerator',
          stageFocus: result.stageFocus || [],
          sectorFocus: result.sectorFocus || [],
          partners: result.partners || [],
          portfolioCompanies: result.portfolio || [],
          recentInvestments: (result.recentInvestments || []) as unknown as import('../../entities/types').IRecentInvestment[]
        },
        status: 'discovered'
      });
      
      entities.push(entity);
    }
    
    console.log(`   ✅ Discovered ${entities.length} VC firms (after validation)`);
    return entities;
  }

  /**
   * Sanitize query for filename
   */
  private sanitizeQuery(query: string): string {
    return query.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 50);
  }

  /**
   * Score VC relevance for AI governance
   */
  scoreRelevance(vcData: Record<string, unknown>): number {
    let score = 0;
    
    const focusText = ((vcData.focusAreas as string[]) || (vcData.sectorFocus as string[]) || []).join(' ').toLowerCase();
    
    if (RELEVANCE_KEYWORDS.high.some(kw => focusText.includes(kw.toLowerCase()))) {
      score += 4;
    } else if (RELEVANCE_KEYWORDS.medium.some(kw => focusText.includes(kw.toLowerCase()))) {
      score += 3;
    } else if (RELEVANCE_KEYWORDS.low.some(kw => focusText.includes(kw.toLowerCase()))) {
      score += 2;
    }
    
    const stageText = ((vcData.stageFocus as string[]) || []).join(' ').toLowerCase();
    if (['seed', 'pre-seed', 'series a'].some(s => stageText.includes(s))) {
      score += 3;
    }
    
    if (vcData.governanceSignals && (vcData.governanceSignals as unknown[]).length > 0) {
      score += 2;
    }
    
    if (vcData.recentInvestments && ((vcData.recentInvestments as unknown[]) || []).length >= 3) {
      score += 1;
    }
    
    return Math.min(score, 10);
  }

  /**
   * Generate mock VCs for dry-run (legacy mode without API)
   */
  private generateMockVCs(query: string, limit: number): VCEntity[] {
    const mockVCs = [
      {
        name: 'AI Safety Ventures',
        website: 'https://aisafetyvc.com',
        email: 'contact@aisafetyvc.com',
        firmType: 'vc',
        stageFocus: ['seed', 'series-a'],
        sectorFocus: ['AI safety', 'AI governance', 'AI alignment'],
        partners: [{ name: 'Dr. Sarah Chen', title: 'Managing Partner' }],
        recentInvestments: [{ company: 'SafeAI Systems', date: '2024-01', stage: 'Seed' }, { company: 'Alignment Labs', date: '2024-03', stage: 'Seed' }],
        portfolioCompanies: ['SafeAI Systems', 'Alignment Labs'],
        painPoints: ['AI governance frameworks', 'technical safety standards'],
        governanceSignals: ['Active in AI safety community', 'Published governance research']
      },
      {
        name: 'Frontier Capital',
        website: 'https://frontiercap.com',
        email: 'investors@frontiercap.com',
        firmType: 'vc',
        stageFocus: ['series-a', 'series-b'],
        sectorFocus: ['frontier tech', 'AI', 'existential risk'],
        partners: [{ name: 'James Miller', title: 'Partner' }],
        recentInvestments: [{ company: 'Guardian AI', date: '2024-02', stage: 'Series A' }, { company: 'Future Systems', date: '2024-04', stage: 'Series B' }],
        portfolioCompanies: ['Guardian AI', 'Future Systems'],
        painPoints: ['scalable oversight', 'risk assessment'],
        governanceSignals: ['Focus on responsible innovation']
      },
      {
        name: 'Governance Fund',
        website: 'https://govfund.vc',
        email: 'hello@govfund.vc',
        firmType: 'vc',
        stageFocus: ['pre-seed', 'seed'],
        sectorFocus: ['AI policy', 'AI ethics', 'governance'],
        partners: [{ name: 'Maria Rodriguez', title: 'Founding Partner' }],
        recentInvestments: [{ company: 'PolicyAI', date: '2024-01', stage: 'Seed' }, { company: 'EthicalAI', date: '2024-03', stage: 'Pre-seed' }],
        portfolioCompanies: ['PolicyAI', 'EthicalAI'],
        painPoints: ['regulatory compliance', 'ethical frameworks'],
        governanceSignals: ['Policy-focused thesis']
      }
    ];
    
    return mockVCs.slice(0, limit).map(data => new VCEntity({
      name: data.name,
      website: data.website,
      email: data.email,
      location: { city: 'San Francisco', state: 'CA', country: 'US' },
      typeData: {
        firmType: (data.firmType || 'vc') as 'vc' | 'angel' | 'corporate' | 'accelerator',
        stageFocus: data.stageFocus,
        sectorFocus: data.sectorFocus,
        partners: data.partners,
        portfolioCompanies: data.portfolioCompanies,
        recentInvestments: data.recentInvestments as import('../../entities/types').IRecentInvestment[]
      },
      personalizationContext: {
        painPoints: data.painPoints,
        tailoredHook: data.governanceSignals[0]
      }
    }));
  }
}

export default VCDiscoveryStrategy;
