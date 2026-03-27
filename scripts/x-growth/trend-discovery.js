/**
 * Trend Discovery - Discovers trending topics and accounts on X/Twitter
 * 
 * Usage:
 *   # Trend discovery for a project
 *   node trend-discovery.js --project=myproject --mock
 *   node trend-discovery.js --project=myproject --output=trends.json
 * 
 *   # Municipal discovery (for x-warmup integration)
 *   node trend-discovery.js --action=discover --target=municipalities --filter="Costa Rica"
 *   node trend-discovery.js --action=discover --target=municipalities --output=municipalities.json
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';

import { loadProject } from "./load-project.js";

// Rate limiting configuration for discovery
const DISCOVERY_LIMITS = {
  queries_per_minute: 10,
  queries_per_hour: 100,
  cooldown_ms: 6000,      // 6s between queries
  max_results_per_query: 50
};

// Track rate limit state
let lastQueryTime = 0;
let queriesThisHour = 0;
let queriesThisMinute = 0;
let minuteResetTime = Date.now() + 60000;
let hourResetTime = Date.now() + 3600000;

/**
 * Enforce rate limits
 */
async function enforceRateLimit() {
  const now = Date.now();
  
  // Reset counters if time elapsed
  if (now > minuteResetTime) {
    queriesThisMinute = 0;
    minuteResetTime = now + 60000;
  }
  if (now > hourResetTime) {
    queriesThisHour = 0;
    hourResetTime = now + 3600000;
  }
  
  // Check limits
  if (queriesThisMinute >= DISCOVERY_LIMITS.queries_per_minute) {
    const waitMs = minuteResetTime - now;
    console.log(`⏱️  Rate limit: waiting ${Math.ceil(waitMs/1000)}s (per-minute limit)`);
    await new Promise(resolve => setTimeout(resolve, waitMs));
    return enforceRateLimit();
  }
  
  if (queriesThisHour >= DISCOVERY_LIMITS.queries_per_hour) {
    const waitMs = hourResetTime - now;
    console.log(`⏱️  Rate limit: waiting ${Math.ceil(waitMs/1000)}s (per-hour limit)`);
    await new Promise(resolve => setTimeout(resolve, waitMs));
    return enforceRateLimit();
  }
  
  // Enforce cooldown between queries
  const timeSinceLast = now - lastQueryTime;
  if (timeSinceLast < DISCOVERY_LIMITS.cooldown_ms) {
    const waitMs = DISCOVERY_LIMITS.cooldown_ms - timeSinceLast;
    await new Promise(resolve => setTimeout(resolve, waitMs));
  }
  
  lastQueryTime = Date.now();
  queriesThisMinute++;
  queriesThisHour++;
}

/**
 * Discovers trends for a project
 * @param {Object} config - Project configuration
 * @param {boolean} mock - Use mock data
 * @returns {Promise<Array>} Array of trend objects
 */
async function discoverTrends(config, mock = false) {
  console.log(`🔍 Discovering trends for ${config.name}...`);
  
  if (mock) {
    console.log('⚠️  Mock mode enabled - returning sample data');
    return generateMockTrends(config);
  }
  
  // In production, would use:
  // 1. Browser automation to explore X.com
  // 2. X API trends endpoint
  // 3. Third-party trend APIs
  
  console.log('⚠️  Real trend discovery not implemented yet - using mock data');
  return generateMockTrends(config);
}

/**
 * Discovers municipality accounts
 * @param {Object} options - Discovery options
 * @param {string} options.filter - Geographic filter (e.g., "Costa Rica")
 * @param {boolean} options.mock - Use mock data
 * @returns {Promise<Object>} Discovery results with accounts array
 */
async function discoverMunicipalities(options = {}) {
  const { filter = "Costa Rica", mock = false } = options;
  
  console.log(`🏛️  Discovering municipalities: ${filter}...`);
  await enforceRateLimit();
  
  if (mock) {
    console.log('⚠️  Mock mode enabled - returning sample data');
    return generateMockMunicipalities(filter);
  }
  
  // In production, would use:
  // 1. X API search for accounts matching "municipalidad [filter]"
  // 2. Browser automation to explore official accounts
  // 3. Cross-reference with government directories
  
  console.log('⚠️  Real municipal discovery not implemented yet - using mock data');
  return generateMockMunicipalities(filter);
}

/**
 * Generates mock municipality data for Costa Rica
 */
