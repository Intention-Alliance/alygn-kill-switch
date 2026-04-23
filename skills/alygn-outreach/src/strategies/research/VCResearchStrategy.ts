/**
 * VCResearchStrategy - Research VC firms for personalization
 * 
 * Features:
 * - Notion duplicate check: Queries Notion database before researching
 * - Skips VCs already contacted (Status: "Contacted" or "Sent")
 * - Only researches new VCs or those ready for outreach
 */
import fs from 'fs';
import path from 'path';
import { VCEntity } from '../../entities/VCEntity';
import { ResearchStrategy, type IResearchResult } from './ResearchStrategy';
import { getClient, queryDatabase } from '../../lib/external/notion-client';

interface VCPortfolioCompany {
  company: string;
  date: string;
  stage: string;
}

interface VCSearchResult {
  thesis?: string;
  portfolio?: string[];
  partners?: Array<{ name: string; title: string }>;
  recentInvestments?: VCPortfolioCompany[];
  painPoints?: string[];
  governanceSignals?: string[];
  whyAlygn?: string;
  [key: string]: unknown;
}

// Notion database ID for VC outreach
const getDatabaseId = () => {
  const id = process.env.NOTION_VC_DATABASE_ID;
  if (!id) {
    console.error('❌ Missing NOTION_VC_DATABASE_ID environment variable');
    process.exit(1);
  }
  return id;
};

// Statuses that indicate already contacted (skip research)
const CONTACTED_STATUSES = ['Contacted', 'Sent', 'replied', 'meeting'];
// Statuses that allow research
const RESEARCHABLE_STATUSES = ['Not contacted', 'Ready for outreach', 'discovered', 'validated', 'researched', 'personalized'];

export class VCResearchStrategy extends ResearchStrategy {
  constructor(config: Record<string, unknown> = {}) {
    super(config);
    this.name = 'vc-research';
  }

  /**
   * Check if VC exists in Notion database and get its status
   * Returns: { shouldResearch: boolean, status?: string, sentDate?: string, pageId?: string }
   */
  private async checkNotionForVC(vcName: string): Promise<{ 
    shouldResearch: boolean; 
    status?: string; 
    sentDate?: string;
    pageId?: string;
    skipReason?: string;
  }> {
    try {
      const notion = getClient();
      const DATABASE_ID = getDatabaseId();
      
      console.log(`   🔍 Checking Notion database for "${vcName}"...`);
      
      // Query Notion by VC Name (case-insensitive partial match)
      const response = await queryDatabase(notion, DATABASE_ID, {
        filter: {
          property: 'Name',
          title: {
            contains: vcName
          }
        }
      });
      
      // Look for exact match (case-insensitive)
      const exactMatch = response.results.find(result => {
        const page = result as { id: string; properties: Record<string, unknown> };
        const nameProp = page.properties['Name'] as { title?: Array<{ text: { content: string } }> } | undefined;
        const name = nameProp?.title?.[0]?.text?.content || '';
        return name.toLowerCase() === vcName.toLowerCase();
      }) as { id: string; properties: Record<string, unknown> } | undefined;
      
      if (!exactMatch) {
        console.log(`   ✅ Not found in Notion - proceeding with research`);
        return { shouldResearch: true };
      }
      
      // Get status from the page
      const statusProp = exactMatch.properties['Status'] as { select?: { name: string } } | undefined;
      const status = statusProp?.select?.name || 'unknown';
      
      // Get sent date if available
      const sentAtProp = exactMatch.properties['Sent At'] as { date?: { start: string } } | undefined;
      const sentDate = sentAtProp?.date?.start;
      
      console.log(`   📊 Found in Notion: Status = "${status}"`);
      
      // Check if already contacted
      if (CONTACTED_STATUSES.some(s => status.toLowerCase() === s.toLowerCase())) {
        return {
          shouldResearch: false,
          status,
          sentDate,
          pageId: exactMatch.id,
          skipReason: `already contacted on ${sentDate ? new Date(sentDate).toLocaleDateString() : 'unknown date'}`
        };
      }
      
      // Check if researchable status
      if (RESEARCHABLE_STATUSES.some(s => status.toLowerCase() === s.toLowerCase())) {
        return {
          shouldResearch: true,
          status,
          pageId: exactMatch.id
        };
      }
      
      // Unknown status - skip to be safe
      return {
        shouldResearch: false,
        status,
        pageId: exactMatch.id,
        skipReason: `status "${status}" prevents research`
      };
      
    } catch (error) {
      console.warn(`   ⚠️  Notion check failed: ${(error as Error).message}`);
      console.warn(`   ⏭️  Proceeding with research (failed to check Notion)`);
      return { shouldResearch: true };
    }
  }

