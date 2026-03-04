/**
 * Discord Reporter - Creates threads and posts reports to Discord
 * Handles all Alygn Twitter workflow communication
 */

const https = require('https');

// Discord configuration
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_ANNOTATIONS_CHANNEL = '1466532145257255004'; // #annotations

/**
 * Creates a new thread in annotations channel
 * @param {string} title - Thread title
 * @param {string} initialMessage - First message in thread
 * @returns {Promise<Object>} Thread info (id, url)
 */
async function createThread(title, initialMessage) {
  if (!DISCORD_BOT_TOKEN) {
    console.warn('DISCORD_BOT_TOKEN not set, logging to console instead');
    console.log(`\n🧵 THREAD: ${title}`);
    console.log(initialMessage);
    return { id: 'mock-thread', url: 'mock://thread' };
  }

  try {
    // Start thread in annotations channel
    const threadResponse = await discordRequest(
      `POST`,
      `/channels/${DISCORD_ANNOTATIONS_CHANNEL}/threads`,
      {
        name: title,
        auto_archive_duration: 1440, // 24 hours
        type: 11 // PUBLIC_THREAD
      }
    );

    const threadId = threadResponse.id;

    // Send initial message to thread
    if (initialMessage) {
      await discordRequest(
        `POST`,
        `/channels/${threadId}/messages`,
        { content: initialMessage }
      );
    }

    return {
      id: threadId,
      url: `https://discord.com/channels/1117841083351711785/${threadId}`,
      name: threadResponse.name
    };
  } catch (error) {
    console.error('Error creating Discord thread:', error.message);
    throw error;
  }
}

/**
 * Posts message to existing thread
 * @param {string} threadId - Thread ID
 * @param {string} message - Message content
 * @param {Array} embeds - Optional embeds
 */
async function postToThread(threadId, message, embeds = []) {
  if (!DISCORD_BOT_TOKEN) {
    console.log(`\n📝 THREAD ${threadId}:`);
    console.log(message);
    if (embeds.length > 0) {
      console.log('Embeds:', JSON.stringify(embeds, null, 2));
    }
    return;
  }

  try {
    await discordRequest(
      `POST`,
      `/channels/${threadId}/messages`,
      {
        content: message,
        embeds: embeds.length > 0 ? embeds : undefined
      }
    );
  } catch (error) {
    console.error('Error posting to thread:', error.message);
    throw error;
  }
}

/**
 * Posts daily summary to new thread
 * @param {Object} summary - Summary data from daily-summary.js
 */
async function postDailySummary(summary) {
  const title = `📊 X/Twitter Daily - ${new Date(summary.date).toLocaleDateString('en-CR', { 
    timeZone: 'America/Costa_Rica',
    month: 'short', 
    day: 'numeric' 
  })}`;

  const message = generateSummaryMessage(summary);

  const thread = await createThread(title, message);
  console.log(`Daily summary thread created: ${thread.url}`);
  
  return thread;
}

/**
 * Generates formatted summary message
 */
function generateSummaryMessage(summary) {
  const lines = [
    '📊 **Alygn X/Twitter Daily Summary**',
    `Date: ${new Date(summary.date).toLocaleString('en-CR', { timeZone: 'America/Costa_Rica' })}`,
    ''
  ];

  let postsCount = 0;
  let repliesCount = 0;
  let quotesCount = 0;
  let followsCount = 0;
  let errorsCount = 0;

  // Phase-by-phase summary
  Object.entries(summary.phases || {}).forEach(([phaseId, phase]) => {
    const statusEmoji = phase.status === 'success' ? '✅' : phase.status === 'error' ? '❌' : '⏭️';
    
    if (phase.status === 'error') errorsCount++;
    
    lines.push(`${statusEmoji} **${phase.name}**: ${phase.status}`);
    
    if (phase.status === 'success' && phase.data) {
      // Count actions
      if (phase.data.posts) postsCount += phase.data.posts.length;
      if (phase.data.replies) repliesCount += phase.data.replies.length;
      if (phase.data.quotes) quotesCount += phase.data.quotes.length;
      if (phase.data.follows) followsCount += phase.data.follows.length;
    }
  });

  lines.push('');
  lines.push('📈 **Activity Summary**');
  lines.push(`• Posts: ${postsCount}`);
  lines.push(`• Replies: ${repliesCount}`);
  lines.push(`• Quotes: ${quotesCount}`);
  lines.push(`• Follows: ${followsCount}`);
  lines.push(`• **Total actions: ${postsCount + repliesCount + quotesCount + followsCount}**`);
  
  if (errorsCount > 0) {
    lines.push('');
    lines.push(`⚠️ **${errorsCount} phase(s) had errors** - check logs`);
  }

  lines.push('');
  lines.push('---');
  lines.push('more at @aialygn');

  return lines.join('\n');
}

