/**
 * X Warmup Engagement - Unified Phase 1 + Phase 2
 * 
 * Automated X/Twitter engagement to build familiarity before email outreach.
 * Consolidates x-warmup-phase1.js and x-warmup-phase2.js into single script.
 * 
 * Usage:
 *   # Phase 1: Follow + Like
 *   node x-warmup-engage.js --wave=1 --phase=1 --batch-size=10
 *   
 *   # Phase 2: Quote + Reply
 *   node x-warmup-engage.js --wave=1 --phase=2 --batch-size=10
 *   
 *   # Dry run (no API calls)
 *   node x-warmup-engage.js --wave=1 --phase=1 --dry-run
 */

const fs = require('fs');
const path = require('path');

// Load utilities
const loadCredentials = require('../../../../shared/load-credentials');
const supabase = require('../../../../utils/supabase-client').supabase;
const rateLimiter = require('../../../../utils/rate-limiter');

// Rate limits (conservative - from spec)
const RATE_LIMITS = {
  phase1: {
    follows: 15,    // max per day
    likes: 20,      // max per day
    delay: [30000, 120000]  // 30-120s random
  },
  phase2: {
    quotes: 5,      // max per day
    replies: 10,    // max per day
    delay: [60000, 180000]  // 60-180s random
  }
};

/**
 * Main engagement executor
 */
async function executeEngagement(options) {
  const {
    wave,
    phase,
    batchSize = 10,
    dryRun = false
  } = options;
  
  console.log(`🔥 X Warmup Phase ${phase} - Wave ${wave}`);
  console.log(`   Batch size: ${batchSize}`);
  console.log(`   Dry run: ${dryRun ? 'YES' : 'NO'}`);
  
  // Load municipalities from Supabase
  let query = supabase
    .from('municipalities')
    .select('*')
    .eq('wave_number', wave)
    .not('x_handle', 'is', null)
    .order('priority_score', { ascending: false })
    .limit(batchSize);
  
  // Filter by phase
  if (phase === 1) {
    query = query.is('x_warmup_phase1_at', null);
  } else {
    query = query
      .not('x_warmup_phase1_at', 'is', null)
      .is('x_warmup_phase2_at', null);
  }
  
  const { data: municipalities, error } = await query;
  
  if (error) {
    console.error('❌ Failed to load municipalities:', error.message);
    return { executed: 0, results: [] };
  }
  
  console.log(`   Eligible municipalities: ${municipalities.length}`);
  
  if (municipalities.length === 0) {
    console.log('⚠️  No municipalities eligible for Phase ' + phase);
    return { executed: 0, results: [] };
  }
  
  // Execute phase
  if (phase === 1) {
    return executePhase1(municipalities, dryRun);
  } else {
    return executePhase2(municipalities, dryRun);
  }
}

/**
 * Phase 1: Follow + Like
 */
async function executePhase1(municipalities, dryRun) {
  console.log('\n📍 Phase 1: Follow + Like');
  
  const results = {
    executed_at: new Date().toISOString(),
    phase: 1,
    total: municipalities.length,
    followed: 0,
    liked: 0,
    errors: 0,
    engagements: []
  };
  
  for (const muni of municipalities) {
    try {
      // Check rate limits
      await rateLimiter.waitForCapacity('follow');
      
      if (dryRun) {
        console.log(`   [DRY RUN] Would follow @${muni.x_handle}`);
      } else {
        console.log(`   ✅ Following @${muni.x_handle}`);
        // TODO: Call X API to follow
        // await xApi.follow(muni.x_user_id);
      }
      
      results.followed++;
      results.engagements.push({
        municipality_id: muni.id,
        municipality: muni.name,
        x_handle: muni.x_handle,
        action: 'follow',
        completed_at: new Date().toISOString()
      });
      
      // Record action for rate limiting
      if (!dryRun) {
        await rateLimiter.recordAction('follow');
      }
      
      // Like 2-3 recent tweets
      const likeCount = Math.floor(Math.random() * 2) + 2; // 2-3 likes
      for (let i = 0; i < likeCount; i++) {
        await rateLimiter.waitForCapacity('like');
        
        if (dryRun) {
          console.log(`   [DRY RUN] Would like tweet ${i+1} from @${muni.x_handle}`);
        } else {
          console.log(`   ❤️  Liking tweet ${i+1} from @${muni.x_handle}`);
          // TODO: Call X API to like
          // await xApi.like(tweetId);
        }
        
        results.liked++;
        results.engagements.push({
          municipality_id: muni.id,
          municipality: muni.name,
          x_handle: muni.x_handle,
          action: 'like',
          tweet_id: `tweet-${i}`, // TODO: Get real tweet ID
          completed_at: new Date().toISOString()
        });
        
        if (!dryRun) {
          await rateLimiter.recordAction('like');
        }
      }
      
      // Update Supabase
      if (!dryRun) {
        await supabase
          .from('municipalities')
          .update({
            x_warmup_phase1_at: new Date().toISOString(),
            x_engagement_count: (muni.x_engagement_count || 0) + 1 + likeCount,
            x_last_engagement_at: new Date().toISOString()
          })
          .eq('id', muni.id);
        
        // Log to x_engagements table
        for (const engagement of results.engagements.filter(e => e.municipality_id === muni.id)) {
          await supabase.from('x_engagements').insert({
            municipality_id: muni.id,
            engagement_type: engagement.action,
            x_handle: muni.x_handle,
            phase: 1,
            engaged_at: engagement.completed_at
          });
        }
      }
      
    } catch (error) {
      console.error(`   ❌ Error with ${muni.name}:`, error.message);
      results.errors++;
      
      if (error.message.includes('Rate limit')) {
        console.log('   ⏸️  Rate limit reached, stopping Phase 1');
        break;
      }
    }
  }
  
  console.log(`\n✅ Phase 1 complete: ${results.followed} followed, ${results.liked} liked`);
  return results;
}