  /**
   * Research VC firm using Supabase cache → Perplexity API → skip (no fallback)
   */
  async research(entity: VCEntity): Promise<IResearchResult> {
    console.log(`📚 Researching VC: ${entity.name}...`);
    
    // STEP 1: Check Notion database for duplicates
    const notionCheck = await this.checkNotionForVC(entity.name);
    
    if (!notionCheck.shouldResearch) {
      console.log(`   ⏭️  Skipping ${entity.name} - ${notionCheck.skipReason}`);
      return {
        success: true,
        research: {
          skipped: true,
          reason: notionCheck.skipReason,
          status: notionCheck.status,
          sentDate: notionCheck.sentDate,
          pageId: notionCheck.pageId
        },
        entity
      };
    }
    
    if (notionCheck.status) {
      console.log(`   ✅ Status "${notionCheck.status}" allows research`);
    }
    
    // STEP 2: Check Supabase vc_research table for cached research
    const vcResearchData = await this.loadFromVcResearch(entity.name);
    if (vcResearchData) {
      console.log(`   📁 Found cached research in vc_research table`);
      return this.applyResearch(entity, vcResearchData);
    }
    
    // STEP 2b: Check Supabase vc_contacts for cached research (legacy)
    const supabaseResearch = await this.loadFromSupabase(entity.name);
    if (supabaseResearch) {
      console.log(`   📁 Found cached research in Supabase (vc_contacts)`);
      return this.applyResearch(entity, supabaseResearch);
    }
    
    // STEP 3: Check /tmp cache file (legacy)
    const cacheFile = `/tmp/vc-research-${this.sanitizeName(entity.name)}-result.json`;
    if (fs.existsSync(cacheFile)) {
      console.log(`   📁 Found cached research results (file)`);
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8')) as { research?: VCSearchResult };
      if (cached.research) {
        console.log(`   ✅ Using cached research`);
        fs.unlinkSync(cacheFile);
        // Persist to Supabase for future use
        await this.saveToSupabase(entity.name, cached.research);
        return this.applyResearch(entity, cached.research);
      }
    }
    
    // STEP 4: Call Perplexity API for real research
    if (process.env.USE_DIRECT_API === 'true') {
      console.log(`   🌐 Direct API mode enabled - calling Perplexity...`);
      return await this.researchViaAPI(entity, cacheFile);
    }
    
    // STEP 5: No cache, no API — SKIP personalization (do NOT use fallback)
    console.log(`   ⚠️  No research data available and USE_DIRECT_API not enabled`);
    console.log(`   ⏭️  Skipping personalization for ${entity.name} — set USE_DIRECT_API=true to enable deep research`);
    
    return {
      success: false,
      research: {
        skipped: true,
        reason: 'no_research_data_available',
        needsDeepResearch: true
      },
      entity
    };
  }

  /**
   * Apply research data to entity
   */
  private applyResearch(entity: VCEntity, research: VCSearchResult): IResearchResult {
    // Update entity with research
    entity.researchNotes = research.thesis || `${entity.name} is a venture capital firm.`;
    entity.personalizationContext = {
      ...entity.personalizationContext,
      painPoints: research.painPoints || ['AI governance', 'Coordination challenges'],
      tailoredHook: research.whyAlygn || 'Alygn provides governance infrastructure for AI coordination.',
      recentNews: research.governanceSignals?.[0]
    };
    
    // Update typeData
    if (research.portfolio && research.portfolio.length > 0) {
      entity.typeData.portfolioCompanies = research.portfolio;
    }
    if (research.partners && research.partners.length > 0) {
      entity.typeData.partners = research.partners;
    }
    if (research.recentInvestments && research.recentInvestments.length > 0) {
      entity.typeData.recentInvestments = research.recentInvestments;
    }
    
    // Contact fallback fields from research
    if ((research as any).contactFormUrl) {
      entity.typeData.contactFormUrl = (research as any).contactFormUrl;
      console.log(`   📝 Found contact form: ${(research as any).contactFormUrl}`);
    }
    if ((research as any).linkedInUrl) {
      entity.typeData.linkedInUrl = (research as any).linkedInUrl;
      console.log(`   🔗 Found LinkedIn: ${(research as any).linkedInUrl}`);
    }
    
    entity.updateStatus('researched');
    
    console.log(`   ✅ Research applied from cache`);
    
    return {
      success: true,
      research: research as Record<string, unknown>,
      entity
    };
  }