/**
 * Posts engagement report
 */
async function postEngagementReport(decisions) {
  const title = `🎯 Engagement Report - ${new Date().toLocaleDateString('en-CR', { timeZone: 'America/Costa_Rica' })}`;
  
  const message = [
    '🎯 **Engagement Decisions**',
    '',
    `**Replies:** ${decisions.replies?.length || 0}`,
    `**Quotes:** ${decisions.quotes?.length || 0}`,
    `**Follows:** ${decisions.follows?.length || 0}`,
    '',
    '---',
    decisions.metadata?.mock ? '⚠️ Mock mode (no API key)' : '✅ Live mode',
    'more at @aialygn'
  ].join('\n');

  const thread = await createThread(title, message);
  return thread;
}

/**
 * Posts error alert
 */
async function postErrorAlert(error, phase) {
  const title = `🚨 Error Alert - ${phase || 'Unknown Phase'}`;
  
  const message = [
    '🚨 **Workflow Error**',
    '',
    `**Phase:** ${phase || 'Unknown'}`,
    `**Error:** ${error.message || error}`,
    `**Time:** ${new Date().toLocaleString('en-CR', { timeZone: 'America/Costa_Rica' })}`,
    '',
    'Check logs for details.',
    '',
    '---',
    'more at @aialygn'
  ].join('\n');

  const thread = await createThread(title, message);
  return thread;
}

/**
 * Helper function for Discord API requests
 */
function discordRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = `https://discord.com/api/v10${path}`;
    const data = JSON.stringify(body);

    const options = {
      hostname: 'discord.com',
      path: path,
      method: method,
      headers: {
        'Authorization': `Bot ${DISCORD_BOT_TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };

    const req = https.request(url, options, (res) => {
      let responseData = '';
      res.on('data', chunk => responseData += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(responseData));
          } catch {
            resolve(responseData);
          }
        } else {
          reject(new Error(`Discord API error: ${res.statusCode} ${responseData}`));
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'create-thread') {
    const title = args[1] || 'Test Thread';
    const message = args.slice(2).join(' ') || 'Test message from discord-reporter.js';
    
    createThread(title, message).then(thread => {
      console.log(`Thread created: ${thread.url}`);
    }).catch(console.error);
  } else if (command === 'test-summary') {
    const mockSummary = {
      date: new Date().toISOString(),
      phases: {
        phase1: { name: 'Pre-approved Post', status: 'success', data: { posts: [{ id: 1 }] } },
        phase2: { name: 'Content Generation', status: 'success', preview: 'Mock content...' },
        phase6: { name: 'Posted Content', status: 'success', data: { posts: [{}, {}] } },
        phase9: { name: 'Engagement', status: 'success', data: { replies: [{}], follows: [{}] } }
      }
    };
    
    postDailySummary(mockSummary).catch(console.error);
  } else {
    console.log('Usage:');
    console.log('  node discord-reporter.js create-thread "Title" "Message"');
    console.log('  node discord-reporter.js test-summary');
    process.exit(1);
  }
}

module.exports = {
  createThread,
  postToThread,
  postDailySummary,
  postEngagementReport,
  postErrorAlert
};
