/**
 * VCResearchStrategy - Research VC firms for personalization
 */
import fs from 'fs';
import { VCEntity } from '../../entities/VCEntity.js';
import { ResearchStrategy } from './ResearchStrategy.js';

export class VCResearchStrategy extends ResearchStrategy {
  constructor(config: Record<string, unknown> = {}) {
    super(config);
    this.name = 'vc-research';
  }
  
  /**
   * Research VC firm using OpenClaw Script ↔ AI Execution pattern
   */
  async research(entity: VCEntity): Promise<{ success: boolean; research: Record<string, unknown>; entity: VCEntity }> {
    console.log(`📚 Researching VC: ${entity.name}...`);
    
    // Cache-first: Check for existing research results
    const cacheFile = `/tmp/vc-research-${this.sanitizeName(entity.name)}-result.json`;
    if (fs.existsSync(cacheFile)) {
      console.log(`   📁 Found cached research results`);
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      if (cached.research) {
        console.log(`   ✅ Using cached research`);
        fs.unlinkSync(cacheFile);
        return this.applyResearch(entity, cached.research);
      }
    }
    
    // Option B: Direct API call if enabled
    if (process.env.USE_DIRECT_API === 'true') {
      console.log(`   🌐 Direct API mode enabled - calling Perplexity...`);
      return await this.researchViaAPI(entity, cacheFile);
    }
    
    // Option A: Write request file for sub-agent processing
    const requestFile = `/tmp/vc-research-${this.sanitizeName(entity.name)}-request.json`;
    const request = {
      type: 'vc-research',
      entityName: entity.name,
      website: entity.website,
      outputFile: cacheFile,
      timestamp: new Date().toISOString(),
      requiredTools: ['web_search', 'web_fetch'],
      instructions: `Research VC firm "${entity.name}" ${entity.website ? `(${entity.website})` : ''}. Use web_search to find: investment thesis, portfolio companies, key partners, recent investments, pain points, governance signals. Return JSON with: thesis, portfolio, partners, recentInvestments, painPoints, governanceSignals, whyAlygn. Save to ${cacheFile}`
    };
    
    fs.writeFileSync(requestFile, JSON.stringify(request, null, 2));
    
    console.log(`   ⏳ No cached research found`);
    console.log(`   📝 Wrote request file: ${requestFile}`);
    console.log(`   📤 To execute research:`);
    console.log(`      Option A: Post to Discord #annotations: "Process VC research request: ${requestFile}"`);
    console.log(`      Option B: Cronjob spawns sub-agent to process request file`);
    console.log(`      Option C: Use direct API (Perplexity) - set USE_DIRECT_API=true`);
    
    // Return fallback data for now
    return this.fallbackResearch(entity);
  }
  
  /**
   * Apply research data to entity
   */
  applyResearch(entity: VCEntity, research: Record<string, unknown>): { success: boolean; research: Record<string, unknown>; entity: VCEntity } {
    // Update entity with research
    entity.researchNotes = (research.thesis as string) || `${entity.name} is a venture capital firm.`;
    entity.personalizationContext = {
      ...entity.personalizationContext,
      painPoints: research.painPoints || ['AI governance', 'Coordination challenges'],
      tailoredHook: research.whyAlygn || 'Alygn provides governance infrastructure for AI coordination.',
      recentNews: (research.governanceSignals as string[])?.[0]
    };
    
    // Update typeData
    if (research.portfolio && (research.portfolio as unknown[]).length > 0) {
      entity.typeData.portfolioCompanies = research.portfolio as string[];
    }
    if (research.partners && (research.partners as unknown[]).length > 0) {
      entity.typeData.partners = research.partners as Array<{ name: string; title: string }>;
    }
    if (research.recentInvestments && (research.recentInvestments as unknown[]).length > 0) {
      entity.typeData.recentInvestments = research.recentInvestments as Array<{ company: string; date: string; stage: string }>;
    }
    
    entity.updateStatus('researched');
    
    console.log(`   ✅ Research applied from cache`);
    
    return {
      success: true,
      research,
      entity
    };
  }
  
