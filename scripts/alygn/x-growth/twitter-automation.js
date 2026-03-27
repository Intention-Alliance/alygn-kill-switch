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

import { xai } from '@ai-sdk/xai';
import { generateText } from 'ai';
import fs from 'fs/promises';
import path from 'path';
import { getGrokKey, getGrokModel, getNotionKey, getNotionPage } from '../../shared/load-credentials.js';
import { error, log, LogLevel, success } from '../../shared/logger.js';
import { findBlockByPattern, getClient, listBlocks } from '../../shared/notion-client.js';
import { injectDynamicValues, previewInjections } from '../lib/dynamic-injector.js';

const GROK_API_KEY = getGrokKey();
const GROK_MODEL = getGrokModel();
const TWITTER_PROMPTS_PAGE_ID = getNotionPage('twitter_prompts');
const notion = getClient(getNotionKey());

/**
 * Validate URL by making HTTP HEAD request
 * Returns true if URL is valid (200 OK), false otherwise
 */
async function validateUrl(url) {
  try {
    if (!url || !url.startsWith('http')) {
      return false;
    }
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow'
    });
    
    clearTimeout(timeout);
    return response.status === 200;
  } catch (err) {
    console.log(`⚠️  URL validation failed for ${url?.substring(0, 50)}...: ${err.message}`);
    return false;
  }
}

// Configure xAI with API key
process.env.XAI_API_KEY = GROK_API_KEY;

/**
 * Enhanced Grok Request with Search Support using @ai-sdk/xai
 */
async function grokRequest(prompt, useSearch = false, timeoutMs = 300000) {
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

  // Add timeout to prevent silent hangs
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`Grok API timeout after ${timeoutMs/1000}s`)), timeoutMs);
  });

  const generatePromise = generateText(requestConfig);

  const { text, sources, usage } = await Promise.race([
    generatePromise,
    timeoutPromise
  ]);

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
 * Fetch prompt from Notion using optimized pattern search
 */
