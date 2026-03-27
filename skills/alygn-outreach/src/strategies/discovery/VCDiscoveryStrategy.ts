/**
 * VCDiscoveryStrategy - Discovers Venture Capital firms using OpenClaw Script ↔ AI Execution pattern
 */
import fs from 'fs';
import path from 'path';
import { VCEntity } from '../../entities/VCEntity.js';
import { DiscoveryStrategy } from './DiscoveryStrategy.js';

// Relevance scoring criteria
const RELEVANCE_KEYWORDS = {
  high: ['AI safety', 'AI alignment', 'existential risk', 'AGI governance', 'AI oversight'],
  medium: ['AI governance', 'AI ethics', 'responsible AI', 'AI policy', 'AI regulation'],
  low: ['AI', 'machine learning', 'deep tech', 'frontier tech']
};

export class VCDiscoveryStrategy extends DiscoveryStrategy {
  protected searchQueries: string[];

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
   */
  async discover(query: string, options: Record<string, unknown> = {}): Promise<VCEntity[]> {
    const limit = (options.limit as number) || 20;
    const dryRun = (options.dryRun as boolean) || false;
    
    console.log(`🔍 VC Discovery: Searching "${query}"...`);
    
    if (dryRun) {
      return this.generateMockVCs(query, limit);
    }
    
    // Cache-first: Check for existing discovery results
    const cacheFile = `/tmp/vc-discovery-${this.sanitizeQuery(query)}-result.json`;
    if (fs.existsSync(cacheFile)) {
      console.log(`   📁 Found cached discovery results`);
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      if (cached.results && cached.results.length > 0) {
        console.log(`   ✅ Using ${cached.results.length} cached VCs`);
        fs.unlinkSync(cacheFile);
        return this.convertResultsToEntities(cached.results, limit);
      }
    }
    
    // Option B: Direct API call if enabled
    if (process.env.USE_DIRECT_API === 'true') {
      console.log(`   🌐 Direct API mode enabled - calling Perplexity...`);
      return await this.discoverViaAPI(query, limit, cacheFile);
    }
    
    // Option A: Write request file for sub-agent processing
    const requestFile = `/tmp/vc-discovery-${this.sanitizeQuery(query)}-request.json`;
    const request = {
      type: 'vc-discovery',
      query: query,
      searchQuery: `${query} venture capital firm website contact email`,
      limit: limit,
      outputFile: cacheFile,
      timestamp: new Date().toISOString(),
      requiredTools: ['web_search'],
      instructions: `Use web_search to find VCs matching "${query} venture capital firm website contact email". Extract: firm names, websites, contact emails. Return JSON array with: name, website, email (optional), firmType, stageFocus, sectorFocus, partners. Save to ${cacheFile}`
    };
    
    fs.writeFileSync(requestFile, JSON.stringify(request, null, 2));
    
    console.log(`   ⏳ No cached results found`);
    console.log(`   📝 Wrote request file: ${requestFile}`);
    console.log(`   📤 To execute research:`);
    console.log(`      Option A: Post to Discord #annotations: "Process VC discovery request: ${requestFile}"`);
    console.log(`      Option B: Cronjob spawns sub-agent to process request file`);
    console.log(`      Option C: Set USE_DIRECT_API=true to use Perplexity API directly`);
    
    return [];
  }
  
