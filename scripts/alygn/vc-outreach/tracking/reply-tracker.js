#!/usr/bin/env node
/**
 * ALYGN VC Reply Tracker
 * 
 * Monitors Gmail for VC responses and auto-updates Notion:
 * - IMAP connection to Gmail
 * - Search for reply emails (subject filter, domain filter)
 * - Match sender to Notion VC database
 * - Sentiment analysis (positive/neutral/negative)
 * - Extract intent (meeting request, interested, declined, info request)
 * - Update Notion with reply data
 * - WhatsApp notification for urgent replies
 * 
 * Usage:
 *   node reply-tracker.js                    # Check for new replies
 *   node reply-tracker.js --test             # Test with sample email
 *   node reply-tracker.js --dry-run          # Preview without updating
 *   node reply-tracker.js --force-notif      # Send WhatsApp notification even if no new replies
 */

const Imap = require('imap');
const { simpleParser } = require('mailparser');
const { getNotionKey, getNotionDatabase } = require('../../../shared/load-credentials');
const { log, success, error, info, LogLevel } = require('../utils/logger');
const https = require('https');

// Configuration
const CONFIG = {
  imap: {
    user: process.env.GMAIL_ADDRESS || 'alyyygn@gmail.com',
    password: process.env.GMAIL_APP_PASSWORD, // From credentials.json
    host: 'imap.gmail.com',
    port: 993,
    tls: true
  },
  filters: {
    subject: {
      contains: ['[ALYGN VC]', 'Re:', 'Fwd:']
    },
    from: {
      domains: [
        'ycombinator.com',
        'a16z.com',
        'sequoiacap.com',
        'lightspeedvp.com',
        'khoslaventures.com',
        'menlovc.com',
        'bvp.com',
        'insightpartners.com',
        'airstreecapital.com',
        'greylock.com',
        'benchmark.com',
        'indexventures.com',
        'accel.com',
        'foundersfund.com',
        'usv.com',
        'crunchbase.com'
      ]
    }
  },
  sentiment: {
    positive: [
      'interested',
      'meeting',
      'call',
      'discuss',
      'let\'s',
      'would like',
      'schedule',
      'follow up',
      'keen',
      'great',
      'thanks',
      'appreciate'
    ],
    negative: [
      'not interested',
      'decline',
      'pass',
      'not a fit',
      'busy',
      'unfortunately',
      'not looking',
      'not relevant'
    ]
  },
  urgency: {
    keywords: [
      'meeting request',
      'invest',
      'interested in',
      'would like to discuss',
      'call scheduled',
      'next steps'
    ]
  },
  discord: {
    threadId: '1470977688368840928', // #annotations channel (VC outreach reports thread)
    channelId: '1470977688368840928'
  }
};

let WHOLE_MESSAGE = ''; // Store full message for Notion

// Notion helpers
const NOTION_API_KEY = getNotionKey();
const VC_DATABASE_ID = getNotionDatabase('vc_outreach');