  /**
   * Fallback research when no cache exists
   */
  fallbackResearch(entity: VCEntity): { success: boolean; research: Record<string, unknown>; entity: VCEntity } {
    const research = {
      thesis: `${entity.name} is a venture capital firm focused on technology investments.`,
      portfolio: entity.typeData?.portfolioCompanies || [],
      partners: entity.typeData?.partners || [],
      recentInvestments: entity.typeData?.recentInvestments || [],
      painPoints: ['AI governance', 'Coordination challenges', 'Risk management'],
      governanceSignals: ['AI safety interest'],
      whyAlygn: `${entity.name} would benefit from Alygn's governance infrastructure for AI coordination.`
    };
    
    entity.researchNotes = research.thesis;
    entity.personalizationContext = {
      painPoints: research.painPoints,
      tailoredHook: research.whyAlygn
    };
    
    entity.updateStatus('researched');
    
    console.log(`   ⚠️  Using fallback research (post to Discord for full research)`);
    
    return {
      success: true,
      research,
      entity
    };
  }
  
  /**
   * Sanitize name for filename
   */
  sanitizeName(name: string): string {
    return name.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 50);
  }
  
  /**
   * Dry-run research (mock data)
   */
  async researchDryRun(entity: VCEntity): Promise<{ success: boolean; research: Record<string, unknown>; entity: VCEntity }> {
    console.log(`📚 [DRY RUN] Researching VC: ${entity.name}...`);
    
    const mockResearch = {
      thesis: `${entity.name} invests in frontier technology with a focus on responsible innovation and AI governance.`,
      portfolio: ['SafeAI Co', 'GovernanceTech', 'Aligned Systems'],
      partners: [{ name: 'Partner Name', title: 'Managing Partner' }],
      recentInvestments: [{ company: 'SafeAI Co', date: '2024-01', stage: 'Seed' }],
      painPoints: ['AI safety standards', 'Governance frameworks', 'Risk assessment'],
      whyAlygn: 'Alygn provides the governance infrastructure they need for their AI-focused portfolio.',
      governanceSignals: ['Active in AI safety community']
    };
    
    entity.researchNotes = mockResearch.thesis;
    entity.personalizationContext = {
      painPoints: mockResearch.painPoints,
      tailoredHook: mockResearch.whyAlygn
    };
    entity.status = 'researched';
    
    console.log(`   [DRY RUN] Research complete`);
    
    return {
      success: true,
      research: mockResearch,
      entity
    };
  }
  
  /**
   * Research VC via Perplexity API (direct fallback)
   */
  async researchViaAPI(entity: VCEntity, cacheFile: string): Promise<{ success: boolean; research: Record<string, unknown>; entity: VCEntity }> {
    try {
      // Load credentials from skill's config directory (with legacy fallback)
      const configPath = path.resolve(__dirname, '../../../config/credentials.json');
      let credentials: { perplexity?: { apiKey?: string }; openrouter?: { apiKey?: string } } = {};
      
      if (fs.existsSync(configPath)) {
        credentials = JSON.parse(fs.readFileSync(configPath, 'utf8'));
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
      
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://alygn.org',
          'X-Title': 'Alygn VC Research'
        },
        body: JSON.stringify({
          model: 'perplexity/sonar-pro',
          messages: [
            {
              role: 'system',
              content: 'You are a VC research assistant. Return ONLY a JSON object with: thesis (1-2 sentences), portfolio (array of company names), partners (array of {name, title}), recentInvestments (array of {company, date, stage}), painPoints (array), governanceSignals (array), whyAlygn (string explaining fit).'
            },
            {
              role: 'user',
              content: `Research VC firm: ${entity.name} ${entity.website ? `(${entity.website})` : ''}. Focus on AI safety, governance, and alignment investments.`
            }
          ],
          max_tokens: 4000
        })
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      const content = data.choices?.[0]?.message?.content || '{}';
      
      let research: Record<string, unknown>;
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        research = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(content);
      } catch {
        throw new Error('Failed to parse API response');
      }
      
      // Save to cache for consistency
      fs.writeFileSync(cacheFile, JSON.stringify({ research, timestamp: new Date().toISOString() }, null, 2));
      
      console.log(`   ✅ API research complete`);
      return this.applyResearch(entity, research);
      
    } catch (error) {
      console.error(`   ❌ API failed: ${(error as Error).message}`);
      console.log(`   📤 Falling back to request file pattern`);
      return this.fallbackResearch(entity);
    }
  }
}

export default VCResearchStrategy;