  /**
   * Load research from Supabase vc_research table (dedicated research store)
   */
  private async loadFromVcResearch(vcName: string): Promise<VCSearchResult | null> {
    try {
      const { getSupabaseClient } = await import('../../lib/external/supabase-client');
      const supabase = getSupabaseClient();
      
      const { data, error } = await supabase
        .from('vc_research')
        .select('thesis, portfolio, partners, recent_investments, pain_points, governance_signals, why_alygn, contact_form_url, linkedin_url')
        .ilike('vc_name', vcName)
        .limit(1)
        .maybeSingle();
      
      if (error || !data) return null;
      
      const result: VCSearchResult = {
        thesis: data.thesis || undefined,
        portfolio: Array.isArray(data.portfolio) ? data.portfolio as string[] : [],
        partners: Array.isArray(data.partners) ? (data.partners as Array<{ name: string; title: string }>) : [],
        recentInvestments: Array.isArray(data.recent_investments) ? (data.recent_investments as VCPortfolioCompany[]) : [],
        painPoints: Array.isArray(data.pain_points) ? data.pain_points as string[] : [],
        governanceSignals: Array.isArray(data.governance_signals) ? data.governance_signals as string[] : [],
        whyAlygn: data.why_alygn || undefined,
        contactFormUrl: data.contact_form_url || undefined,
        linkedInUrl: data.linkedin_url || undefined
      };
      
      console.log(`   ✅ Loaded from vc_research (thesis: ${data.thesis ? 'yes' : 'no'}, painPoints: ${result.painPoints?.length || 0})`);
      return result;
    } catch (err) {
      console.warn(`   ⚠️  vc_research lookup failed: ${(err as Error).message}`);
      return null;
    }
  }
  
  /**
   * Load research from Supabase vc_contacts table (legacy)
   */
  private async loadFromSupabase(vcName: string): Promise<VCSearchResult | null> {
    try {
      const { getSupabaseClient } = await import('../../lib/external/supabase-client');
      const supabase = getSupabaseClient();
      
      const { data, error } = await supabase
        .from('vc_contacts')
        .select('thesis, recent_investments, partners, pain_points, governance_signals, linkedin_url, investment_focus')
        .ilike('firm', vcName)
        .limit(1)
        .maybeSingle();
      
      if (error || !data) return null;
      
      // Only return if we have meaningful research data (not just discovered status)
      if (!data.thesis && (!data.pain_points || data.pain_points.length === 0)) {
        return null;
      }
      
      const result: VCSearchResult = {
        thesis: data.thesis || undefined,
        portfolio: Array.isArray(data.recent_investments) ? data.recent_investments as string[] : [],
        partners: Array.isArray(data.partners) ? (data.partners as Array<{ name: string; title: string }>) : [],
        recentInvestments: [],
        painPoints: Array.isArray(data.pain_points) ? data.pain_points as string[] : [],
        governanceSignals: Array.isArray(data.governance_signals) ? data.governance_signals as string[] : [],
        whyAlygn: undefined,
        linkedInUrl: data.linkedin_url || undefined
      };
      
      console.log(`   ✅ Loaded research from Supabase (thesis: ${data.thesis ? 'yes' : 'no'}, painPoints: ${result.painPoints?.length || 0})`);
      return result;
    } catch (err) {
      console.warn(`   ⚠️  Supabase lookup failed: ${(err as Error).message}`);
      return null;
    }
  }
  
  /**
   * Save research results to Supabase (vc_research + vc_contacts)
   */
  private async saveToSupabase(vcName: string, research: VCSearchResult): Promise<void> {
    try {
      const { getSupabaseClient } = await import('../../lib/external/supabase-client');
      const supabase = getSupabaseClient();
      
      // Save to vc_research table (dedicated research store)
      const researchData = {
        vc_name: vcName,
        thesis: research.thesis || null,
        portfolio: research.portfolio || research.recentInvestments?.map(ri => ri.company) || [],
        partners: research.partners || [],
        recent_investments: research.recentInvestments || [],
        pain_points: research.painPoints || [],
        governance_signals: research.governanceSignals || [],
        why_alygn: research.whyAlygn || null,
        contact_form_url: (research as any).contactFormUrl || null,
        linkedin_url: (research as any).linkedInUrl || null,
        updated_at: new Date().toISOString()
      };
      
      const { error: researchError } = await supabase
        .from('vc_research')
        .upsert(researchData, { onConflict: 'vc_name' });
      
      if (researchError) {
        console.warn(`   ⚠️  vc_research save failed: ${researchError.message}`);
      } else {
        console.log(`   💾 Research saved to vc_research table`);
      }
      
      // Also update vc_contacts (legacy)
      const updateData: Record<string, unknown> = {
        thesis: research.thesis || null,
        pain_points: research.painPoints || [],
        governance_signals: research.governanceSignals || [],
        recent_investments: research.portfolio || research.recentInvestments?.map(ri => ri.company) || [],
        partners: research.partners || [],
        linkedin_url: (research as any).linkedInUrl || null,
        status: 'researched',
        updated_at: new Date().toISOString()
      };
      
      const { error: contactsError } = await supabase
        .from('vc_contacts')
        .update(updateData)
        .ilike('firm', vcName);
      
      if (contactsError) {
        console.warn(`   ⚠️  vc_contacts save failed: ${contactsError.message}`);
      } else {
        console.log(`   💾 Research synced to vc_contacts`);
      }
    } catch (err) {
      console.warn(`   ⚠️  Supabase save failed: ${(err as Error).message}`);
    }
  }

