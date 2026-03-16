/**
 * ALYGN VC Discovery & Curation Script
 * 
 * Purpose: Discover, research, and curate AI safety/governance VCs
 * 
 * Features:
 * - Web search for VCs by focus area
 * - Research: portfolio, thesis, partners, pain points
 * - Relevance scoring (1-10)
 * - Output: JSON file + Notion database
 * 
 * Usage:
 *   node vc-discovery-curation.js [query] [limit]
 *   
 * Examples:
 *   node vc-discovery-curation.js "AI safety seed investors" 20
 *   node vc-discovery-curation.js "AI governance VCs" 30
 * 
 * Created: Feb 12, 2026
 */

import { exec } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";
const execAsync = promisify(exec);

// Configuration
const CONFIG = {
  outputDir: path.join(process.env.HOME, '.openclaw/workspace/scripts/alygn/vc-outreach'),
  seedListPath: path.join(process.env.HOME, '.openclaw/workspace/scripts/alygn/vc-outreach/seed-vc-list.json'),
  minRelevanceScore: 7,
  defaultLimit: 20,
  notionDatabaseId: '2fe33487-4af6-8137-868e-e14fd068948c', // Weekly Progress database (placeholder)
};

// VC relevance scoring criteria
const RELEVANCE_CRITERIA = {
  keywords: {
    high: ['AI safety', 'AI alignment', 'existential risk', 'AGI governance', 'AI oversight'],
    medium: ['AI governance', 'AI ethics', 'responsible AI', 'AI policy', 'AI regulation'],
    low: ['AI', 'machine learning', 'deep tech', 'frontier tech']
  },
  stage: {
    preferred: ['seed', 'pre-seed', 'series A'],
    acceptable: ['series B', 'early stage']
  },
  geography: ['US', 'EU', 'UK', 'Canada', 'Global']
};

/**
 * Search web for VCs matching query
 */
async function searchVCs(query, limit = CONFIG.defaultLimit) {
  console.log(`🔍 Searching for: "${query}" (limit: ${limit})...`);
  
  try {
    // Use web_search tool via OpenClaw CLI (simulated here)
    const searchQuery = `${query} venture capital firms contacts`;
    
    // For now, return placeholder results - in production, this would call web_search
    console.log(`   Would search web for: ${searchQuery}`);
    
    return {
      query,
      resultsCount: 0,
      message: 'Web search integration pending - use seed list for now'
    };
  } catch (error) {
    console.error('Search error:', error.message);
    return { query, resultsCount: 0, error: error.message };
  }
}

/**
 * Research a single VC firm
 */
async function researchVC(vcName, website = null) {
  console.log(`📚 Researching: ${vcName}...`);
  
  // In production, this would:
  // 1. Scrape VC website for investment thesis
  // 2. Search for recent investments
  // 3. Extract partner names from LinkedIn
  // 4. Analyze portfolio for AI safety companies
  // 5. Extract pain points from blog posts/interviews
  
  return {
    name: vcName,
    website,
    researchStatus: 'manual_research_needed',
    note: 'Automated research pending - manual curation required'
  };
}

/**
 * Score VC relevance (1-10)
 */
function scoreRelevance(vcData) {
  let score = 0;
  
  // Keyword matching in focus areas
  const focusText = (vcData.focus || []).join(' ').toLowerCase();
  
  if (RELEVANCE_CRITERIA.keywords.high.some(kw => focusText.includes(kw.toLowerCase()))) {
    score += 4;
  } else if (RELEVANCE_CRITERIA.keywords.medium.some(kw => focusText.includes(kw.toLowerCase()))) {
    score += 3;
  } else if (RELEVANCE_CRITERIA.keywords.low.some(kw => focusText.includes(kw.toLowerCase()))) {
    score += 2;
  }
  
  // Stage fit
  const stageText = (vcData.stage || []).join(' ').toLowerCase();
  if (RELEVANCE_CRITERIA.stage.preferred.some(s => stageText.includes(s))) {
    score += 3;
  } else if (RELEVANCE_CRITERIA.stage.acceptable.some(s => stageText.includes(s))) {
    score += 2;
  }
  
  // Geography bonus
  if (RELEVANCE_CRITERIA.geography.some(geo => vcData.geography?.includes(geo))) {
    score += 1;
  }
  
  // Portfolio AI safety companies bonus (manual check)
  if (vcData.portfolioSafetyFocus) {
    score += 2;
  }
  
  return Math.min(score, 10);
}

