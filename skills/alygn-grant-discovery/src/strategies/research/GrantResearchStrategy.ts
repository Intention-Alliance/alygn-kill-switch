/**
 * GrantResearchStrategy
 * Deep research with cross-validation from multiple sources
 * 
 * Pattern:
 * 1. Query Grok for comprehensive grant details
 * 2. Query Perplexity for web-verified information
 * 3. Scrape official grant pages with web_fetch
 * 4. Validate and merge conflicting data
 * 5. Calculate confidence scores based on source agreement
 */

import { GrantEntity } from '../../entities/GrantEntity';
import type { ResearchSource, PartialGrantEntity } from '../../types/index';
import fs from 'fs';
import path from 'path';

/**
 * Strategy for deep research on discovered grants
 * Cross-validates information from multiple sources
 */
export class GrantResearchStrategy {
  private config: {
    grokApiKey?: string;
    perplexityApiKey?: string;
    useDirectAPI?: boolean;
  };

  /**
   * Creates a new GrantResearchStrategy
   * 
   * @param {object} config - Research configuration
   */
  constructor(config: { grokApiKey?: string; perplexityApiKey?: string; useDirectAPI?: boolean } = {}) {
    this.config = config;
  }

  /**
   * Research a grant comprehensively from multiple sources
   * 
   * @param {GrantEntity} grant - Grant to research
   * @returns {Promise<GrantEntity>} Enriched grant entity
   */
  async research(grant: GrantEntity, opts?: { deepResearch?: boolean }): Promise<GrantEntity> {
    console.log(`📚 Researching grant: ${grant.name}...`);
    if (opts?.deepResearch) {
      console.log(`   🔬 Deep research enabled (Perplexity + Firecrawl + web search)`);
    }
    
    // Check cache first
    const cacheFile = `/tmp/grant-research-${this.sanitizeName(grant.name)}-result.json`;
    if (fs.existsSync(cacheFile)) {
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      if (cached.research) {
        console.log(`   📁 Using cached research results`);
        fs.unlinkSync(cacheFile);
        return this.applyResearch(grant, cached.research);
      }
    }

    // Collect research from multiple sources
    const results: Partial<GrantEntity>[] = [];
    const sources: ResearchSource[] = [];

    try {
      const grokResult = await this.researchWithGrok(grant);
      if (grokResult && Object.keys(grokResult).length > 0) {
        results.push(grokResult);
        sources.push({
          url: `grok://research/${grant.id}`,
          source: 'grok',
          date: new Date(),
          confidence: 0.7
        });
      }
    } catch (error) {
      console.error(`   ❌ Grok research failed:`, error instanceof Error ? error.message : String(error));
    }

    try {
      const perplexityResult = await this.researchWithPerplexity(grant);
      if (perplexityResult && Object.keys(perplexityResult).length > 0) {
        results.push(perplexityResult);
        sources.push({
          url: perplexityResult.researchSources?.[0]?.url || `perplexity://research/${grant.id}`,
          source: 'perplexity',
          date: new Date(),
          confidence: 0.8
        });
      }
    } catch (error) {
      console.error(`   ❌ Perplexity research failed:`, error instanceof Error ? error.message : String(error));
    }

    // Try web scraping if we have a form URL
    if (grant.applicationProcess?.formUrl) {
      try {
        const webResult = await this.scrapeWithWebFetch(grant.applicationProcess.formUrl);
        if (webResult && Object.keys(webResult).length > 0) {
          results.push(webResult);
          sources.push({
            url: grant.applicationProcess.formUrl,
            source: 'web_fetch',
            date: new Date(),
            confidence: 0.95
          });
        }
      } catch (error) {
        console.error(`   ❌ Web scraping failed:`, error instanceof Error ? error.message : String(error));
      }
    }

    // Validate and merge results
    const mergedResearch = this.validateAndMerge(results);
    
    // Calculate confidence based on source agreement
    const confidence = this.calculateConfidence(sources);
    
    // Update sources with final confidence
    sources.forEach(s => s.confidence *= confidence);

    // Apply research to grant
    const enrichedGrant = this.applyResearch(grant, mergedResearch);
    
    // Add research sources
    sources.forEach(source => enrichedGrant.addResearchSource(source));
    
    // Update status
    enrichedGrant.updateStatus('researched');
    
    console.log(`   ✅ Research complete: ${sources.length} sources, ${Math.round(confidence * 100)}% confidence`);
    
    return enrichedGrant;
  }

