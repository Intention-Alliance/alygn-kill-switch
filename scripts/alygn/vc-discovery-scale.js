#!/usr/bin/env node
/**
 * VC Discovery at Scale - Find 100+ AI Safety/Governance VCs
 * Uses multiple search strategies and validates emails
 */

import { RegexMXValidator } from '$HOME/.openclaw/workspace/scripts/alygn/lib/email/validators/RegexMXValidator.js';
import { SentEmailTracker } from '$HOME/.openclaw/workspace/scripts/alygn/lib/SentEmailTracker.js';
import { web_search } from '$HOME/.openclaw/workspace/scripts/alygn/lib/web-search.js';
import fs from 'fs';

// Search queries for different VC categories
const SEARCH_QUERIES = [
  // AI Safety focused
  'AI safety venture capital seed stage 2024 2025',
  'AI alignment investment fund',
  'existential risk venture capital',
  'AGI governance investors',
  'AI safety startup funding',
  
  // AI Governance
  'AI governance venture capital',
  'AI policy investment fund',
  'responsible AI venture capital',
  'AI ethics investment',
  'AI regulation venture capital',
  
  // Frontier Tech
  'frontier technology venture capital',
  'deep tech AI investors',
  'transformative technology VC',
  'hard tech AI venture capital',
  
  // Corporate VCs
  'Google Ventures AI safety',
  'Microsoft M12 AI investment',
  'Amazon Alexa Fund AI',
  'Intel Capital AI',
  'NVIDIA venture AI',
  
  // University/Research spinouts
  'Stanford AI lab venture capital',
  'MIT AI venture fund',
  'Berkeley AI research investors',
  'OpenAI startup fund',
  'Anthropic venture partners',
  
  // International
  'European AI safety venture capital',
  'UK AI governance investors',
  'EU AI Act venture capital',
  'Canadian AI safety VC',
  'Australian AI governance fund',
  
  // Impact/ESG focused
  'impact venture capital AI',
  'ESG AI investors',
  'social impact AI fund',
  'mission-driven AI venture capital',
  
  // Specific firms known for AI
  'Lux Capital AI investments',
  'Founders Fund AI portfolio',
  'Andreessen Horowitz AI',
  'Sequoia AI safety',
  'Greylock AI investments',
  'Bessemer Venture Partners AI',
  'First Round Capital AI',
  'Accel Partners AI',
  'Index Ventures AI',
  'Atomico AI investments'
];

// Known AI safety relevant VCs to seed the list
const SEED_VCS = [
  { name: 'Anthropic', type: 'corporate', focus: 'AI safety' },
  { name: 'OpenAI Startup Fund', type: 'corporate', focus: 'AI safety' },
  { name: 'Lux Capital', type: 'vc', focus: 'frontier tech' },
  { name: 'Founders Fund', type: 'vc', focus: 'frontier tech' },
  { name: 'A16Z', type: 'vc', focus: 'AI' },
  { name: 'Sequoia Capital', type: 'vc', focus: 'AI' },
  { name: 'Greylock Partners', type: 'vc', focus: 'AI' },
  { name: 'Bessemer Venture Partners', type: 'vc', focus: 'AI' },
  { name: 'First Round Capital', type: 'vc', focus: 'seed' },
  { name: 'Accel', type: 'vc', focus: 'AI' },
  { name: 'Index Ventures', type: 'vc', focus: 'AI' },
  { name: 'Atomico', type: 'vc', focus: 'AI' },
  { name: 'General Catalyst', type: 'vc', focus: 'AI' },
  { name: 'Lightspeed Venture Partners', type: 'vc', focus: 'AI' },
  { name: 'Khosla Ventures', type: 'vc', focus: 'frontier tech' },
  { name: 'DCVC', type: 'vc', focus: 'deep tech' },
  { name: 'Data Collective', type: 'vc', focus: 'AI' },
  { name: 'Bloomberg Beta', type: 'corporate', focus: 'AI' },
  { name: 'Comcast Ventures', type: 'corporate', focus: 'AI' },
  { name: 'Samsung Next', type: 'corporate', focus: 'AI' },
  { name: 'Qualcomm Ventures', type: 'corporate', focus: 'AI' },
  { name: 'Salesforce Ventures', type: 'corporate', focus: 'AI' },
  { name: 'Workday Ventures', type: 'corporate', focus: 'AI' },
  { name: 'SAP.iO', type: 'corporate', focus: 'AI' },
  { name: 'GV (Google Ventures)', type: 'corporate', focus: 'AI' },
  { name: 'Gradient Ventures', type: 'corporate', focus: 'AI' },
  { name: 'M12 (Microsoft)', type: 'corporate', focus: 'AI' },
  { name: 'Alexa Fund', type: 'corporate', focus: 'AI' },
  { name: 'Intel Capital', type: 'corporate', focus: 'AI' },
  { name: 'NVIDIA Ventures', type: 'corporate', focus: 'AI' }
];

