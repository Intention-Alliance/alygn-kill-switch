#!/usr/bin/env bun

/**
 * ALYGN Twitter/X Automation - Grok Integration (Modern Fetch API)
 * 
 * Uses Grok API with prompt engineering for real-time tweet data
 * Documentation: https://docs.x.ai/docs
 */

import { promises as fs } from 'fs';
import path from 'path';
import { getNotionKey, getGrokKey, getNotionPage } from '../shared/load-credentials.js';
import { log, success, error, LogLevel } from '../shared/logger.js';

const NOTION_API_KEY = getNotionKey();
const GROK_API_KEY = getGrokKey();
const GROK_MODEL = 'grok-4-1-fast';
const TWITTER_PROMPTS_PAGE_ID = getNotionPage('twitter_prompts');

/**
 * Modern fetch-based Notion request
 */
async function notionRequest(method, endpoint, body = null) {
  const response = await fetch(`https://api.notion.com/v1${endpoint}`, {
    method,
    headers: {
      'Authorization': `Bearer ${NOTION_API_KEY}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(`Notion API error: ${data.message || JSON.stringify(data)}`);
  }
  
  return data;
}

/**
 * Enhanced Grok Request with Search Instructions
 * Uses modern fetch API
 */
async function grokRequestWithSearch(prompt, useSearch = false) {
  if (!GROK_API_KEY || GROK_API_KEY === 'PENDING') {
    throw new Error('GROK_API_KEY not configured');
  }
  
  // Enhance prompt to trigger search if needed
  const today = new Date().toISOString().split('T')[0];
  const enhancedPrompt = useSearch
    ? `[SEARCH X/TWITTER] ${prompt}\n\nIMPORTANT: Search X (Twitter) for today's (${today}) most recent and relevant posts. Provide actual tweet examples with engagement metrics if available.`
    : prompt;

  const requestBody = {
    model: GROK_MODEL,
    messages: [
      {
        role: "system",
        content: "You are Grok with real-time access to X (Twitter). When instructed to search, provide current information from today's tweets."
      },
      {
        role: "user",
        content: enhancedPrompt
      }
    ],
    temperature: 0.7,
    stream: false
  };

  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROK_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });

  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(`Grok API error: ${data.error?.message || JSON.stringify(data)}`);
  }

  return {
    content: data.choices[0].message.content,
    citations: data.citations || [],
    toolCalls: data.tool_calls || [],
    model: data.model,
    usage: data.usage
  };
}

/**
 * Fetch prompt from Notion
 */
async function fetchPromptFromNotion(promptNumber) {
  const response = await notionRequest('GET', `/blocks/${TWITTER_PROMPTS_PAGE_ID}/children?page_size=100`);

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
  const response = await notionRequest('GET', `/blocks/${TWITTER_PROMPTS_PAGE_ID}/children?page_size=100`);
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
 * Execute prompt with Grok (with optional X Search via prompt engineering)
 */
async function executePrompt(promptNumber, useSearch = false) {
  try {
    // Fetch prompt
    const prompt = await fetchPromptFromNotion(promptNumber);
    
    await log({
      type: 'twitter-automation',
      title: `Executing Prompt #${promptNumber}: ${prompt.title}`,
      level: LogLevel.INFO,
      summary: `Fetching response from Grok${useSearch ? ' (with X Search prompt)' : ''}`,
      details: { prompt: prompt.text, useSearch },
      notionParent: 'organizations_todos'
    });

    // Execute with Grok
    const response = await grokRequestWithSearch(prompt.text, useSearch);
    
    // Format response as markdown
    let outputMd = `# Twitter Automation - Prompt #${promptNumber}\n\n`;
    outputMd += `## ${prompt.title}\n\n`;
    outputMd += `**Executed:** ${new Date().toISOString()}\n`;
    outputMd += `**Model:** ${response.model}\n`;
    outputMd += `**X Search Enabled:** ${useSearch ? 'Yes' : 'No'}\n\n`;
    
    if (response.citations && response.citations.length > 0) {
      outputMd += `### 🔍 Citations\n\n`;
      outputMd += `Found ${response.citations.length} sources:\n\n`;
      response.citations.forEach((citation, i) => {
        outputMd += `${i + 1}. ${citation}\n`;
      });
      outputMd += '\n';
    }
    
    if (response.toolCalls && response.toolCalls.length > 0) {
      outputMd += `### 🛠️ Tool Calls\n\n`;
      response.toolCalls.forEach((call, i) => {
        outputMd += `${i + 1}. ${call.function.name}\n`;
        outputMd += `   Args: ${JSON.stringify(call.function.arguments, null, 2)}\n`;
      });
      outputMd += '\n';
    }
    
    outputMd += `### 📝 Response\n\n`;
    outputMd += response.content;
    outputMd += `\n\n---\n\n`;
    
    if (response.usage) {
      outputMd += `**Tokens Used:** ${response.usage.total_tokens}\n`;
      outputMd += `**Prompt Tokens:** ${response.usage.prompt_tokens}\n`;
      outputMd += `**Completion Tokens:** ${response.usage.completion_tokens}\n`;
    }

    // Log success with complete output
    await success(
      'twitter-automation',
      `Prompt #${promptNumber} Completed Successfully`,
      `Generated ${response.content.length} characters${response.citations.length > 0 ? ` with ${response.citations.length} citations` : ''}`,
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
      citations: response.citations,
      toolCalls: response.toolCalls,
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
      
      console.log(`\n🚀 Executing Prompt #${promptNumber}${useSearch ? ' (with X Search)' : ''}...\n`);
      
      const result = await executePrompt(promptNumber, useSearch);
      
      console.log('\n✅ Execution complete!');
      console.log(`   Output saved: ${result.outputFile}`);
      console.log(`   Response length: ${result.response.length} chars`);
      
      if (result.citations && result.citations.length > 0) {
        console.log(`   Citations: ${result.citations.length} sources`);
      }
      
      if (result.toolCalls && result.toolCalls.length > 0) {
        console.log(`   Tool calls: ${result.toolCalls.length} executions`);
      }
      
    } else {
      console.log('ALYGN Twitter Automation (with X Search)\n');
      console.log('Usage:');
      console.log('  bun twitter-automation.js list                    # List all prompts');
      console.log('  bun twitter-automation.js fetch <number>          # Fetch prompt text');
      console.log('  bun twitter-automation.js exec <number>           # Execute prompt');
      console.log('  bun twitter-automation.js exec <number> --search  # Execute with X Search (real tweets)');
      console.log('\nExamples:');
      console.log('  bun twitter-automation.js list');
      console.log('  bun twitter-automation.js exec 1');
      console.log('  bun twitter-automation.js exec 13 --search        # Trend monitoring with real tweets');
    }

  } catch (err) {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
  }
}

// Run if main module
if (import.meta.main) {
  main();
}

export { executePrompt, listPrompts, fetchPromptFromNotion };