  /**
   * Sanitize name for filename
   */
  private sanitizeName(name: string): string {
    return name.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 50);
  }

  /**
   * Dry-run research (mock data)
   */
  async researchDryRun(entity: VCEntity): Promise<IResearchResult> {
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
   * Research VC via Perplexity API (direct call) + save to Supabase
   */
  private async researchViaAPI(entity: VCEntity, cacheFile: string): Promise<IResearchResult> {
    try {
      // Load credentials from skill's config directory (with legacy fallback)
      const configPath = path.resolve(__dirname, '../../../config/credentials.json');
      let credentials: { perplexity?: { apiKey?: string }; openrouter?: { apiKey?: string } } = {};
      
      if (fs.existsSync(configPath)) {
        credentials = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      } else {
        const legacyPath = path.join(process.env.HOME || '', '.openclaw/workspace/config/credentials.json');
        if (fs.existsSync(legacyPath)) {
          credentials = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
        }
      }
      
      // Try Perplexity API key first, then OpenRouter
      const perplexityKey = credentials?.perplexity?.apiKey || process.env.PERPLEXITY_API_KEY;
      const openrouterKey = credentials?.openrouter?.apiKey || process.env.OPENROUTER_API_KEY;
      
      let research: VCSearchResult;
      
      if (perplexityKey) {
        // Direct Perplexity API call
        console.log(`   🔍 Calling Perplexity API for ${entity.name}...`);
        const response = await fetch('https://api.perplexity.ai/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${perplexityKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'sonar-pro',
            messages: [{
              role: 'user',
              content: `Research VC firm "${entity.name}" ${entity.website ? `(${entity.website})` : ''}. Find: investment thesis, 3-5 portfolio companies, 2-3 key partners with titles, recent investments, pain points related to AI governance, governance signals. Return JSON: {thesis, portfolio[], partners[{name,title,linkedInUrl}], recentInvestments[{company,date,stage}], painPoints[], governanceSignals[], whyAlygn, contactFormUrl, linkedInUrl}`
            }]
          })
        });
        
        if (!response.ok) {
          throw new Error(`Perplexity API error: ${response.status}`);
        }
        
        const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
        const content = data.choices?.[0]?.message?.content || '{}';
        
        try {
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          research = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(content);
        } catch {
          throw new Error('Failed to parse Perplexity response');
        }
      } else if (openrouterKey) {
        // Fallback to OpenRouter
        console.log(`   🔍 Calling OpenRouter API for ${entity.name}...`);
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openrouterKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://alygn.org',
            'X-Title': 'Alygn VC Research'
          },
          body: JSON.stringify({
            model: 'perplexity/sonar-pro',
            messages: [
              {
                role: 'system',
                content: 'You are a VC research assistant. Return ONLY a JSON object with: thesis (1-2 sentences), portfolio (array of company names), partners (array of {name, title, linkedInUrl}), recentInvestments (array of {company, date, stage}), painPoints (array), governanceSignals (array), whyAlygn (string explaining fit), contactFormUrl (URL of their contact form if found), linkedInUrl (firm LinkedIn page URL if found).'
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
          throw new Error(`OpenRouter API error: ${response.status}`);
        }
        
        const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
        const content = data.choices?.[0]?.message?.content || '{}';
        
        try {
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          research = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(content);
        } catch {
          throw new Error('Failed to parse OpenRouter response');
        }
      } else {
        throw new Error('No API key found (PERPLEXITY_API_KEY or OPENROUTER_API_KEY)');
      }
      
      // Save to /tmp cache
      fs.writeFileSync(cacheFile, JSON.stringify({ research, timestamp: new Date().toISOString() }, null, 2));
      
      // Save to Supabase for persistence
      await this.saveToSupabase(entity.name, research);
      
      console.log(`   ✅ API research complete`);
      return this.applyResearch(entity, research);
      
    } catch (error) {
      const err = error as Error;
      console.error(`   ❌ API failed: ${err.message}`);
      console.log(`   ⏭️  Skipping personalization — no research data available`);
      
      return {
        success: false,
        research: {
          skipped: true,
          reason: `api_error: ${err.message}`,
          needsDeepResearch: true
        },
        entity
      };
    }
  }
}

export default VCResearchStrategy;