class VCScaleDiscovery {
  constructor() {
    this.discoveredVCs = new Map();
    this.validator = new RegexMXValidator();
    this.tracker = new SentEmailTracker();
    this.validatedVCs = [];
  }

  /**
   * Calculate Alygn Fit Score
   */
  calculateFitScore(vc) {
    let score = 0;
    const focus = (vc.focus || '').toLowerCase();
    const name = (vc.name || '').toLowerCase();
    
    // AI safety focus: +3
    if (focus.includes('safety') || focus.includes('alignment') || 
        focus.includes('existential') || focus.includes('governance')) {
      score += 3;
    }
    
    // Governance interest: +3
    if (focus.includes('governance') || focus.includes('policy') || 
        focus.includes('regulation') || focus.includes('ethics')) {
      score += 3;
    }
    
    // Recent relevant deals: +2
    if (vc.recentInvestments && vc.recentInvestments.length > 0) {
      const aiDeals = vc.recentInvestments.filter(inv => 
        inv.toLowerCase().includes('ai') || 
        inv.toLowerCase().includes('machine learning')
      ).length;
      if (aiDeals > 0) score += 2;
    }
    
    // Partner accessibility: +2
    if (vc.partners && vc.partners.length > 0) {
      score += 2;
    }
    
    // Seed/pre-seed stage preference: +2
    if (vc.stageFocus && vc.stageFocus.some(s => 
      s.toLowerCase().includes('seed') || s.toLowerCase().includes('pre-seed')
    )) {
      score += 2;
    }
    
    return Math.min(score, 10);
  }

