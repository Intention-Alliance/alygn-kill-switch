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
import { getClient, queryDatabase } from '../../lib/external/notion-client';
import { ResearchStrategy, type IResearchResult } from './ResearchStrategy';

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

// Notion datasource ID for VC outreach (formerly databaseId)
const getDatasourceId = () => {
  return process.env.NOTION_VC_DATASOURCE_ID || process.env.NOTION_VC_DATABASE_ID || '30533487-4af6-81e7-ad64-000bbd4829ff';
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
      const DATABASE_ID = getDatasourceId();
      
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
   * Research VC firm using OpenClaw Script ↔ AI Execution pattern
   */
  async research(entity: VCEntity): Promise<IResearchResult> {
    console.log(`📚 Researching VC: ${entity.name}...`);
    
    // STEP 1: Check Notion database for duplicates
    const notionCheck = await this.checkNotionForVC(entity.name);
    
    
    // ═══════════════════════════════════════════════════════════
    // SENT-TRACKER CHECK: Reconcile against IMAP sent folder
    // (canonical ground truth), then skip if already contacted.
    // Catches duplicates that slipped past Notion/Discovery checks.
    // ═══════════════════════════════════════════════════════════
    try {
      const { reconcileSentState } = await import('../../lib/email/sent-inbox-canonical');
      const canonical = await reconcileSentState();
      const email = (entity.getEmail?.() || entity.email || '').toLowerCase();
      const domain = email.split('@')[1] || '';
      if (email && (canonical.sentEmails.has(email) || canonical.sentDomains.has(domain))) {
        console.log(`   ⏭️  SKIP ${entity.name} (${email}) — already contacted (IMAP-verified, source=${canonical.source})`);
        return {
          success: true,
          research: {
            skipped: true,
            reason: `Already contacted — email ${email} verified via ${canonical.source}`,
          },
          entity
        };
      }
    } catch (err) {
      console.warn(`   ⚠️  IMAP sent check failed: ${(err as Error).message} — continuing`);
      // Fallback: raw file read
      try {
        const sentTrackerPath = path.join(
          process.env.HOME || '/home/andlersrv',
          '.openclaw/workspace/scripts/alygn/lib/sent-emails.json'
        );
        if (fs.existsSync(sentTrackerPath)) {
          const tracker = JSON.parse(fs.readFileSync(sentTrackerPath, 'utf8'));
          const sentEntries = tracker.vcs || [];
          const sentEmails = new Set(sentEntries.map((s: { email?: string }) => (s.email || '').toLowerCase()));
          const sentDomains = new Set(
            sentEntries
              .map((s: { email?: string }) => (s.email || '').toLowerCase().split('@')[1] || '')
              .filter(Boolean)
          );
          const email = (entity.getEmail?.() || entity.email || '').toLowerCase();
          const domain = email.split('@')[1] || '';
          if (email && (sentEmails.has(email) || sentDomains.has(domain))) {
            console.log(`   ⏭️  SKIP ${entity.name} (${email}) — already contacted (file-only match)`);
            return {
              success: true,
              research: { skipped: true, reason: `Already contacted` },
              entity
            };
          }
        }
      } catch (e2) {
        console.warn(`   ⚠️  File fallback also failed: ${(e2 as Error).message}`);
      }
    }
    // ═══════════════════════════════════════════════════════════

    if (!notionCheck.shouldResearch) {
      // Skip research - already contacted
      console.log(`   ⏭️  Skipping ${entity.name} - ${notionCheck.skipReason}`);
      
      // Return a "skipped" result
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
    
    // Continue with normal research flow...
    
    // Cache-first: Check for existing research results
    const cacheFile = `/tmp/vc-research-${this.sanitizeName(entity.name)}-result.json`;
    if (fs.existsSync(cacheFile)) {
      console.log(`   📁 Found cached research results`);
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8')) as { research?: VCSearchResult };
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
    
    // No cache and no direct API — this is a configuration error
    throw new Error(
      `USE_DIRECT_API=true required for VC research on "${entity.name}". ` +
      `Set the environment variable or use --deep-research flag. ` +
      `The request-file/sub-agent pattern has been removed.`
    );
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
    
    entity.updateStatus('researched');
    
    console.log(`   ✅ Research applied from cache`);
    
    return {
      success: true,
      research: research as Record<string, unknown>,
      entity
    };
  }

  /**
   * Fallback research when no cache exists
   */
  private fallbackResearch(entity: VCEntity): IResearchResult {
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
   * Research VC via Perplexity API (direct fallback)
   */
  private async researchViaAPI(entity: VCEntity, cacheFile: string): Promise<IResearchResult> {
    try {
      // Load credentials from skill's config directory (with legacy fallback)
      const configPath = path.resolve(__dirname, '../../../config/credentials.json');
      let credentials: { perplexity?: { apiKey?: string }; openrouter?: { apiKey?: string } } = {};
      
      if (fs.existsSync(configPath)) {
        credentials = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      } else {
        // Legacy fallback to workspace credentials
        const legacyPath = path.join(process.env.HOME || '/home/andlersrv', '.openclaw/workspace/config/credentials.json');
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
      
      let research: VCSearchResult;
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
      const err = error as Error;
      console.error(`   ❌ API failed: ${err.message}`);
      throw new Error(
        `VC research via API failed for "${entity.name}": ${err.message}. ` +
        `Fix API configuration or use --deep-research flag for manual research.`
      );
    }
  }
}

export default VCResearchStrategy;
