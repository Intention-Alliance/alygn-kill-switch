#!/usr/bin/env node

/**
 * ALYGN Notion Prompt Updater - Governance-First Context Update
 * 
 * Updates Twitter/X Growth Strategy prompts to align with new institutional messaging
 * 
 * Changes:
 * - Update prompts #1, #4, #13, #15, #18 with governance-first content
 * - Mark prompts #2, #11, #12, #16, #19 as DEPRECATED
 * - Add new prompt #20 for governance-first content check
 * 
 * Page: Twitter/X Growth Strategy (2fc334874af681889a5fd95a1fa1dd72)
 */

const https = require('https');
const { getNotionKey } = require('../shared/load-credentials');

const NOTION_API_KEY = getNotionKey();
const TWITTER_PROMPTS_PAGE_ID = '2fc334874af681889a5fd95a1fa1dd72';

// Updated prompts (governance-first)
const UPDATED_PROMPTS = {
  1: {
    title: 'Pre-Approved Content Posting',
    text: 'Post the next sequential pre-approved post from scripts/alygn/pre-approved-posts.json. Update the tracking file with posted status, date, and tweet ID. Report summary to WhatsApp. Use post-pre-approved.js script.'
  },
  4: {
    title: 'Institutional Commentary Templates',
    text: 'Generate 10 brief, institutional reply templates for AI governance discussions. Tone: calm, restrained, non-promotional. Focus: adding governance perspective, not technical commentary. Preferred language: "Supports coordination", "Enables accountability", "Neutral infrastructure". Avoid: "Regulates", "Controls", "Ensures compliance". Max 280 characters each. Example context: policy debates, coordination challenges, legitimacy discussions.'
  },
  13: {
    title: 'Governance Trend Monitoring',
    text: 'Search for recent developments (last 24-48h) in AI governance, institutional coordination, legitimacy discussions, and cross-organization AI safety efforts. FILTER OUT: pure technical research, product launches, funding news (unless governance-relevant), hype-driven content. OUTPUT: Top 5 governance-relevant items with: (1) Topic/title, (2) 2-3 sentence summary, (3) Governance angle (why it matters for coordination/legitimacy), (4) Source URL. Enable Grok search tool.'
  },
  15: {
    title: 'Governance Reply Framework',
    text: 'Generate 15 institutional reply templates for AI governance discussions. Each template should: (1) Add governance perspective (not technical), (2) Maintain calm, institutional tone, (3) Avoid promotional language or claims, (4) Focus on coordination/legitimacy themes. Include placeholders for: [TOPIC], [AUTHOR], [SPECIFIC_POINT]. Max 280 characters. Example topics: emergency coordination, institutional trust, pre-crisis preparation, neutral oversight.'
  },
  18: {
    title: 'Message Clarity Review',
    text: 'Analyze last week\'s Twitter content (posts, replies, engagement). Evaluate: (1) Tone alignment with institutional restraint (calm, non-promotional), (2) Language compliance (preferred vs avoided terms), (3) Message clarity (governance perspective vs technical commentary), (4) Engagement quality (adding value vs noise). Focus on institutional credibility, not virality metrics. Suggest 3-5 improvements for next week.'
  },
  20: {
    title: 'Governance-First Content Check',
    text: 'Review this proposed tweet/thread and evaluate governance alignment. Check: (1) Does it maintain institutional restraint? (2) Does it avoid promotional language? (3) Does it use preferred language ("supports coordination" vs "regulates")? (4) Does it focus on governance perspective vs technical details? (5) Is tone calm, institutional, non-hype? Output: APPROVED / NEEDS REVISION with specific feedback. Include rewritten version if needed.'
  }
};

// Prompts to deprecate
const DEPRECATED_PROMPTS = [2, 11, 12, 16, 19];