  /**
   * Discover VCs via Perplexity API (direct fallback)
   */
  async discoverViaAPI(query: string, limit: number, cacheFile: string): Promise<VCEntity[]> {
    try {
      // Load credentials from skill's config directory (with legacy fallback)
      const credentialsPath = path.resolve(__dirname, '../../../config/credentials.json');
      let credentials: { perplexity?: { apiKey?: string }; openrouter?: { apiKey?: string } } = {};
      
      if (fs.existsSync(credentialsPath)) {
        credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
      } else {
        // Legacy fallback to workspace credentials
        const legacyPath = path.join(process.env.HOME || '', '.openclaw/workspace/config/credentials.json');
        if (fs.existsSync(legacyPath)) {
          credentials = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
        }
      }
      
      const apiKey = credentials?.perplexity?.apiKey || credentials?.openrouter?.apiKey;
      
      if (!apiKey) {
        throw new Error('No API key found');
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
              content: 'You are a VC research assistant. Return ONLY a JSON array of VC firms. Each item must have: name (string), website (string, optional), email (string, optional), firmType (string), stageFocus (array), sectorFocus (array), partners (array of objects with name and title).'
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
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      const content = data.choices?.[0]?.message?.content || '[]';
      
      let results: Array<Record<string, unknown>>;
      try {
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        results = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(content);
      } catch {
        throw new Error('Failed to parse API response');
      }
      
      if (!Array.isArray(results)) {
        throw new Error('API returned non-array');
      }
      
      // Save to cache for consistency
      fs.writeFileSync(cacheFile, JSON.stringify({ results, timestamp: new Date().toISOString() }, null, 2));
      
      console.log(`   ✅ API returned ${results.length} VCs`);
      return this.convertResultsToEntities(results, limit);
      
    } catch (error) {
      console.error(`   ❌ API failed: ${(error as Error).message}`);
      console.log(`   📤 Falling back to request file pattern`);
      return [];
    }
  }
  
  /**
   * Convert discovery results to VCEntity objects
   */
  async convertResultsToEntities(results: Array<Record<string, unknown>>, limit: number): Promise<VCEntity[]> {
    const entities: VCEntity[] = [];
    
    // Use local validator
    const { RegexMXValidator } = await import('../../lib/email/validators/RegexMXValidator.js');
    const validator = new RegexMXValidator();
    
    for (const result of results.slice(0, limit)) {
      const email = (result.email || result.contactEmail) as string | null;
      
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
        name: (result.name || result.firmName || 'Unknown VC') as string,
        website: result.website as string | undefined || result.url as string | undefined || undefined,
        email: email ?? undefined,
        location: {
          city: (result.city as string) || null,
          state: (result.state as string) || null,
          country: (result.country as string) || 'US'
        },
        typeData: {
          firmType: (result.firmType as string) || 'vc',
          stageFocus: (result.stageFocus as string[]) || [],
          sectorFocus: (result.sectorFocus as string[]) || [],
          partners: (result.partners as Array<{ name: string; title: string }>) || []
        },
        status: 'Ready for outreach'
      });
      
      entities.push(entity);
    }
    
    console.log(`   ✅ Discovered ${entities.length} VC firms (after validation)`);
    return entities;
  }
  
  /**
   * Sanitize query for filename
   */
  sanitizeQuery(query: string): string {
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
   * Generate mock VCs for dry-run
   */
  generateMockVCs(query: string, limit: number): VCEntity[] {
    const mockVCs = [
      {
        name: 'AI Safety Ventures',
        website: 'https://aisafetyvc.com',
        email: 'contact@aisafetyvc.com',
        firmType: 'vc',
        stageFocus: ['seed', 'series-a'],
        sectorFocus: ['AI safety', 'AI governance', 'AI alignment'],
        partners: [{ name: 'Dr. Sarah Chen', title: 'Managing Partner' }],
        recentInvestments: ['SafeAI Systems', 'Alignment Labs'],
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
        recentInvestments: ['Guardian AI', 'Future Systems'],
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
        recentInvestments: ['PolicyAI', 'EthicalAI'],
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
        firmType: data.firmType,
        stageFocus: data.stageFocus,
        sectorFocus: data.sectorFocus,
        partners: data.partners,
        portfolioCompanies: data.recentInvestments,
        recentInvestments: data.recentInvestments.map(c => ({ company: c, date: '2024-01', stage: 'Seed' }))
      },
      personalizationContext: {
        painPoints: data.painPoints,
        tailoredHook: data.governanceSignals[0]
      }
    }));
  }
}

export default VCDiscoveryStrategy;