/**
 * Phase 2: Quote + Reply
 */
async function executePhase2(municipalities, dryRun) {
  console.log('\n📍 Phase 2: Quote + Reply');
  
  const results = {
    executed_at: new Date().toISOString(),
    phase: 2,
    total: municipalities.length,
    quoted: 0,
    replied: 0,
    errors: 0,
    engagements: []
  };
  
  for (const muni of municipalities) {
    try {
      // Check rate limits
      await rateLimiter.waitForCapacity('quote');
      
      // Build quote tweet content
      const quoteContent = buildQuoteText(muni.name, muni.pain_points);
      
      if (dryRun) {
        console.log(`   [DRY RUN] Would quote tweet @${muni.x_handle}`);
        console.log(`   Content: "${quoteContent.substring(0, 80)}..."`);
      } else {
        console.log(`   📝 Quote tweeting @${muni.x_handle}`);
        // TODO: Call X API to quote tweet
        // await xApi.quoteTweet(tweetId, quoteContent);
      }
      
      results.quoted++;
      results.engagements.push({
        municipality_id: muni.id,
        municipality: muni.name,
        x_handle: muni.x_handle,
        action: 'quote',
        content: quoteContent,
        completed_at: new Date().toISOString()
      });
      
      // Record action
      if (!dryRun) {
        await rateLimiter.recordAction('quote');
      }
      
      // Reply to a conversation
      await rateLimiter.waitForCapacity('reply');
      
      const replyContent = buildReplyText(muni.name);
      
      if (dryRun) {
        console.log(`   [DRY RUN] Would reply to @${muni.x_handle}`);
        console.log(`   Content: "${replyContent.substring(0, 80)}..."`);
      } else {
        console.log(`   💬 Replying to @${muni.x_handle}`);
        // TODO: Call X API to reply
        // await xApi.reply(tweetId, replyContent);
      }
      
      results.replied++;
      results.engagements.push({
        municipality_id: muni.id,
        municipality: muni.name,
        x_handle: muni.x_handle,
        action: 'reply',
        content: replyContent,
        completed_at: new Date().toISOString()
      });
      
      // Record action
      if (!dryRun) {
        await rateLimiter.recordAction('reply');
      }
      
      // Update Supabase
      if (!dryRun) {
        await supabase
          .from('municipalities')
          .update({
            x_warmup_phase2_at: new Date().toISOString(),
            x_engagement_count: (muni.x_engagement_count || 0) + 2,
            x_last_engagement_at: new Date().toISOString()
          })
          .eq('id', muni.id);
        
        // Log to x_engagements table
        for (const engagement of results.engagements.filter(e => e.municipality_id === muni.id)) {
          await supabase.from('x_engagements').insert({
            municipality_id: muni.id,
            engagement_type: engagement.action,
            x_handle: muni.x_handle,
            content: engagement.content,
            phase: 2,
            engaged_at: engagement.completed_at
          });
        }
      }
      
    } catch (error) {
      console.error(`   ❌ Error with ${muni.name}:`, error.message);
      results.errors++;
      
      if (error.message.includes('Rate limit')) {
        console.log('   ⏸️  Rate limit reached, stopping Phase 2');
        break;
      }
    }
  }
  
  console.log(`\n✅ Phase 2 complete: ${results.quoted} quoted, ${results.replied} replied`);
  return results;
}

/**
 * Build quote tweet text with Alygn perspective
 */
function buildQuoteText(municipalityName, painPoints) {
  const perspectives = [
    `Important perspective from ${municipalityName}. Governance legitimacy is the infrastructure that enables coordination without centralization. #AIGovernance`,
    `This highlights why municipal leadership matters in AI governance. Coordination must exist before crisis, not improvised during one. #AIPolicy`,
    `${municipalityName} understands that the hardest AI risks are institutional, not technical. Neutral infrastructure enables accountability.`,
    `Municipalities like ${municipalityName} are building AI governance preparedness from the ground up. Coordination before crisis. #AI Governance`
  ];
  
  let text = perspectives[Math.floor(Math.random() * perspectives.length)];
  text += '\n\nmore at @aialygn';
  
  return text;
}

/**
 * Build reply text
 */
function buildReplyText(municipalityName) {
  const replies = [
    `Great discussion from ${municipalityName}! This is exactly why neutral coordination infrastructure matters for AI governance.`,
    `Valuable perspective. Municipalities like ${municipalityName} are key to building AI governance preparedness from the ground up.`,
    `Important point. Local leadership combined with neutral governance frameworks creates resilient coordination.`,
    `This is why Alygn exists - to support municipal coordination on AI governance without centralizing control.`
  ];
  
  return replies[Math.floor(Math.random() * replies.length)];
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  
  const parseArg = (name) => {
    const arg = args.find(a => a.startsWith(`--${name}=`));
    return arg ? arg.split('=')[1] : null;
  };
  
  const wave = parseInt(parseArg('wave') || '1');
  const phase = parseInt(parseArg('phase') || '1');
  const batchSize = parseInt(parseArg('batch-size') || '10');
  const dryRun = args.includes('--dry-run');
  
  if (!phase || (phase !== 1 && phase !== 2)) {
    console.error('Error: --phase must be 1 or 2');
    process.exit(1);
  }
  
  executeEngagement({ wave, phase, batchSize, dryRun })
    .then(results => {
      console.log('\n📊 Results:', JSON.stringify(results, null, 2));
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Fatal error:', error.message);
      process.exit(1);
    });
}

module.exports = { executeEngagement, executePhase1, executePhase2 };