function generateMockMunicipalities(filter) {
  const isCostaRica = filter.toLowerCase().includes('costa rica');
  
  if (!isCostaRica) {
    return {
      discovered_at: new Date().toISOString(),
      target: "municipalities",
      filter: filter,
      accounts: [],
      metadata: {
        total_found: 0,
        verified_count: 0,
        passed_safety: 0,
        rate_limit_hits: 0,
        note: "Only Costa Rica filter implemented in mock mode"
      }
    };
  }
  
  // Costa Rican municipalities (sample data)
  const municipalities = [
    {
      x_handle: "@MuniSanJoseCR",
      official_status: "verified",
      relevance_score: 9.2,
      topics: ["governance", "municipal-services", "urban-planning", "costa-rica"],
      keywords: ["gobierno local", "servicios municipales", "San José", "capital"],
      follower_count: 45000,
      recent_activity: new Date(Date.now() - 86400000).toISOString().split('T')[0], // yesterday
      safety_flag: null
    },
    {
      x_handle: "@MuniAlajuelaCR",
      official_status: "verified",
      relevance_score: 8.5,
      topics: ["governance", "municipal-services", "costa-rica"],
      keywords: ["municipalidad", "Alajuela", "servicios"],
      follower_count: 28000,
      recent_activity: new Date(Date.now() - 172800000).toISOString().split('T')[0], // 2 days ago
      safety_flag: null
    },
    {
      x_handle: "@MuniCartagoCR",
      official_status: "verified",
      relevance_score: 8.0,
      topics: ["governance", "municipal-services", "costa-rica"],
      keywords: ["municipalidad", "Cartago", "antigua metrópoli"],
      follower_count: 22000,
      recent_activity: new Date(Date.now() - 259200000).toISOString().split('T')[0], // 3 days ago
      safety_flag: null
    },
    {
      x_handle: "@MuniHerediaCR",
      official_status: "verified",
      relevance_score: 7.8,
      topics: ["governance", "municipal-services", "costa-rica"],
      keywords: ["municipalidad", "Heredia", "ciudad de las flores"],
      follower_count: 19000,
      recent_activity: new Date(Date.now() - 432000000).toISOString().split('T')[0], // 5 days ago
      safety_flag: null
    },
    {
      x_handle: "@MuniPuntarenasCR",
      official_status: "unverified",
      relevance_score: 6.5,
      topics: ["governance", "costa-rica", "coastal"],
      keywords: ["municipalidad", "Puntarenas", "puerto"],
      follower_count: 8500,
      recent_activity: new Date(Date.now() - 604800000).toISOString().split('T')[0], // 7 days ago
      safety_flag: "REVIEW - unverified, low engagement"
    },
    {
      x_handle: "@MuniLimonCR",
      official_status: "unverified",
      relevance_score: 6.0,
      topics: ["governance", "costa-rica", "caribbean"],
      keywords: ["municipalidad", "Limón", "Caribe"],
      follower_count: 7200,
      recent_activity: new Date(Date.now() - 1209600000).toISOString().split('T')[0], // 14 days ago
      safety_flag: "REVIEW - inactive, unverified"
    },
    {
      x_handle: "@MuniGuanacasteCR",
      official_status: "verified",
      relevance_score: 7.2,
      topics: ["governance", "tourism", "costa-rica"],
      keywords: ["municipalidad", "Guanacaste", "provincia"],
      follower_count: 15000,
      recent_activity: new Date(Date.now() - 345600000).toISOString().split('T')[0], // 4 days ago
      safety_flag: null
    },
    {
      x_handle: "@MuniCR_Parody",
      official_status: "unverified",
      relevance_score: 2.0,
      topics: ["parody", "satire"],
      keywords: ["parody account", "not official", "satire"],
      follower_count: 1200,
      recent_activity: new Date(Date.now() - 86400000).toISOString().split('T')[0],
      safety_flag: "SKIP - parody/satire account"
    },
    {
      x_handle: "@FakeMuniCR",
      official_status: "unverified",
      relevance_score: 1.0,
      topics: ["suspicious"],
      keywords: ["unofficial", "fan account"],
      follower_count: 45,
      recent_activity: new Date(Date.now() - 2592000000).toISOString().split('T')[0], // 30 days ago
      safety_flag: "SKIP - suspicious, likely impersonation"
    }
  ];
  
  // Apply safety filtering
  const safeAccounts = municipalities.filter(m => {
    // Skip parody accounts
    if (m.safety_flag?.includes("SKIP")) return false;
    
    // Skip inactive accounts (30+ days)
    const lastActive = new Date(m.recent_activity);
    const daysInactive = (Date.now() - lastActive.getTime()) / 86400000;
    if (daysInactive > 30) {
      m.safety_flag = "SKIP - inactive >30 days";
      return false;
    }
    
    // Skip very low follower counts (likely fake)
    if (m.follower_count < 500 && m.official_status !== "verified") {
      m.safety_flag = "SKIP - low followers, unverified";
      return false;
    }
    
    return true;
  });
  
  const verifiedCount = safeAccounts.filter(m => m.official_status === "verified").length;
  
  const result = {
    discovered_at: new Date().toISOString(),
    target: "municipalities",
    filter: filter,
    accounts: safeAccounts.sort((a, b) => b.relevance_score - a.relevance_score),
    metadata: {
      total_found: municipalities.length,
      verified_count: verifiedCount,
      passed_safety: safeAccounts.length,
      rate_limit_hits: 0
    }
  };
  
  console.log(`✅ Discovered ${result.accounts.length} municipalities (${verifiedCount} verified)`);
  
  return result;
}

