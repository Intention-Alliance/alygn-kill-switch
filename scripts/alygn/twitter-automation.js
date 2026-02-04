#!/usr/bin/env node

/**
 * ALYGN Twitter/X Automation - Grok Integration
 * Fetches prompts from Notion and executes them via Grok API
 * 
 * Notion Pages:
 * - Prompts: https://www.notion.so/Twitter-X-Growth-Strategy-2fc334874af681889a5fd95a1fa1dd72
 * - Logs: https://www.notion.so/Automation-Logs-2fc334874af681e3a0f1d8fe3001a98e
 */

const https = require('https');
const { getNotionKey, getGrokKey, getGrokModel, getNotionPage } = require('../shared/load-credentials');

const NOTION_API_KEY = getNotionKey();
const GROK_API_KEY = getGrokKey();
const GROK_MODEL = getGrokModel();
const TWITTER_PROMPTS_PAGE_ID = getNotionPage('twitter_prompts');
const AUTOMATION_LOGS_PAGE_ID = getNotionPage('automation_logs');

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

async function grokRequest(prompt) {
  if (!GROK_API_KEY || GROK_API_KEY === 'PENDING') {
    throw new Error('GROK_API_KEY not configured. Check config/credentials.json');
  }

  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      model: GROK_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7
    });

    const options = {
      hostname: 'api.x.ai',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROK_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(new Error(`Grok API error: ${parsed.error?.message || data}`));
          } else {
            resolve(parsed.choices[0].message.content);
          }
        } catch (e) {
          reject(new Error(`Failed to parse Grok response: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function logToNotion(promptNumber, status, details) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] Prompt #${promptNumber} - ${status}\n${details}`;

  try {
    // Append to Automation Logs page
    await notionRequest('PATCH', `/v1/blocks/${AUTOMATION_LOGS_PAGE_ID}/children`, {
      children: [
        {
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [
              {
                type: 'text',
                text: { content: logEntry }
              }
            ]
          }
        }
      ]
    });
  } catch (error) {
    console.error('Failed to log to Notion:', error.message);
  }
}

async function fetchPromptFromNotion(promptNumber) {
  console.log(`📖 Fetching Prompt #${promptNumber} from Notion...`);

  // Fetch blocks from Twitter/X Growth Strategy page
  const response = await notionRequest('GET', `/v1/blocks/${TWITTER_PROMPTS_PAGE_ID}/children?page_size=100`);

  // Find the paragraph matching "[Prompt #N]"
  let promptText = null;

  for (const block of response.results) {
    if (block.type === 'paragraph') {
      const text = block.paragraph.rich_text.map(rt => rt.text.content).join('');
      
      // Format: [Prompt #N] Title: 'prompt text' or "prompt text"
      if (text.includes(`[Prompt #${promptNumber}]`)) {
        // Extract the quoted text after the colon
        const match = text.match(/:\s*['"](.+?)['"]\s*$/);
        if (match) {
          promptText = match[1];
        } else {
          // Fallback: take everything after the colon
          const colonIndex = text.indexOf(':');
          if (colonIndex > -1) {
            promptText = text.substring(colonIndex + 1).trim().replace(/^['"]|['"]$/g, '');
          }
        }
        break;
      }
    }
  }

  if (!promptText) {
    throw new Error(`Prompt #${promptNumber} not found in Twitter/X Growth Strategy page`);
  }

  console.log(`✅ Found: ${promptText.substring(0, 100)}...`);
  return promptText;
}

async function executePrompt(promptNumber, context = {}) {
  console.log(`\n🚀 Executing Prompt #${promptNumber}`);
  console.log('================================\n');

  try {
    // Fetch prompt from Notion
    const promptTemplate = await fetchPromptFromNotion(promptNumber);

    // Replace placeholders if any
    let finalPrompt = promptTemplate;
    for (const [key, value] of Object.entries(context)) {
      finalPrompt = finalPrompt.replace(new RegExp(`\\[${key}\\]`, 'g'), value);
    }

    console.log(`📝 Prompt: ${finalPrompt.substring(0, 150)}...\n`);

    // Execute via Grok
    if (!GROK_API_KEY) {
      console.log('⚠️  Grok API key not set - skipping AI execution');
      console.log('ℹ️  Set GROK_API_KEY environment variable to enable\n');
      
      await logToNotion(promptNumber, 'DRY RUN', `Prompt: ${finalPrompt.substring(0, 200)}`);
      
      return `[DRY RUN] Would execute: ${finalPrompt}`;
    }

    console.log('🤖 Calling Grok API...\n');
    const response = await grokRequest(finalPrompt);

    console.log('✅ Grok Response:\n');
    console.log(response);
    console.log('\n================================\n');

    // Log to Notion
    await logToNotion(
      promptNumber,
      'SUCCESS',
      `Prompt: ${finalPrompt.substring(0, 200)}\n\nResponse: ${response.substring(0, 500)}`
    );

    return response;

  } catch (error) {
    console.error('❌ Error:', error.message);
    
    await logToNotion(
      promptNumber,
      'ERROR',
      `Error: ${error.message}`
    );
    
    throw error;
  }
}

async function listPrompts() {
  console.log('📋 Listing all prompts from Twitter/X Growth Strategy\n');

  const response = await notionRequest('GET', `/v1/blocks/${TWITTER_PROMPTS_PAGE_ID}/children?page_size=100`);

  const prompts = [];

  for (const block of response.results) {
    if (block.type === 'paragraph') {
      const text = block.paragraph.rich_text.map(rt => rt.text.content).join('');
      
      // Format: [Prompt #N] Title: 'prompt text'
      const match = text.match(/\[Prompt #(\d+)\]\s*([^:]+):/);
      if (match) {
        const promptNumber = parseInt(match[1]);
        const title = match[2].trim();
        
        // Extract preview (first 80 chars of prompt text after colon)
        const colonIndex = text.indexOf(':', match.index);
        let preview = '';
        if (colonIndex > -1) {
          preview = text.substring(colonIndex + 1).trim().replace(/^['"]/, '').substring(0, 80);
        }
        
        prompts.push({ number: promptNumber, title, preview });
      }
    }
  }

  prompts.sort((a, b) => a.number - b.number);

  prompts.forEach(p => {
    console.log(`#${p.number}: ${p.title}`);
    if (p.preview) console.log(`   ${p.preview}...`);
    console.log('');
  });

  console.log(`Total: ${prompts.length} prompts found\n`);
}

// CLI usage
if (require.main === module) {
  const [,, cmd, ...args] = process.argv;

  if (cmd === 'exec') {
    const promptNumber = parseInt(args[0]);
    const contextStr = args[1] || '{}';
    let context = {};
    try {
      context = JSON.parse(contextStr);
    } catch (e) {
      console.error('Invalid context JSON:', e.message);
      process.exit(1);
    }

    executePrompt(promptNumber, context)
      .then(() => process.exit(0))
      .catch(err => {
        console.error('\n❌ Failed:', err.message);
        process.exit(1);
      });

  } else if (cmd === 'fetch') {
    const promptNumber = parseInt(args[0]);
    fetchPromptFromNotion(promptNumber)
      .then(prompt => {
        console.log('\n📝 Prompt Text:\n');
        console.log(prompt);
        process.exit(0);
      })
      .catch(err => {
        console.error('Error:', err.message);
        process.exit(1);
      });

  } else if (cmd === 'list') {
    listPrompts()
      .then(() => process.exit(0))
      .catch(err => {
        console.error('Error:', err.message);
        process.exit(1);
      });

  } else {
    console.log('ALYGN Twitter/X Automation - Grok Integration\n');
    console.log('Usage:');
    console.log('  node twitter-automation.js exec <prompt-number> [context-json]');
    console.log('  node twitter-automation.js fetch <prompt-number>');
    console.log('  node twitter-automation.js list');
    console.log('\nExamples:');
    console.log('  node twitter-automation.js exec 1');
    console.log('  node twitter-automation.js exec 6 \'{"topic":"AGI safety"}\'');
    console.log('  node twitter-automation.js fetch 15');
    console.log('  node twitter-automation.js list');
    process.exit(1);
  }
}

module.exports = {
  executePrompt,
  fetchPromptFromNotion,
  grokRequest,
  logToNotion
};