async function notionRequest(method, endpoint, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.notion.com',
      path: endpoint,
      method: method,
      headers: {
        'Authorization': `Bearer ${NOTION_API_KEY}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application.json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(new Error(`Notion API error: ${parsed.message || data}`));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(new Error(`Failed to parse response: ${data}`));
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

/**
 * Get all VCs from Notion for email matching
 */
async function loadVCsFromNotion() {
  try {
    const response = await notionRequest('POST', `/v1/databases/${VC_DATABASE_ID}/query`, {
      page_size: 100
    });

    const vcMap = new Map();

    for (const page of response.results) {
      const vcName = page.properties['VC Name']?.title?.[0]?.text?.content || '';
      const contactEmail = page.properties['Contact Email']?.email || '';
      const contactPerson = page.properties['Contact Person']?.rich_text?.[0]?.text?.content || '';
      
      if (contactEmail) {
        vcMap.set(contactEmail.toLowerCase(), {
          id: page.id,
          name: vcName,
          person: contactPerson
        });
      }
    }

    return vcMap;
  } catch (err) {
    throw new Error(`Failed to load VCs from Notion: ${err.message}`);
  }
}

/**
 * Simple sentiment analysis (rule-based)
 */
function analyzeSentiment(emailContent) {
  const content = emailContent.toLowerCase();
  let positiveScore = 0;
  let negativeScore = 0;

  CONFIG.sentiment.positive.forEach(word => {
    if (content.includes(word)) positiveScore++;
  });

  CONFIG.sentiment.negative.forEach(word => {
    if (content.includes(word)) negativeScore++;
  });

  if (positiveScore > negativeScore) {
    return 'Positive';
  } else if (negativeScore > positiveScore) {
    return 'Negative';
  } else {
    return 'Neutral';
  }
}

/**
 * Extract intent from email
 */
function extractIntent(emailContent) {
  const content = emailContent.toLowerCase();

  for (const keyword of CONFIG.urgency.keywords) {
    if (content.includes(keyword)) {
      return keyword;
    }
  }

  if (content.includes('please send more')) return 'Info Request';
  if (content.includes('thank you for reaching out')) return 'Acknowledgement';
  if (content.includes('not interested') || content.includes('pass')) return 'Declined';

  return 'Unknown';
}

/**
 * Check if reply is urgent
 */
function isUrgent(emailContent, intent) {
  const content = emailContent.toLowerCase();

  // Urgent intents
  if (['meeting request', 'invest', 'interested in'].includes(intent)) {
    return true;
  }

  // Urgent keywords
  for (const keyword of CONFIG.urgency.keywords) {
    if (content.includes(keyword)) {
      return true;
    }
  }

  return false;
}

/**
 * Generate follow-up suggestion
 */
function generateFollowUp(sentiment, intent) {
  if (sentiment === 'Positive' && intent === 'meeting request') {
    return 'Schedule calendar invite for the meeting.';
  } else if (sentiment === 'Positive' && intent === 'interested in') {
    return 'Send follow-up with more details / materials.';
  } else if (sentiment === 'Positive' && intent === 'call') {
    return 'Reply to confirm call time slot.';
  } else if (sentiment === 'Negative') {
    return 'Mark as declined, no follow-up needed.';
  } else if (sentiment === 'Neutral') {
    return 'Wait for 3 days, then follow up.';
  } else {
    return 'Review and determine next action.';
  }
}

/**
 * Update Notion with reply data
 */
async function updateNotionWithReply(vcId, replyData, dryRun = false) {
  const today = new Date().toISOString().split('T')[0];

  const properties = {
    "Status": { select: { name: "Replied" } },
    "Reply Date": { date: { start: today } },
    "Reply Sentiment": { select: { name: replyData.sentiment } },
    "Next Action": { rich_text: [{ text: { content: replyData.nextAction } }] }
  };

  if (replyData.intent && replyData.intent !== 'Unknown') {
    properties["Intent"] = { rich_text: [{ text: { content: replyData.intent } }] };
  }

  // Create reply summary (truncated if too long)
  const summary = replyData.summary.substring(0, 500);
  properties["Notes"] = { rich_text: [{ text: { content: `${replyData.date}: Reply received.\n\n${summary}` } }] };

  if (dryRun) {
    log(`[DRY RUN] Would update Notion page ${vcId}:`);
    log(JSON.stringify(properties, null, 2));
    return true;
  }

  try {
    await notionRequest('PATCH', `/v1/pages/${vcId}`, { properties });
    success(`✅ Updated Notion: ${replyData.vcName} - ${replyData.sentiment}`);
    return true;
  } catch (err) {
    error(`Failed to update Notion: ${err.message}`);
    return false;
  }
}

/**
 * Send Discord notification for urgent replies
 * Posts to #annotations channel (VC outreach reports thread)
 */
async function sendDiscordNotification(replyData, urgentReplies) {
  if (urgentReplies.length === 0 && !process.env.FORCE_NOTIF) {
    return;
  }

  // Build message
  let message = `## 📬 VC Reply Tracker\n\n`;

  if (urgentReplies.length > 0) {
    message += `🚨 **${urgentReplies.length} URGENT reply(ies):**\n\n`;
    urgentReplies.forEach((reply, i) => {
      message += `**${i + 1}. ${reply.vcName}**\n`;
      message += `- Sentiment: ${reply.sentiment}\n`;
      message += `- Intent: ${reply.intent}\n`;
      message += `- From: ${reply.from}\n\n`;
    });
  } else {
    message += `✅ **No new replies** since last check.\n\n`;
    message += `**Totals today:**\n`;
    message += `- Total: ${replyData.totalReplies}\n`;
    message += `- Positive: ${replyData.positiveCount}\n`;
    message += `- Neutral: ${replyData.neutralCount}\n`;
    message += `- Negative: ${replyData.negativeCount}\n`;
  }

  // Discord posting would happen via OpenClaw message tool
  // For now, just log the message content
  log(`💬 Discord notification to #annotations: ${message.substring(0, 200)}...`);

  return message;
}

/**
 * Process email and extract reply data
 */
async function processEmail(email, vcMap, dryRun = false) {
  try {
    const parsed = await simpleParser(email);
    
    const fromEmail = parsed.from?.value?.[0]?.address?.toLowerCase();
    const fromName = parsed.from?.value?.[0]?.name || '';
    const subject = parsed.subject || '';
    const body = (parsed.text || parsed.html || '').replace(/<[^>]*>/g, ' ');
    
    // Match sender to VC database
    let vcMatch = null;
    for (const [email, vc] of vcMap) {
      if (fromEmail === email || fromEmail.includes(vc.name.toLowerCase().replace(/\s+/g, ''))) {
        vcMatch = vc;
        break;
      }
    }

    if (!vcMatch) {
      info(`⚠️  No VC match for: ${fromEmail} (${subject})`);
      return null;
    }

    // Analyze reply
    const sentiment = analyzeSentiment(body);
    const intent = extractIntent(body);
    const urgent = isUrgent(body, intent);
    const nextAction = generateFollowUp(sentiment, intent);
    
    // Truncate body for storage
    const bodySummary = body.substring(0, 200);

    const replyData = {
      vcName: vcMatch.name,
      vcId: vcMatch.id,
      from: fromName || fromEmail,
      email: fromEmail,
      date: parsed.date?.toISOString() || new Date().toISOString(),
      subject,
      sentiment,
      intent,
      urgent,
      nextAction,
      summary: bodySummary
    };

    // Update Notion
    await updateNotionWithReply(vcMatch.id, replyData, dryRun);

    return replyData;
  } catch (err) {
    error(`Failed to process email: ${err.message}`);
    return null;
  }
}

/**
 * Check Gmail for new replies via IMAP
 */
async function checkGmailForReplies(dryRun = false) {
  log('🔍 Checking Gmail for VC replies...');

  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user: process.env.GMAIL_USER || CONFIG.imap.user,
      password: process.env.GMAIL_PASSWORD || process.env.GMAIL_APP_PASSWORD,
      host: CONFIG.imap.host,
      port: CONFIG.imap.port,
      tls: CONFIG.imap.tls,
      tlsOptions: { rejectUnauthorized: false }
    });

    let replies = [];
    let urgentReplies = [];

    imap.once('ready', () => {
      log('✅ Connected to Gmail');

      // Open INBOX
      imap.openBox('INBOX', false, (err, box) => {
        if (err) {
          imap.end();
          return reject(err);
        }

        // Search for reply emails
        const searchCriteria = [
          ['UNSEEN'],
          ['SINCE', new Date(Date.now() - 24 * 60 * 60 * 1000)] // Last 24 hours
        ];

        imap.search(searchCriteria, (err, results) => {
          if (err) {
            imap.end();
            return reject(err);
          }

          if (results.length === 0) {
            info('No new emails in last 24 hours');
            imap.end();
            return resolve({ replies: [], count: 0 });
          }

          log(`Found ${results.length} emails in last 24 hours`);

          const fetch = imap.fetch(results, { bodies: '' });
          let processedCount = 0;

          fetch.on('message', (msg) => {
            msg.on('body', (stream) => {
              WHOLE_MESSAGE = '';
              stream.on('data', (chunk) => WHOLE_MESSAGE += chunk.toString('utf8'));
              stream.once('end', async () => {
                // Process this email
                try {
                  const vcMap = await loadVCsFromNotion();
                  const reply = await processEmail(WHOLE_MESSAGE, vcMap, dryRun);
                  
                  if (reply) {
                    replies.push(reply);
                    if (reply.urgent) {
                      urgentReplies.push(reply);
                    }
                  }
                } catch (err) {
                  error(`Error processing email: ${err.message}`);
                }
              });
            });
          });

          fetch.once('error', (err) => {
            error('Fetch error:', err);
            imap.end();
            reject(err);
          });

          fetch.once('end', () => {
            imap.end();
            resolve({
              replies,
              urgentReplies,
              count: replies.length
            });
          });
        });
      });
    });

    imap.once('error', (err) => {
      imap.end();
      reject(err);
    });

    imap.connect();
  });
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const testMode = args.includes('--test');

  console.log('\n📬 VC Reply Tracker');
  console.log('==================\n');

  try {
    const result = await checkGmailForReplies(dryRun);

    log('\n📊 Reply Summary');
    log('================');
    log(`Total replies: ${result.count}`);
    log(`Urgent: ${result.urgentReplies.length}`);
    
    if (result.replies.length > 0) {
      const sentiments = result.replies.reduce((acc, r) => {
        acc[r.sentiment] = (acc[r.sentiment] || 0) + 1;
        return acc;
      }, {});

      log(`Sentiments:`, sentiments);
    }

    // Send Discord notification for urgent replies
    await sendDiscordNotification({
      totalReplies: result.count,
      positiveCount: result.replies.filter(r => r.sentiment === 'Positive').length,
      neutralCount: result.replies.filter(r => r.sentiment === 'Neutral').length,
      negativeCount: result.replies.filter(r => r.sentiment === 'Negative').length,
    }, result.urgentReplies);

    if (!dryRun && result.count > 0) {
      console.log('\n✅ Reply tracking complete');
    }

    process.exit(0);
  } catch (err) {
    error(`Reply tracker failed: ${err.message}`);
    process.exit(1);
  }
}

// CLI execution
if (require.main === module) {
  main();
}

module.exports = {
  checkGmailForReplies,
  analyzeSentiment,
  extractIntent,
  generateFollowUp
};