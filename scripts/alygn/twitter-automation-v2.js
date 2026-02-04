#!/usr/bin/env node

/**
 * ALYGN Twitter/X Automation - Grok Integration (IMPROVED)
 * 
 * Features:
 * - Centralized logging (local + Notion)
 * - Grok Search integration for real-time data
 * - Structured markdown output
 * - Complete, non-truncated responses
 * 
 * Notion Pages:
 * - Prompts: https://www.notion.so/Twitter-X-Growth-Strategy-2fc334874af681889a5fd95a1fa1dd72
 * - Parent: Organizations TODO Lists
 */

const https = require('https');
const fs = require('fs').promises;
const path = require('path');
const { xai } = require('@ai-sdk/xai');
const { generateText } = require('ai');
const { getNotionKey, getGrokKey, getGrokModel, getNotionPage } = require('../shared/load-credentials');
const { log, success, error, LogLevel } = require('../shared/logger');

const NOTION_API_KEY = getNotionKey();
const GROK_API_KEY = getGrokKey();
const GROK_MODEL = getGrokModel();
const TWITTER_PROMPTS_PAGE_ID = getNotionPage('twitter_prompts');

// Configure xAI with API key
process.env.XAI_API_KEY = GROK_API_KEY;

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
 * Enhanced Grok Request with Search Support using @ai-sdk/xai
 */
async function grokRequest(prompt, useSearch = false) {
  if (!GROK_API_KEY || GROK_API_KEY === 'PENDING') {
    throw new Error('GROK_API_KEY not configured');
  }
  
  const requestConfig = {
    model: xai.responses(GROK_MODEL || 'grok-4-fast'),
    prompt: prompt,
  };

  // Enable web search tool if requested
  if (useSearch) {
    requestConfig.tools = {
      web_search: xai.tools.webSearch(),
    };
  }

  const { text, sources, usage } = await generateText(requestConfig);

  return {
    content: text,
    searchResults: sources || null,
    model: GROK_MODEL || 'grok-4-fast',
    usage: usage ? {
      total_tokens: usage.totalTokens,
      prompt_tokens: usage.promptTokens,
      completion_tokens: usage.completionTokens
    } : null
  };
}

/**
 * Fetch prompt from Notion
 */
async function fetchPromptFromNotion(promptNumber) {
  const response = await notionRequest('GET', `/v1/blocks/${TWITTER_PROMPTS_PAGE_ID}/children?page_size=100`);

  for (const block of response.results) {
    if (block.type === 'paragraph') {
      const text = block.paragraph.rich_text.map(rt => rt.text.content).join('');
      
      if (text.includes(`[Prompt #${promptNumber}]`)) {
        const match = text.match(/:\s*['"](.+?)['"]\s*$/);
        if (match) {
          return {
            number: promptNumber,
            title: text.match(/\[Prompt #\d+\]\s*(.+?):/)?.[1]?.trim() || 'Untitled',
            text: match[1]
          };
        }
      }
    }
  }

  throw new Error(`Prompt #${promptNumber} not found`);
}

/**
 * List all prompts
 */
async function listPrompts() {
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
          preview: match[3].substring(0, 80) + '...'
        });
      }
    }
  }

  return prompts.sort((a, b) => a.number - b.number);
}

/**
 * Execute prompt with Grok
 */