async function notionRequest(method, endpoint, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.notion.com',
      path: endpoint,
      method: method,
      headers: {
        'Authorization': `Bearer ${NOTION_API_KEY}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
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
 * Fetch all blocks (prompts) from the page
 */
async function fetchPrompts() {
  console.log('📖 Fetching current prompts from Notion...\n');
  const response = await notionRequest('GET', `/v1/blocks/${TWITTER_PROMPTS_PAGE_ID}/children?page_size=100`);
  
  const prompts = [];
  for (const block of response.results) {
    if (block.type === 'paragraph') {
      const text = block.paragraph.rich_text.map(rt => rt.text.content).join('');
      const match = text.match(/\[Prompt #(\d+)\]\s*(.+?):\s*['"](.+?)['"]/);
      
      if (match) {
        prompts.push({
          number: parseInt(match[1]),
          title: match[2].trim(),
          text: match[3],
          blockId: block.id,
          fullText: text
        });
      }
    }
  }
  
  return prompts.sort((a, b) => a.number - b.number);
}

/**
 * Update a specific prompt block
 */
async function updatePrompt(blockId, promptNumber, title, newText) {
  const formattedText = `[Prompt #${promptNumber}] ${title}: "${newText}"`;
  
  const body = {
    paragraph: {
      rich_text: [
        {
          type: 'text',
          text: { content: formattedText }
        }
      ]
    }
  };
  
  await notionRequest('PATCH', `/v1/blocks/${blockId}`, body);
  console.log(`✅ Updated Prompt #${promptNumber}: ${title}`);
}

/**
 * Mark prompt as deprecated
 */
async function deprecatePrompt(blockId, promptNumber, title, originalText) {
  const deprecatedText = `❌ [Prompt #${promptNumber}] ${title} (DEPRECATED - Governance-First Update): "${originalText}"`;
  
  const body = {
    paragraph: {
      rich_text: [
        {
          type: 'text',
          text: { content: deprecatedText },
          annotations: {
            strikethrough: true,
            color: 'gray'
          }
        }
      ]
    }
  };
  
  await notionRequest('PATCH', `/v1/blocks/${blockId}`, body);
  console.log(`❌ Deprecated Prompt #${promptNumber}: ${title}`);
}

/**
 * Append new prompt block to page
 */
async function appendPrompt(promptNumber, title, text) {
  const formattedText = `[Prompt #${promptNumber}] ${title}: "${text}"`;
  
  const body = {
    children: [
      {
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [
            {
              type: 'text',
              text: { content: formattedText }
            }
          ]
        }
      }
    ]
  };
  
  await notionRequest('PATCH', `/v1/blocks/${TWITTER_PROMPTS_PAGE_ID}/children`, body);
  console.log(`➕ Added Prompt #${promptNumber}: ${title}`);
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 Starting Notion prompt updates (Governance-First)\n');
  console.log('Target page: Twitter/X Growth Strategy');
  console.log(`Page ID: ${TWITTER_PROMPTS_PAGE_ID}\n`);
  
  try {
    // Fetch current prompts
    const prompts = await fetchPrompts();
    console.log(`Found ${prompts.length} existing prompts\n`);
    
    console.log('═══════════════════════════════════════════════════\n');
    console.log('UPDATING PROMPTS (Governance-First Content)\n');
    console.log('═══════════════════════════════════════════════════\n');
    
    // Update prompts with new governance-first content
    for (const [num, update] of Object.entries(UPDATED_PROMPTS)) {
      const promptNum = parseInt(num);
      const existingPrompt = prompts.find(p => p.number === promptNum);
      
      if (existingPrompt && promptNum !== 20) {
        // Update existing prompt
        await updatePrompt(existingPrompt.blockId, promptNum, update.title, update.text);
      } else if (promptNum === 20) {
        // Append new prompt #20
        await appendPrompt(promptNum, update.title, update.text);
      }
      
      // Add delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log('\n═══════════════════════════════════════════════════\n');
    console.log('DEPRECATING PROMPTS (No Longer Aligned)\n');
    console.log('═══════════════════════════════════════════════════\n');
    
    // Deprecate obsolete prompts
    for (const num of DEPRECATED_PROMPTS) {
      const existingPrompt = prompts.find(p => p.number === num);
      
      if (existingPrompt) {
        await deprecatePrompt(existingPrompt.blockId, num, existingPrompt.title, existingPrompt.text);
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    console.log('\n═══════════════════════════════════════════════════\n');
    console.log('✅ ALL UPDATES COMPLETE!\n');
    console.log('═══════════════════════════════════════════════════\n');
    
    console.log('Summary:');
    console.log(`  • Updated: ${Object.keys(UPDATED_PROMPTS).length} prompts`);
    console.log(`  • Deprecated: ${DEPRECATED_PROMPTS.length} prompts`);
    console.log(`  • Added: 1 new prompt (#20)`);
    console.log('\nNext steps:');
    console.log('  1. Verify prompts in Notion');
    console.log('  2. Test updated automation scripts');
    console.log('  3. Update cron jobs to use pre-approved posts');
    
  } catch (err) {
    console.error('\n❌ Error during Notion update:', err.message);
    process.exit(1);
  }
}

// Execute
if (require.main === module) {
  main();
}

module.exports = { updatePrompt, deprecatePrompt, appendPrompt, fetchPrompts };