/**
 * Generates mock trends based on project topics
 */
function generateMockTrends(config) {
  const topics = config.twitter?.topics || ['Technology', 'AI', 'Innovation'];
  
  const mockTrends = [
    {
      topic: 'AI Governance Summit 2026',
      tweet_count: 45000,
      category: 'Technology',
      trend_score: 8.5,
      relevance_to_project: 9,
      sample_tweets: [
        'World leaders gather for AI Governance Summit in Geneva',
        'New framework for international AI coordination announced',
        'Experts debate: can governance scale with AI capabilities?'
      ],
      url: 'https://x.com/explore',
      related_accounts: ['@AIGovSummit', '@TechPolicy', '@FutureOfAI']
    },
    {
      topic: 'Machine Learning Safety Research',
      tweet_count: 28000,
      category: 'Research',
      trend_score: 7.2,
      relevance_to_project: 8,
      sample_tweets: [
        'New paper on reward hacking in large language models',
        'Researchers propose new alignment technique',
        'Safety considerations for AGI development'
      ],
      url: 'https://x.com/explore',
      related_accounts: ['@AlignmentNews', '@AISafety', '@MLResearch']
    },
    {
      topic: 'Tech Regulation Debate',
      tweet_count: 67000,
      category: 'Policy',
      trend_score: 9.1,
      relevance_to_project: 7,
      sample_tweets: [
        'Senate hearing on AI regulation scheduled',
        'Industry leaders call for balanced approach',
        'Consumer advocacy groups demand stricter oversight'
      ],
      url: 'https://x.com/explore',
      related_accounts: ['@TechPolicy', '@RegulationWatch', '@ConsumerRights']
    },
    {
      topic: 'Autonomous Systems Deployment',
      tweet_count: 34000,
      category: 'Technology',
      trend_score: 7.8,
      relevance_to_project: 8,
      sample_tweets: [
        'Self-driving cars approved for highway use in 3 states',
        'Autonomous delivery robots expand to 50 cities',
        'Debate: who is liable when AI makes mistakes?'
      ],
      url: 'https://x.com/explore',
      related_accounts: ['@AutonomousVeh', '@RoboticsNews', '@AIEthics']
    },
    {
      topic: 'Digital Privacy Rights',
      tweet_count: 52000,
      category: 'Policy',
      trend_score: 8.3,
      relevance_to_project: 6,
      sample_tweets: [
        'New privacy law proposed in EU',
        'Tech companies face scrutiny over data practices',
        'Privacy advocates celebrate landmark ruling'
      ],
      url: 'https://x.com/explore',
      related_accounts: ['@PrivacyMatters', '@DigitalRights', '@EUPolicy']
    }
  ];
  
  // Filter and rank by relevance to project topics
  const ranked = mockTrends
    .map(trend => ({
      ...trend,
      relevance_to_project: calculateRelevance(trend, topics)
    }))
    .sort((a, b) => b.relevance_to_project - a.relevance_to_project);
  
  console.log(`✅ Discovered ${ranked.length} trends`);
  console.log(`   Top trend: ${ranked[0].topic} (relevance: ${ranked[0].relevance_to_project}/10)`);
  
  return ranked;
}