/**
 * Extract pain points from VC research
 */
function extractPainPoints(vcData) {
  // In production, this would use Grok/Claude to analyze:
  // - Blog posts
  // - Portfolio company patterns
  // - Partner interview quotes
  // - Recent investment themes
  
  const defaultPainPoints = [
    'AI governance coordination',
    'Safety-first deployment models',
    'Regulatory uncertainty'
  ];
  
  return vcData.painPoints || defaultPainPoints;
}

/**
 * Load seed list
 */
function loadSeedList() {
  try {
    if (fs.existsSync(CONFIG.seedListPath)) {
      const data = fs.readFileSync(CONFIG.seedListPath, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Failed to load seed list:', error.message);
  }
  return null;
}

/**
 * Save updated VC list
 */
function saveVCList(vcList) {
  const outputPath = path.join(CONFIG.outputDir, `vc-list-${Date.now()}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(vcList, null, 2));
  console.log(`\n✅ Saved VC list to: ${outputPath}`);
  return outputPath;
}

/**
 * Add VCs to Notion database (placeholder)
 */
async function addToNotion(vcs) {
  console.log(`\n📝 Adding ${vcs.length} VCs to Notion...`);
  
  // In production, this would use Notion API to:
  // 1. Create/update pages in VC Outreach Tracker database
  // 2. Set properties: Name, Email, Status, Relevance Score, Pain Points
  // 3. Return Notion page IDs
  
  console.log('   Notion integration pending - manual import required');
  
  return {
    added: 0,
    message: 'Notion API integration pending'
  };
}

/**
 * Main curation workflow
 */
async function main() {
  const query = process.argv[2] || 'AI safety governance seed investors';
  const limit = parseInt(process.argv[3]) || CONFIG.defaultLimit;
  
  console.log('🚀 ALYGN VC Discovery & Curation\n');
  console.log(`Query: "${query}"`);
  console.log(`Limit: ${limit}`);
  console.log(`Min relevance score: ${CONFIG.minRelevanceScore}\n`);
  
  // Load seed list
  const seedList = loadSeedList();
  if (seedList) {
    console.log(`✅ Loaded seed list: ${seedList.vcs.length} VCs\n`);
  }
  
  // Search for new VCs (placeholder)
  const searchResults = await searchVCs(query, limit);
  console.log(`   Search results: ${searchResults.resultsCount} found`);
  console.log(`   Note: ${searchResults.message}\n`);
  
  // For now, work with seed list
  if (seedList) {
    console.log('📊 Seed list analysis:\n');
    
    const highRelevance = seedList.vcs.filter(vc => vc.relevanceScore >= 9);
    const mediumRelevance = seedList.vcs.filter(vc => vc.relevanceScore >= 7 && vc.relevanceScore < 9);
    
    console.log(`   High relevance (9-10): ${highRelevance.length} VCs`);
    console.log(`   Medium relevance (7-8): ${mediumRelevance.length} VCs`);
    console.log(`   Total: ${seedList.vcs.length} VCs\n`);
    
    // Show top 5 by relevance
    const top5 = seedList.vcs
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 5);
    
    console.log('🏆 Top 5 VCs by relevance:\n');
    top5.forEach((vc, i) => {
      console.log(`   ${i + 1}. ${vc.name} (Score: ${vc.relevanceScore})`);
      console.log(`      Focus: ${vc.focus.join(', ')}`);
      console.log(`      Pain points: ${vc.painPoints.join(', ')}\n`);
    });
  }
  
  console.log('\n📋 Next steps:');
  console.log('   1. Expand seed list to 100 VCs (manual curation)');
  console.log('   2. Implement web search integration');
  console.log('   3. Implement Notion API integration');
  console.log('   4. Add Grok-based pain point extraction');
  console.log('   5. Set up automated personalization workflow\n');
  
  console.log('💡 To add new VCs manually:');
  console.log(`   - Edit: ${CONFIG.seedListPath}`);
  console.log('   - Follow existing VC entry format');
  console.log('   - Run this script again to validate\n');
}

// Run
main().catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});