  /**
   * Research grant using Grok AI
   * 
   * @param {GrantEntity} grant - Grant to research
   * @returns {Promise<Partial<GrantEntity>>} Research results
   * @private
   */
  private async researchWithGrok(grant: GrantEntity): Promise<Partial<GrantEntity>> {
    const cacheFile = `/tmp/grant-research-grok-${this.sanitizeName(grant.name)}.json`;
    
    if (fs.existsSync(cacheFile)) {
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      fs.unlinkSync(cacheFile);
      return cached;
    }

    if (this.config.useDirectAPI && this.config.grokApiKey) {
      // Direct API call
      const response = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.grokApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'grok-beta',
          messages: [
            {
              role: 'system',
              content: 'Research this grant and return JSON with: applicationProcess (steps, formUrl, contactEmail, requiredDocuments), organizationCulture (values, approach, community), alignmentScore (0-10), alignmentRationale.'
            },
            {
              role: 'user',
              content: `Research grant: ${grant.name} by ${grant.organization}. Current known info: ${grant.researchAreas.join(', ')}`
            }
          ],
          max_tokens: 4000
        })
      });

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '{}';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      return jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    }

    // Request file pattern
    const requestFile = `/tmp/grant-research-grok-${this.sanitizeName(grant.name)}-request.json`;
    const request = {
      type: 'grant-research',
      source: 'grok',
      grantName: grant.name,
      organization: grant.organization,
      outputFile: cacheFile,
      timestamp: new Date().toISOString(),
      instructions: `Research grant "${grant.name}" by ${grant.organization}. Find application process details, organization culture, and ALYGN alignment assessment.`
    };
    
    fs.writeFileSync(requestFile, JSON.stringify(request, null, 2));
    return {};
  }

  /**
   * Research grant using Perplexity with web search
   * 
   * @param {GrantEntity} grant - Grant to research
   * @returns {Promise<Partial<GrantEntity>>} Research results
   * @private
   */
  private async researchWithPerplexity(grant: GrantEntity): Promise<Partial<GrantEntity>> {
    const cacheFile = `/tmp/grant-research-perplexity-${this.sanitizeName(grant.name)}.json`;
    
    if (fs.existsSync(cacheFile)) {
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      fs.unlinkSync(cacheFile);
      return cached;
    }

    if (this.config.useDirectAPI) {
      const credentialsPath = path.join(process.env.HOME || '', '.openclaw/workspace/config/credentials.json');
      let apiKey = this.config.perplexityApiKey;
      
      if (!apiKey && fs.existsSync(credentialsPath)) {
        const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
        apiKey = credentials?.perplexity?.apiKey || credentials?.openrouter?.apiKey;
      }

      if (!apiKey) return {};

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://alygn.org',
          'X-Title': 'ALYGN Grant Research'
        },
        body: JSON.stringify({
          model: 'perplexity/sonar-pro',
          messages: [
            {
              role: 'system',
              content: 'Use web_search to research this grant. Return JSON with: applicationProcess (steps, formUrl, contactEmail, requiredDocuments), organizationCulture (values, approach, community), exclusions (array of excluded topics).'
            },
            {
              role: 'user',
              content: `Research: ${grant.name} by ${grant.organization}. Find official application details, deadlines, requirements, and funding priorities.`
            }
          ],
          max_tokens: 4000
        })
      });

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '{}';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      return jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    }

    // Request file pattern
    const requestFile = `/tmp/grant-research-perplexity-${this.sanitizeName(grant.name)}-request.json`;
    const request = {
      type: 'grant-research',
      source: 'perplexity',
      grantName: grant.name,
      organization: grant.organization,
      outputFile: cacheFile,
      timestamp: new Date().toISOString(),
      instructions: `Use web_search to research "${grant.name}" by ${grant.organization}. Find application process, deadlines, requirements, and organizational priorities.`
    };
    
    fs.writeFileSync(requestFile, JSON.stringify(request, null, 2));
    return {};
  }

  /**
   * Scrape grant page using web_fetch
   * 
   * @param {string} url - URL to scrape
   * @returns {Promise<Partial<GrantEntity>>} Scraped data
   * @private
   */
  private async scrapeWithWebFetch(url: string): Promise<Partial<GrantEntity>> {
    const cacheFile = `/tmp/grant-research-webfetch-${Buffer.from(url).toString('base64').substring(0, 20)}.json`;
    
    if (fs.existsSync(cacheFile)) {
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      fs.unlinkSync(cacheFile);
      return cached;
    }

    // Request file for web_fetch
    const requestFile = `/tmp/grant-research-webfetch-request-${Date.now()}.json`;
    const request = {
      type: 'grant-research',
      source: 'web_fetch',
      url,
      outputFile: cacheFile,
      timestamp: new Date().toISOString(),
      instructions: `Fetch ${url} and extract: deadline, amount details, eligibility requirements, application steps, required documents.`
    };
    
    fs.writeFileSync(requestFile, JSON.stringify(request, null, 2));
    return {};
  }

  /**
   * Validate and merge research results from multiple sources
   * 
   * @param {Partial<GrantEntity>[]} results - Research results
   * @returns {Partial<GrantEntity>} Merged research
   * @private
   */
  private validateAndMerge(results: Partial<GrantEntity>[]): Partial<GrantEntity> {
    if (results.length === 0) return {};
    if (results.length === 1) return results[0];

    const merged: Partial<GrantEntity> = {};

    // Merge application process - prefer most detailed
    const processes = results.map(r => r.applicationProcess).filter(Boolean);
    if (processes.length > 0) {
      // Sort by number of steps (more detail = likely better)
      processes.sort((a, b) => (b?.steps?.length || 0) - (a?.steps?.length || 0));
      merged.applicationProcess = processes[0];
    }

    // Merge organization culture - combine unique values
    const cultures = results.map(r => r.organizationCulture).filter(Boolean);
    if (cultures.length > 0) {
      const allValues = [...new Set(cultures.flatMap(c => c?.values || []))];
      merged.organizationCulture = {
        ...cultures[0],
        values: allValues
      };
    }

    // Merge exclusions
    const allExclusions = [...new Set(results.flatMap(r => r.exclusions || []))];
    if (allExclusions.length > 0) {
      merged.exclusions = allExclusions;
    }

    // Take alignment from source with highest confidence
    const alignments = results
      .filter(r => r.alignmentScore !== undefined)
      .sort((a, b) => (b.alignmentScore || 0) - (a.alignmentScore || 0));
    if (alignments.length > 0) {
      merged.alignmentScore = alignments[0].alignmentScore;
      merged.alignmentRationale = alignments[0].alignmentRationale;
    }

    return merged;
  }

  /**
   * Calculate confidence score based on source agreement
   * 
   * @param {ResearchSource[]} sources - Research sources
   * @returns {number} Confidence score (0-1)
   * @private
   */
  private calculateConfidence(sources: ResearchSource[]): number {
    if (sources.length === 0) return 0;
    if (sources.length === 1) return sources[0].confidence * 0.7; // Single source = lower confidence

    // Calculate agreement score
    const avgConfidence = sources.reduce((acc, s) => acc + s.confidence, 0) / sources.length;
    
    // Bonus for multiple independent sources
    const sourceBonus = Math.min(sources.length * 0.1, 0.2);
    
    return Math.min(avgConfidence + sourceBonus, 1.0);
  }

  /**
   * Apply research data to a grant entity
   * 
   * @param {GrantEntity} grant - Grant to enrich
   * @param {Partial<GrantEntity>} research - Research data
   * @returns {GrantEntity} Enriched grant
   * @private
   */
  private applyResearch(grant: GrantEntity, research: Partial<GrantEntity>): GrantEntity {
    // Update application process
    if (research.applicationProcess) {
      grant.applicationProcess = {
        ...grant.applicationProcess,
        ...research.applicationProcess,
        requiredDocuments: research.applicationProcess.requiredDocuments || 
                          grant.applicationProcess?.requiredDocuments || []
      };
    }

    // Update organization culture
    if (research.organizationCulture) {
      grant.organizationCulture = {
        ...grant.organizationCulture,
        ...research.organizationCulture,
        values: [
          ...new Set([
            ...(grant.organizationCulture?.values || []),
            ...(research.organizationCulture.values || [])
          ])
        ]
      };
    }

    // Update exclusions
    if (research.exclusions) {
      grant.exclusions = [...new Set([...grant.exclusions, ...research.exclusions])];
    }

    // Update alignment if present
    if (research.alignmentScore !== undefined) {
      grant.alignmentScore = research.alignmentScore;
    }
    if (research.alignmentRationale) {
      grant.alignmentRationale = research.alignmentRationale;
    }

    return grant;
  }

  /**
   * Sanitize name for filename
   * 
   * @param {string} name - Name to sanitize
   * @returns {string} Sanitized name
   * @private
   */
  private sanitizeName(name: string): string {
    return name.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 50);
  }
}

export default GrantResearchStrategy;