/**
 * Calculates relevance of trend to project topics
 */
function calculateRelevance(trend, topics) {
  const trendText = `${trend.topic} ${trend.sample_tweets.join(' ')}`.toLowerCase();
  const topicKeywords = topics.map(t => t.toLowerCase());
  
  let score = 5; // Base score
  
  // Boost for keyword matches
  topicKeywords.forEach(keyword => {
    if (trendText.includes(keyword)) {
      score += 2;
    }
  });
  
  // Boost for category matches
  if (trend.category === 'Technology' || trend.category === 'Policy') {
    score += 1;
  }
  
  // Cap at 10
  return Math.min(10, score);
}

/**
 * Saves trends to file
 */
function saveResults(trends, outputFile, config) {
  const output = {
    discovered_at: new Date().toISOString(),
    project: config?.name || "general",
    count: trends.length,
    trends
  };
  
  fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));
  console.log(`💾 Saved to ${outputFile}`);
  
  return output;
}

/**
 * Saves discovery results to file
 */
function saveDiscoveryResults(result, outputFile) {
  fs.writeFileSync(outputFile, JSON.stringify(result, null, 2));
  console.log(`💾 Discovery results saved to ${outputFile}`);
  return result;
}

// CLI usage
const isMainModule = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;

if (isMainModule) {
  const args = process.argv.slice(2);
  
  // Parse arguments
  const projectArg = args.find(a => a.startsWith('--project='));
  const actionArg = args.find(a => a.startsWith('--action='));
  const targetArg = args.find(a => a.startsWith('--target='));
  const filterArg = args.find(a => a.startsWith('--filter='));
  const outputArg = args.find(a => a.startsWith('--output='));
  const mockArg = args.includes('--mock');
  
  const action = actionArg ? actionArg.split('=')[1] : null;
  const target = targetArg ? targetArg.split('=')[1] : null;
  const filter = filterArg ? filterArg.split('=')[1] : 'Costa Rica';
  
  // Discovery action (for x-warmup integration)
  if (action === 'discover' && target === 'municipalities') {
    const outputFile = outputArg ? outputArg.split('=')[1] : `/tmp/x-growth-municipalities.json`;
    
    discoverMunicipalities({ filter, mock: mockArg })
      .then(result => {
        saveDiscoveryResults(result, outputFile);
        
        console.log('\n📊 Top Municipalities:');
        result.accounts.slice(0, 5).forEach((account, i) => {
          console.log(`   ${i + 1}. ${account.x_handle}`);
          console.log(`      Status: ${account.official_status} | Relevance: ${account.relevance_score}/10`);
          console.log(`      Followers: ${account.follower_count.toLocaleString()}`);
        });
        
        console.log('\n✅ Discovery complete');
        process.exit(0);
      })
      .catch(error => {
        console.error('❌ Error:', error.message);
        process.exit(1);
      });
  }
  // Standard trend discovery
  else if (projectArg) {
    const projectName = projectArg.split('=')[1];
    const outputFile = outputArg ? outputArg.split('=')[1] : `/tmp/x-growth-${projectName}-trends.json`;
    
    try {
      const config = loadProject(projectName);
      
      discoverTrends(config, mockArg)
        .then(trends => {
          const output = saveResults(trends, outputFile, config);
          
          console.log('\n📊 Top 5 Trends:');
          trends.slice(0, 5).forEach((trend, i) => {
            console.log(`   ${i + 1}. ${trend.topic}`);
            console.log(`      Tweets: ${trend.tweet_count.toLocaleString()} | Relevance: ${trend.relevance_to_project}/10`);
          });
        })
        .catch(error => {
          console.error('❌ Error:', error.message);
          process.exit(1);
        });
    } catch (error) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  }
  // No valid arguments
  else {
    console.error(`
❌ No valid arguments provided.

Usage:
  # Trend discovery for project
  node trend-discovery.js --project=name [--output=file.json] [--mock]

  # Municipal discovery (for x-warmup integration)
  node trend-discovery.js --action=discover --target=municipalities [--filter="Costa Rica"] [--output=file.json] [--mock]
`);
    process.exit(1);
  }
}

export {
  discoverTrends,
  discoverMunicipalities,
  generateMockTrends,
  generateMockMunicipalities,
  calculateRelevance,
  enforceRateLimit
};
