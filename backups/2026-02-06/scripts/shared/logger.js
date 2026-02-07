#!/usr/bin/env node
/**
 * Centralized Logging System for ALYGN Automation (IMPROVED)
 * 
 * Features:
 * - Write structured markdown logs locally
 * - Append to daily Notion log page (Organizations TODO Lists)
 * - Creates one page per day, appends all logs to it
 * - Handle errors gracefully
 * - Support different log levels and types
 */

const fs = require('fs').promises;
const path = require('path');
const https = require('https');
const { getNotionKey, getNotionPage } = require('./load-credentials');

const WORKSPACE = process.env.HOME + '/.openclaw/workspace';
const LOGS_DIR = path.join(WORKSPACE, 'logs');
const NOTION_API_KEY = getNotionKey();

// Cache daily Notion page IDs to avoid recreating
let dailyNotionPageCache = {};

/**
 * Log levels
 */
const LogLevel = {
  INFO: 'INFO',
  SUCCESS: 'SUCCESS',
  WARNING: '⚠️',
  ERROR: 'ERROR'
};

/**
 * Ensure logs directory exists
 */
async function ensureLogsDir() {
  const today = new Date().toISOString().split('T')[0];
  const todayDir = path.join(LOGS_DIR, today);
  await fs.mkdir(todayDir, { recursive: true });
  return todayDir;
}

/**
 * Format log entry as markdown
 */
function formatMarkdown(entry) {
  const timestamp = new Date().toISOString();
  const emoji = {
    INFO: 'ℹ️',
    SUCCESS: '✅',
    WARNING: '⚠️',
    ERROR: '❌'
  }[entry.level] || 'ℹ️';
  
  let md = `## ${emoji} ${entry.title}\n\n`;
  md += `**Time:** ${timestamp}\n`;
  md += `**Type:** ${entry.type}\n`;
  md += `**Level:** ${entry.level}\n\n`;
  
  if (entry.summary) {
    md += `### Summary\n${entry.summary}\n\n`;
  }
  
  if (entry.details) {
    md += `### Details\n`;
    if (typeof entry.details === 'string') {
      md += `${entry.details}\n\n`;
    } else {
      md += `\`\`\`json\n${JSON.stringify(entry.details, null, 2)}\n\`\`\`\n\n`;
    }
  }
  
  if (entry.actions && entry.actions.length > 0) {
    md += `### Next Actions\n`;
    entry.actions.forEach(action => {
      md += `- [ ] ${action}\n`;
    });
    md += '\n';
  }
  
  if (entry.error) {
    md += `### Error Details\n\`\`\`\n${entry.error}\n\`\`\`\n\n`;
  }
  
  md += `---\n\n`;
  return md;
}

/**
 * Convert markdown to Notion blocks
 */
function markdownToNotionBlocks(markdown) {
  const blocks = [];
  const lines = markdown.split('\n');
  
  let currentParagraph = [];
  
  for (let line of lines) {
    // Heading
    if (line.startsWith('## ')) {
      if (currentParagraph.length > 0) {
        blocks.push({
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [{ text: { content: currentParagraph.join('\n') } }]
          }
        });
        currentParagraph = [];
      }
      blocks.push({
        object: 'block',
        type: 'heading_2',
        heading_2: {
          rich_text: [{ text: { content: line.replace('## ', '') } }]
        }
      });
    }
    // Heading 3
    else if (line.startsWith('### ')) {
      if (currentParagraph.length > 0) {
        blocks.push({
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [{ text: { content: currentParagraph.join('\n') } }]
          }
        });
        currentParagraph = [];
      }
      blocks.push({
        object: 'block',
        type: 'heading_3',
        heading_3: {
          rich_text: [{ text: { content: line.replace('### ', '') } }]
        }
      });
    }
    // Code block start
    else if (line.startsWith('```')) {
      if (currentParagraph.length > 0) {
        blocks.push({
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [{ text: { content: currentParagraph.join('\n') } }]
          }
        });
        currentParagraph = [];
      }
      // Skip code block markers for now (Notion has limits)
    }
    // Divider
    else if (line.trim() === '---') {
      if (currentParagraph.length > 0) {
        blocks.push({
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [{ text: { content: currentParagraph.join('\n') } }]
          }
        });
        currentParagraph = [];
      }
      blocks.push({
        object: 'block',
        type: 'divider',
        divider: {}
      });
    }
    // Regular line
    else if (line.trim()) {
      currentParagraph.push(line);
    }
    // Empty line - flush paragraph
    else if (currentParagraph.length > 0) {
      blocks.push({
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [{ text: { content: currentParagraph.join('\n').substring(0, 2000) } }]
        }
      });
      currentParagraph = [];
    }
  }
  
  // Flush remaining
  if (currentParagraph.length > 0) {
    blocks.push({
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [{ text: { content: currentParagraph.join('\n').substring(0, 2000) } }]
      }
    });
  }
  
  return blocks.slice(0, 100); // Notion API limit: 100 blocks per request
}

/**
 * Write log to local file
 */
async function writeLocalLog(entry, markdown) {
  try {
    const todayDir = await ensureLogsDir();
    const filename = `${entry.type}.md`;
    const filepath = path.join(todayDir, filename);
    
    await fs.appendFile(filepath, markdown);
    return filepath;
  } catch (error) {
    console.error('Failed to write local log:', error.message);
    return null;
  }
}