async function executePrompt(promptNumber, useSearch = false) {
  try {
    // Fetch prompt
    const prompt = await fetchPromptFromNotion(promptNumber);
    
    await log({
      type: 'twitter-automation',
      title: `Executing Prompt #${promptNumber}: ${prompt.title}`,
      level: LogLevel.INFO,
      summary: `Fetching response from Grok${useSearch ? ' (with search enabled)' : ''}`,
      details: { prompt: prompt.text, useSearch },
      notionParent: 'organizations_todos'
    });

    // Execute with Grok
    const response = await grokRequest(prompt.text, useSearch);
    
    // Format response as markdown
    let outputMd = `# Twitter Automation - Prompt #${promptNumber}\n\n`;
    outputMd += `## ${prompt.title}\n\n`;
    outputMd += `**Executed:** ${new Date().toISOString()}\n`;
    outputMd += `**Model:** ${response.model}\n`;
    outputMd += `**Search Enabled:** ${useSearch ? 'Yes' : 'No'}\n\n`;
    
    if (response.searchResults && response.searchResults.length > 0) {
      outputMd += `### 🔍 Search Results & Citations\n\n`;
      outputMd += `Found ${response.searchResults.length} sources from web search:\n\n`;
      response.searchResults.forEach((source, idx) => {
        outputMd += `${idx + 1}. ${source.url || source.title || 'Source'}\n`;
      });
      outputMd += `\n`;
    }
    
    outputMd += `### 📝 Response\n\n`;
    outputMd += response.content;
    outputMd += `\n\n---\n\n`;
    
    if (response.usage) {
      outputMd += `**Tokens Used:** ${response.usage.total_tokens} (prompt: ${response.usage.prompt_tokens}, completion: ${response.usage.completion_tokens})\n`;
    }

    // Log success with complete output
    await success(
      'twitter-automation',
      `Prompt #${promptNumber} Completed Successfully`,
      `Generated ${response.content.length} characters of content`,
      outputMd
    );

    // Save to local file for reference
    const outputDir = path.join(process.env.HOME, '.openclaw/workspace/twitter-outputs');
    await fs.mkdir(outputDir, { recursive: true });
    const filename = `prompt-${promptNumber}-${Date.now()}.md`;
    await fs.writeFile(path.join(outputDir, filename), outputMd);

    return {
      success: true,
      prompt,
      response: response.content,
      searchResults: response.searchResults,
      outputFile: filename
    };

  } catch (err) {
    await error(
      'twitter-automation',
      `Prompt #${promptNumber} Failed`,
      err
    );
    throw err;
  }
}

/**
 * Main CLI
 */
async function main() {
  const command = process.argv[2];
  const arg = process.argv[3];

  try {
    if (command === 'list') {
      console.log('📋 Listing all prompts from Twitter/X Growth Strategy\n');
      const prompts = await listPrompts();
      
      for (const p of prompts) {
        console.log(`#${p.number}: ${p.title}`);
        console.log(`   ${p.preview}\n`);
      }
      
      console.log(`\nTotal: ${prompts.length} prompts available`);
      
    } else if (command === 'fetch' && arg) {
      const promptNumber = parseInt(arg);
      const prompt = await fetchPromptFromNotion(promptNumber);
      
      console.log(`\n📖 Prompt #${promptNumber}: ${prompt.title}\n`);
      console.log(`Full text:\n"${prompt.text}"\n`);
      
    } else if (command === 'exec' && arg) {
      const promptNumber = parseInt(arg);
      const useSearch = process.argv.includes('--search');
      
      console.log(`\n🚀 Executing Prompt #${promptNumber}${useSearch ? ' (with search)' : ''}...\n`);
      
      const result = await executePrompt(promptNumber, useSearch);
      
      console.log('\n✅ Execution complete!');
      console.log(`   Output saved: ${result.outputFile}`);
      console.log(`   Response length: ${result.response.length} chars`);
      
      if (result.searchResults) {
        console.log(`   Search results: ${result.searchResults.length} items`);
      }
      
    } else {
      console.log('ALYGN Twitter Automation (Improved)\n');
      console.log('Usage:');
      console.log('  node twitter-automation-v2.js list                    # List all prompts');
      console.log('  node twitter-automation-v2.js fetch <number>          # Fetch prompt text');
      console.log('  node twitter-automation-v2.js exec <number>           # Execute prompt');
      console.log('  node twitter-automation-v2.js exec <number> --search  # Execute with Grok search');
      console.log('\nExamples:');
      console.log('  node twitter-automation-v2.js list');
      console.log('  node twitter-automation-v2.js exec 1');
      console.log('  node twitter-automation-v2.js exec 13 --search        # Trend monitoring with real tweets');
    }

  } catch (err) {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { executePrompt, listPrompts, fetchPromptFromNotion };
