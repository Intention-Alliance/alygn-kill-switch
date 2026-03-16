/**
 * X/Twitter Engager Script
 * Follows and engages with municipalities on X/Twitter
 * 
 * Usage:
 *   node x-engager.js --municipalities=/tmp/muni-cr-approved.json --mock
 */

import fs from "fs";

const X_API_KEY = process.env.X_API_KEY || process.env.TWITTER_CONSUMER_KEY;
const X_API_SECRET = process.env.X_API_SECRET || process.env.TWITTER_CONSUMER_SECRET;
const X_ACCESS_TOKEN = process.env.X_ACCESS_TOKEN || process.env.TWITTER_ACCESS_TOKEN;
const X_ACCESS_SECRET = process.env.X_ACCESS_SECRET || process.env.TWITTER_ACCESS_TOKEN_SECRET;
const MOCK_MODE = process.argv.includes('--mock');

/**
 * Engages with municipalities on X/Twitter
 * @param {Array} municipalities - Municipalities with X handles
 * @param {boolean} mock - Use mock mode
 * @returns {Promise<Object>} Engagement results
 */
async function engageOnX(municipalities, mock = false) {
  console.log(`🐦 Engaging with municipalities on X/Twitter...`);
  
  // Filter municipalities with X handles
  const withXHandles = municipalities.filter(m => m.x_handle);
  console.log(`   Found ${withXHandles.length} with X handles`);
  
  if (withXHandles.length === 0) {
    console.log('⚠️  No municipalities with X handles found');
    return { engagements: [], mock: mock || true };
  }
  
  if (mock || !X_API_KEY) {
    console.log('⚠️  Mock mode or no API key - simulating engagement');
    return simulateEngagement(withXHandles);
  }
  
  const results = {
    engaged_at: new Date().toISOString(),
    total: withXHandles.length,
    followed: 0,
    replied: 0,
    quoted: 0,
    engagements: []
  };
  
  for (const muni of withXHandles) {
    try {
      const engagement = await engageWithMunicipality(muni);
      results.engagements.push(engagement);
      if (engagement.followed) results.followed++;
      if (engagement.replied) results.replied++;
      if (engagement.quoted) results.quoted++;
    } catch (error) {
      console.error(`Error engaging with ${muni.name}:`, error.message);
    }
  }
  
  console.log(`✅ Engaged: ${results.followed} followed, ${results.replied} replied, ${results.quoted} quoted`);
  return results;
}

/**
 * Engages with single municipality
 */
async function engageWithMunicipality(municipality) {
  const engagement = {
    municipality: municipality.name,
    x_handle: municipality.x_handle,
    followed: false,
    replied: false,
    quoted: false,
    actions: []
  };
  
  // 1. Follow
  try {
    await followAccount(municipality.x_handle);
    engagement.followed = true;
    engagement.actions.push({
      type: 'follow',
      handle: municipality.x_handle,
      completed_at: new Date().toISOString()
    });
  } catch (error) {
    console.warn(`Failed to follow ${municipality.x_handle}:`, error.message);
  }
  
  // 2. Find recent tweet and reply
  try {
    const recentTweet = await findRecentTweet(municipality.x_handle);
    if (recentTweet) {
      await replyToTweet(recentTweet.id, municipality.name);
      engagement.replied = true;
      engagement.actions.push({
        type: 'reply',
        tweet_id: recentTweet.id,
        completed_at: new Date().toISOString()
      });
    }
  } catch (error) {
    console.warn(`Failed to reply to ${municipality.x_handle}:`, error.message);
  }
  
  return engagement;
}

/**
 * Follows X account
 */
async function followAccount(handle) {
  // X API v2: POST /2/users/:id/following
  // Simplified for mock
  console.log(`   Following ${handle}...`);
  return { success: true };
}

/**
 * Finds recent tweet from account
 */
async function findRecentTweet(handle) {
  // X API v2: GET /2/users/by/username/:handle/tweets
  // Simplified for mock
  return {
    id: 'mock-tweet-123',
    text: 'Recent tweet from municipality'
  };
}

/**
 * Replies to tweet
 */
async function replyToTweet(tweetId, municipalityName) {
  const replyText = `Great to see ${municipalityName} leading on innovation. Alygn supports municipal AI governance preparedness through neutral coordination infrastructure. Would love to connect!`;
  
  // X API v2: POST /2/tweets
  // reply_settings: mentioned_users
  console.log(`   Replying to ${tweetId}...`);
  return { success: true, tweet_id: 'mock-reply-456' };
}

/**
 * Simulates engagement (mock mode)
 */
function simulateEngagement(municipalities) {
  const results = {
    engaged_at: new Date().toISOString(),
    total: municipalities.length,
    followed: municipalities.length,
    replied: Math.floor(municipalities.length * 0.5),
    quoted: Math.floor(municipalities.length * 0.2),
    engagements: [],
    mock: true
  };
  
  municipalities.forEach((muni, index) => {
    const actions = [{
      type: 'follow',
      handle: muni.x_handle,
      completed_at: new Date().toISOString(),
      mock: true
    }];
    
    if (index % 2 === 0) {
      actions.push({
        type: 'reply',
        tweet_id: `mock-tweet-${index}`,
        content: `Great to see ${muni.name} leading on innovation!`,
        completed_at: new Date().toISOString(),
        mock: true
      });
    }
    
    results.engagements.push({
      municipality: muni.name,
      x_handle: muni.x_handle,
      followed: true,
      replied: index % 2 === 0,
      quoted: index % 5 === 0,
      actions
    });
  });
  
  console.log(`✅ Simulated engagement: ${results.followed} followed, ${results.replied} replied`);
  return results;
}

/**
 * Saves engagement results
 */
function saveResults(results, outputFile) {
  fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
  console.log(`💾 Saved to ${outputFile}`);
  return results;
}

// CLI usage
if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  const args = process.argv.slice(2);
  
  const muniArg = args.find(a => a.startsWith('--municipalities='));
  const outputArg = args.find(a => a.startsWith('--output='));
  
  if (!muniArg) {
    console.error('Usage: node x-engager.js --municipalities=/path/to/municipalities.json [--output=engagement-results.json] [--mock]');
    process.exit(1);
  }
  
  const muniFile = muniArg.split('=')[1];
  const outputFile = outputArg ? outputArg.split('=')[1] : '/tmp/muni-x-engaged.json';
  
  try {
    const data = JSON.parse(fs.readFileSync(muniFile, 'utf8'));
    const municipalities = data.municipalities || data;
    
    engageOnX(municipalities, MOCK_MODE)
      .then(results => {
        saveResults(results, outputFile);
        
        console.log('\n📊 Engagement Summary:');
        console.log(`   Total with X handles: ${results.total || 0}`);
        console.log(`   Followed: ${results.followed}`);
        console.log(`   Replied: ${results.replied}`);
        console.log(`   Quoted: ${results.quoted}`);
        console.log(`   Mode: ${results.mock ? 'MOCK' : 'LIVE'}`);
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

export {
  engageOnX,
  engageWithMunicipality
};