/**
 * Get or create daily Notion log page
 */
async function getDailyNotionPage(parentPageId) {
  const today = new Date().toISOString().split('T')[0];
  const cacheKey = `${parentPageId}-${today}`;
  
  // Check cache
  if (dailyNotionPageCache[cacheKey]) {
    return dailyNotionPageCache[cacheKey];
  }
  
  // Search for existing page
  try {
    const searchResults = await notionRequest('POST', '/v1/search', {
      query: `Automation Logs ${today}`,
      filter: { property: 'object', value: 'page' }
    });
    
    // Check if page exists
    for (const page of searchResults.results) {
      const title = page.properties?.title?.title?.[0]?.text?.content || '';
      if (title === `Automation Logs ${today}`) {
        dailyNotionPageCache[cacheKey] = page.id;
        return page.id;
      }
    }
  } catch (err) {
    console.error('Search failed:', err.message);
  }
  
  // Create new page
  try {
    const newPage = await notionRequest('POST', '/v1/pages', {
      parent: { page_id: parentPageId },
      properties: {
        title: {
          title: [{ text: { content: `Automation Logs ${today}` } }]
        }
      }
    });
    
    dailyNotionPageCache[cacheKey] = newPage.id;
    return newPage.id;
  } catch (err) {
    console.error('Failed to create daily page:', err.message);
    return null;
  }
}

/**
 * Append log to Notion page
 */
async function appendToNotion(entry, markdown) {
  if (!entry.notionParent) {
    return null; // Skip if no parent specified
  }
  
  try {
    const parentPageId = getNotionPage(entry.notionParent);
    if (!parentPageId) {
      throw new Error(`Unknown Notion parent: ${entry.notionParent}`);
    }
    
    // Get or create daily log page
    const dailyPageId = await getDailyNotionPage(parentPageId);
    if (!dailyPageId) {
      throw new Error('Failed to get/create daily log page');
    }
    
    // Convert markdown to Notion blocks
    const blocks = markdownToNotionBlocks(markdown);
    
    // Append blocks to page
    await notionRequest('PATCH', `/v1/blocks/${dailyPageId}/children`, {
      children: blocks
    });
    
    return dailyPageId;
  } catch (error) {
    console.error('Failed to append to Notion:', error.message);
    return null;
  }
}

/**
 * Make Notion API request
 */
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
 * Main logging function
 * 
 * @param {Object} entry - Log entry
 * @param {string} entry.type - Type of log (e.g., 'twitter-automation', 'daily-tracker')
 * @param {string} entry.title - Log title
 * @param {string} entry.level - Log level (INFO, SUCCESS, WARNING, ERROR)
 * @param {string} [entry.summary] - Brief summary
 * @param {string|Object} [entry.details] - Detailed information
 * @param {string[]} [entry.actions] - Next actions to take
 * @param {string} [entry.error] - Error details (for ERROR level)
 * @param {string} [entry.notionParent] - Notion parent page key (e.g., 'organizations_todos')
 * @returns {Promise<Object>} Result with local and Notion paths
 */
async function log(entry) {
  // Validate required fields
  if (!entry.type || !entry.title) {
    throw new Error('Log entry must have type and title');
  }
  
  // Set default level
  if (!entry.level) {
    entry.level = LogLevel.INFO;
  }
  
  // Format as markdown
  const markdown = formatMarkdown(entry);
  
  // Write locally
  const localPath = await writeLocalLog(entry, markdown);
  
  // Append to Notion (if parent specified)
  const notionPageId = entry.notionParent 
    ? await appendToNotion(entry, markdown)
    : null;
  
  // Also output to console for immediate feedback
  console.log(markdown);
  
  return {
    success: true,
    localPath,
    notionPageId,
    markdown
  };
}

/**
 * Convenience methods
 */
async function info(type, title, details) {
  return log({ type, title, level: LogLevel.INFO, details });
}

async function success(type, title, summary, details) {
  return log({ type, title, level: LogLevel.SUCCESS, summary, details, notionParent: 'organizations_todos' });
}

async function warning(type, title, summary, details) {
  return log({ type, title, level: LogLevel.WARNING, summary, details, notionParent: 'organizations_todos' });
}

async function error(type, title, errorDetails) {
  return log({ 
    type, 
    title, 
    level: LogLevel.ERROR, 
    error: errorDetails instanceof Error ? errorDetails.stack : errorDetails,
    notionParent: 'organizations_todos'
  });
}

module.exports = {
  log,
  info,
  success,
  warning,
  error,
  LogLevel
};

// CLI usage
if (require.main === module) {
  const testEntry = {
    type: 'test',
    title: 'Test Log Entry',
    level: LogLevel.SUCCESS,
    summary: 'This is a test of the centralized logging system',
    details: {
      tested: true,
      features: ['local files', 'markdown format', 'notion integration', 'daily pages', 'append to page']
    },
    actions: ['Review log output', 'Verify file created', 'Check Notion page'],
    notionParent: 'organizations_todos'
  };
  
  log(testEntry)
    .then(result => {
      console.log('\n✅ Test log created:');
      console.log('  Local:', result.localPath);
      console.log('  Notion:', result.notionPageId || 'N/A');
    })
    .catch(err => {
      console.error('❌ Test failed:', err.message);
      process.exit(1);
    });
}