  /**
   * Search for VCs using web search
   */
  async searchVCs(query, count = 10) {
    console.log(`\n🔍 Searching: "${query}"`);
    
    try {
      // Use web_search tool
      const results = await web_search({
        query: query,
        count: count
      });
      
      const vcs = [];
      
      for (const result of results) {
        // Extract VC info from search result
        const vc = this.extractVCFromResult(result);
        if (vc && !this.discoveredVCs.has(vc.name)) {
          this.discoveredVCs.set(vc.name, vc);
          vcs.push(vc);
        }
      }
      
      console.log(`   ✅ Found ${vcs.length} new VCs`);
      return vcs;
      
    } catch (error) {
      console.error(`   ❌ Search failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Extract VC info from search result
   */
  extractVCFromResult(result) {
    // Basic extraction - would be enhanced with actual parsing
    const title = result.title || '';
    const snippet = result.snippet || '';
    const url = result.url || '';
    
    // Try to extract firm name
    const firmMatch = title.match(/^([^|\-–]+)/);
    const name = firmMatch ? firmMatch[1].trim() : title;
    
    if (!name || name.length < 3) return null;
    
    return {
      name: name,
      website: url,
      source: 'web_search',
      discoveredAt: new Date().toISOString()
    };
  }

  /**
   * Research a specific VC for detailed info
   */
  async researchVC(vcName) {
    console.log(`📚 Researching: ${vcName}`);
    
    try {
      const query = `${vcName} venture capital investment thesis partners contact email`;
      const results = await web_search({ query, count: 5 });
      
      // Extract key information
      const research = {
        name: vcName,
        thesis: '',
        partners: [],
        email: null,
        stageFocus: [],
        sectorFocus: [],
        recentInvestments: [],
        website: null,
        linkedInUrl: null,
        crunchbaseUrl: null
      };
      
      for (const result of results) {
        const text = `${result.title} ${result.snippet}`;
        
        // Extract website
        if (result.url && !research.website) {
          research.website = result.url;
        }
        
        // Extract email patterns
        const emailMatch = text.match(/[\w.-]+@[\w.-]+\.[\w]{2,}/);
        if (emailMatch && !research.email) {
          research.email = emailMatch[0];
        }
        
        // Extract partner names
        const partnerMatches = text.match(/([A-Z][a-z]+ [A-Z][a-z]+),?\s*(Partner|Managing Director|Principal)/gi);
        if (partnerMatches) {
          research.partners = partnerMatches.map(m => m.replace(/,\s*(Partner|Managing Director|Principal)/i, ''));
        }
      }
      
      return research;
      
    } catch (error) {
      console.error(`   ❌ Research failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Validate email and add to list
   */
  async validateAndAdd(vc) {
    if (!vc.email) {
      // Try to construct email from website
      if (vc.website) {
        const domain = vc.website.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
        // Common patterns
        const patterns = [
          `info@${domain}`,
          `contact@${domain}`,
          `hello@${domain}`,
          `partnerships@${domain}`
        ];
        
        for (const pattern of patterns) {
          console.log(`   🔍 Trying pattern: ${pattern}`);
          const result = await this.validator.validate(pattern);
          if (result.result === 'valid') {
            vc.email = pattern;
            vc.emailConfidence = result.confidence;
            break;
          }
        }
      }
    }
    
    if (vc.email) {
      // Validate existing email
      const result = await this.validator.validate(vc.email);
      
      if (result.result === 'valid') {
        // Check if already sent
        if (this.tracker.wasAlreadySent(vc.email, 'vc')) {
          console.log(`   ⏭️  Already sent to ${vc.email}`);
          return null;
        }
        
        vc.emailValidated = true;
        vc.emailConfidence = result.confidence;
        vc.alygnFitScore = this.calculateFitScore(vc);
        
        this.validatedVCs.push(vc);
        console.log(`   ✅ Validated: ${vc.name} (${vc.email}) - Score: ${vc.alygnFitScore}/10`);
        return vc;
      } else {
        console.log(`   ❌ Invalid email: ${vc.email}`);
      }
    }
    
    return null;
  }

  /**
   * Run full discovery process
   */
  async run(targetCount = 100) {
    console.log('╔════════════════════════════════════════╗');
    console.log('║   VC Discovery at Scale - Target 100   ║');
    console.log('╚════════════════════════════════════════╝\n');
    
    // Phase 1: Search with multiple queries
    console.log('📍 Phase 1: Discovery');
    for (const query of SEARCH_QUERIES.slice(0, 15)) {
      if (this.discoveredVCs.size >= targetCount * 1.5) break;
      await this.searchVCs(query, 10);
      await new Promise(r => setTimeout(r, 1000)); // Rate limiting
    }
    
    // Add seed VCs
    console.log('\n📍 Adding seed VCs...');
    for (const seed of SEED_VCS) {
      if (!this.discoveredVCs.has(seed.name)) {
        this.discoveredVCs.set(seed.name, {
          ...seed,
          source: 'seed_list',
          discoveredAt: new Date().toISOString()
        });
      }
    }
    
    console.log(`\n📊 Total discovered: ${this.discoveredVCs.size} VCs`);
    
    // Phase 2: Research and validate
    console.log('\n📍 Phase 2: Research & Validation');
    const vcList = Array.from(this.discoveredVCs.values());
    
    for (const vc of vcList.slice(0, targetCount * 1.5)) {
      if (this.validatedVCs.length >= targetCount) break;
      
      const researched = await this.researchVC(vc.name);
      if (researched) {
        await this.validateAndAdd({ ...vc, ...researched });
      }
      await new Promise(r => setTimeout(r, 500));
    }
    
    // Phase 3: Filter by fit score
    console.log('\n📍 Phase 3: Filtering by Alygn Fit Score');
    const highQualityVCs = this.validatedVCs
      .filter(vc => vc.alygnFitScore >= 7)
      .slice(0, targetCount);
    
    console.log(`\n✅ Final count: ${highQualityVCs.length} high-quality VCs`);
    
    // Save results
    const outputPath = '/tmp/alygn-vc-discovery-scale.json';
    fs.writeFileSync(outputPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      totalDiscovered: this.discoveredVCs.size,
      totalValidated: this.validatedVCs.length,
      highQualityCount: highQualityVCs.length,
      vcs: highQualityVCs
    }, null, 2));
    
    console.log(`\n💾 Results saved to: ${outputPath}`);
    
    return highQualityVCs;
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const discovery = new VCScaleDiscovery();
  discovery.run(100).then(vcs => {
    console.log('\n📋 Top 10 VCs by Fit Score:');
    vcs.slice(0, 10).forEach((vc, i) => {
      console.log(`  ${i + 1}. ${vc.name} (${vc.email}) - Score: ${vc.alygnFitScore}/10`);
    });
    process.exit(0);
  }).catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { VCScaleDiscovery };