async function fetchPromptFromNotion(promptNumber) {
  const promptBlock = await findBlockByPattern(notion, TWITTER_PROMPTS_PAGE_ID, `[Prompt #${promptNumber}]`);
  
  if (!promptBlock) {
    throw new Error(`Prompt #${promptNumber} not found`);
  }
  
  const text = promptBlock.text;
  const titleMatch = text.match(/\[Prompt #\d+\]\s*(.+?):/);
  const title = titleMatch?.[1]?.trim() || 'Untitled';
  const colonIndex = text.indexOf(':');
  const content = colonIndex > 0 ? text.substring(colonIndex + 1).trim() : '';
  
  return {
    number: promptNumber,
    title,
    text: content
  };
}

/**
 * List all prompts
 */
async function listPrompts() {
  const response = await listBlocks(notion, TWITTER_PROMPTS_PAGE_ID);
  const prompts = [];

  for (const block of response.results) {
    if (block.type === 'paragraph') {
      const text = block.paragraph.rich_text.map(rt => rt.text.content).join('');
      // Match prompt title and extract preview (handle multi-line content)
      const titleMatch = text.match(/\[Prompt #(\d+)\]\s*(.+?):/);
      
      if (titleMatch) {
        // Extract first 80 chars after the colon as preview
        const colonIndex = text.indexOf(':');
        const preview = colonIndex > 0 ? text.substring(colonIndex + 1, colonIndex + 81).trim() + '...' : '...';
        
        prompts.push({
          number: parseInt(titleMatch[1]),
          title: titleMatch[2].trim(),
          preview
        });
      }
    }
  }

  return prompts.sort((a, b) => a.number - b.number);
}

/**
 * Execute prompt with Grok
 */
async function executePrompt(promptNumber, useSearch = false, skipInjection = false) {
  try {
    // Fetch prompt
    const prompt = await fetchPromptFromNotion(promptNumber);
    
    // Dynamic value injection (unless skipped or prompt #13 which generates source data)
    let finalPromptText = prompt.text;
    let injectionResult = null;
    
    if (!skipInjection && promptNumber !== 13) {
      console.log('💉 Injecting dynamic values...');
      injectionResult = await injectDynamicValues(prompt.text);
      finalPromptText = injectionResult.prompt;
      console.log(`   ✅ ${injectionResult.injectionsMade} injections made`);
      if (injectionResult.remainingPlaceholders.length > 0) {
        console.log(`   ⚠️  ${injectionResult.remainingPlaceholders.length} placeholders remain`);
      }
    }
    
    await log({
      type: 'twitter-automation',
      title: `Executing Prompt #${promptNumber}: ${prompt.title}`,
      level: LogLevel.INFO,
      summary: `Fetching response from Grok${useSearch ? ' (with search enabled)' : ''}${injectionResult ? ` (${injectionResult.injectionsMade} injections)` : ''}`,
      details: { 
        originalPrompt: prompt.text, 
        injectedPrompt: finalPromptText,
        useSearch,
        injectionsMade: injectionResult?.injectionsMade || 0
      },
      notionParent: 'organizations_todos'
    });

    // Execute with Grok (using injected prompt)
    const response = await grokRequest(finalPromptText, useSearch);
    
    // Format response as markdown
    let outputMd = `# Twitter Automation - Prompt #${promptNumber}\n\n`;
    outputMd += `## ${prompt.title}\n\n`;
    outputMd += `**Executed:** ${new Date().toISOString()}\n`;
    outputMd += `**Model:** ${response.model}\n`;
    outputMd += `**Search Enabled:** ${useSearch ? 'Yes' : 'No'}\n`;
    outputMd += `**Dynamic Injection:** ${injectionResult ? `${injectionResult.injectionsMade} values injected` : 'Skipped'}\n\n`;
    
    if (injectionResult && injectionResult.injectionsMade > 0) {
      outputMd += `### 💉 Injected Data\n\n`;
      outputMd += `- **Trends:** ${injectionResult.data.TRENDING_TOPICS?.substring(0, 100)}...\n`;
      outputMd += `- **Audience:** ${injectionResult.data.TARGET_AUDIENCE}\n`;
      outputMd += `- **Data Freshness:** ${injectionResult.data.DATA_FRESHNESS}\n\n`;
    }
    
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

    // Generate workflow JSON for x-api-executor (only for Prompts #1 and #13)
    if ([1, 13].includes(promptNumber) && response.content.includes('<responses>')) {
      const { extractTag } = await import('./parser/twitter-content-parser.js');
      
      // Use local validateUrl function (defined at top of file)
      
      const contentBlocks = extractTag(response.content, 'content');
      const posts = [];
      let validUrlCount = 0;
      let invalidUrlCount = 0;
      
      for (let idx = 0; idx < contentBlocks.length; idx++) {
        const block = contentBlocks[idx];
        const texts = extractTag(block, 'text');
        const angles = extractTag(block, 'governance_angle');
        const sourcesBlocks = extractTag(block, 'sources');
        const text = texts[0] || '';
        const angle = angles[0] || '';
        const sources = sourcesBlocks.length > 0 ? extractTag(sourcesBlocks[0], 'url') : [];
        const sourceUrl = sources[0] || null;
        
        // Validate source URL before adding post
        const isUrlValid = sourceUrl ? await validateUrl(sourceUrl) : false;
        
        if (!isUrlValid && sourceUrl) {
          console.log(`❌ Skipping post ${idx + 1}: Invalid URL ${sourceUrl.substring(0, 50)}...`);
          invalidUrlCount++;
          continue; // Skip this post
        }
        
        if (isUrlValid) {
          validUrlCount++;
        }
        
        // Each <content> block = THREAD PAIR (main + reply)
        const mainText = text.trim();
        const replyText = angle.trim();
        
        // Validate lengths
        const issues = [];
        if (mainText.length > 280) issues.push('Main exceeds 280 chars');
        if (replyText.length > 280) issues.push('Reply exceeds 280 chars');
        
        posts.push({
          id: posts.length + 1, // Sequential ID after filtering
          mainText: mainText,
          replyText: replyText,
          sourceUrl: sourceUrl,
          isThread: true,
          mainLength: mainText.length,
          replyLength: replyText.length,
          status: issues.length === 0 ? 'ready' : 'blocked',
          tweetId: null,
          url: null,
          issues
        });
      }
      
      console.log(`✅ Workflow generated: ${posts.length} posts (${validUrlCount} valid URLs, ${invalidUrlCount} invalid URLs skipped)`);
      
      const workflow = {
        generatedAt: new Date().toISOString(),
        source: `Grok Search - Prompt #${promptNumber}`,
        totalPosts: posts.length,
        totalThreads: posts.filter(p => p.isThread).length,
        validUrls: validUrlCount,
        invalidUrls: invalidUrlCount,
        postedAt: null,
        posts,
        executed: 0,
        failed: 0
      };
      
      // Save workflow JSON
      const workflowDir = path.join(process.env.HOME, '.openclaw/workspace/twitter-outputs/alygn/workflows');
      await fs.mkdir(workflowDir, { recursive: true });
      const workflowFile = `workflow-${Date.now()}.json`;
      await fs.writeFile(path.join(workflowDir, workflowFile), JSON.stringify(workflow, null, 2));
      
      // Update latest.json symlink
      await fs.writeFile(path.join(workflowDir, 'latest.json'), JSON.stringify(workflow, null, 2));
      
      console.log(`✅ Workflow generated: ${posts.length} thread pairs ready for execution`);
    }

    return {
      success: true,
      prompt,
      response: response.content,
      searchResults: response.searchResults,
      outputFile: filename,
      workflowFile: [1, 13].includes(promptNumber) && response.content.includes('<responses>') ? 'generated' : null
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
      process.exit(0);
      
    } else if (command === 'fetch' && arg) {
      const promptNumber = parseInt(arg);
      const prompt = await fetchPromptFromNotion(promptNumber);
      
      console.log(`\n📖 Prompt #${promptNumber}: ${prompt.title}\n`);
      console.log(`Full text:\n"${prompt.text}"\n`);
      process.exit(0);
      
    } else if (command === 'preview' && arg) {
      // Preview injection without executing
      const promptNumber = parseInt(arg);
      console.log(`\n🔍 Previewing injection for Prompt #${promptNumber}...\n`);
      
      const prompt = await fetchPromptFromNotion(promptNumber);
      await previewInjections(prompt.text);
      process.exit(0);
      
    } else if (command === 'exec' && arg) {
      const promptNumber = parseInt(arg);
      const useSearch = process.argv.includes('--search');
      const skipInjection = process.argv.includes('--no-inject');
      
      console.log(`\n🚀 Executing Prompt #${promptNumber}${useSearch ? ' (with search)' : ''}${skipInjection ? ' (no injection)' : ' (with dynamic injection)'}...\n`);
      
      const result = await executePrompt(promptNumber, useSearch, skipInjection);
      
      console.log('\n✅ Execution complete!');
      console.log(`   Output saved: ${result.outputFile}`);
      console.log(`   Response length: ${result.response.length} chars`);
      
      if (result.searchResults) {
        console.log(`   Search results: ${result.searchResults.length} items`);
      }
      process.exit(0);
      
    } else {
      console.log('ALYGN Twitter Automation v2 (with Dynamic Injection)\n');
      console.log('Usage:');
      console.log('  bun twitter-automation-v2.js list                       # List all prompts');
      console.log('  bun twitter-automation-v2.js fetch <number>             # Fetch prompt text');
      console.log('  bun twitter-automation-v2.js preview <number>           # Preview dynamic injection');
      console.log('  bun twitter-automation-v2.js exec <number>              # Execute with injection');
      console.log('  bun twitter-automation-v2.js exec <number> --search     # Execute with Grok search');
      console.log('  bun twitter-automation-v2.js exec <number> --no-inject  # Execute without injection');
      console.log('\nDynamic Injection:');
      console.log('  Prompts with [PLACEHOLDER] patterns are auto-filled with real data:');
      console.log('  - [TRENDING_TOPICS] → Latest topics from Prompt #13 output');
      console.log('  - [TARGET_AUDIENCE] → Rotates: researchers, entrepreneurs, policy, enthusiasts');
      console.log('  - [ANALYTICS_DATA]  → Latest metrics from Prompt #17 output');
      console.log('  - [topic], [brief explanation] → Replaced with trending topic context');
      console.log('\nExamples:');
      console.log('  bun twitter-automation-v2.js preview 15               # See what gets injected');
      console.log('  bun twitter-automation-v2.js exec 1                   # Thread ideas with real trends');
      console.log('  bun twitter-automation-v2.js exec 13 --search         # Trend monitoring (source data)');
      console.log('  bun twitter-automation-v2.js exec 15                  # Reply templates with real topics');
      process.exit(0);
    }

  } catch (err) {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
  }
}

// Run if called directly
if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  main();
}

export { executePrompt, fetchPromptFromNotion, listPrompts };

