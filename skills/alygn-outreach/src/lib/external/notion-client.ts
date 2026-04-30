/**
 * Shared Notion SDK Client
 * Self-contained version for alygn-outreach skill
 * Wraps @notionhq/client for use across all automation scripts.
 */
import { Client } from '@notionhq/client';
import fs from 'fs';
import path from 'path';

/**
 * Get Notion API key from config or environment
 */
function getNotionKey(): string {
  // First check environment variable
  if (process.env.NOTION_API_KEY) {
    return process.env.NOTION_API_KEY;
  }
  
  // Then check config file in skill's config directory
  const configPath = path.resolve(__dirname, '../../../config/notion-config.json');
  try {
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (config.notionApiKey) {
        return config.notionApiKey;
      }
    }
  } catch (e) {
    // Config not found or invalid
  }
  
  // Fall back to workspace credentials (legacy support)
  const legacyPath = path.resolve(process.env.HOME || '/home/andlersrv' , '.openclaw/workspace/config/credentials.json');
  try {
    if (fs.existsSync(legacyPath)) {
      const creds = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
      if (creds?.notion?.apiKey) {
        return creds.notion.apiKey;
      }
    }
  } catch (e) {
    // Legacy config not found
  }
  
  throw new Error('NOTION_API_KEY not found. Set NOTION_API_KEY env var or configure in config/notion-config.json');
}

/**
 * Create an authenticated Notion SDK client.
 * @param {string} [notionKey] - Optional API key override; falls back to credentials.json
 */
export function getClient(notionKey?: string) {
  const key = notionKey || getNotionKey();
  return new Client({ auth: key });
}

/**
 * List blocks with optional cursor pagination
 * @param {Client} notion - Notion client
 * @param {string} blockId - Parent block ID
 * @param {number} pageSize - Page size (default: 100)
 * @param {string|null} startCursor - Optional cursor for pagination
 */
export async function listBlocks(notion: Client, blockId: string, pageSize = 100, startCursor: string | null = null) {
  const params: { block_id: string; page_size: number; start_cursor?: string } = { block_id: blockId, page_size: pageSize };
  if (startCursor) params.start_cursor = startCursor;
  return notion.blocks.children.list(params);
}

/**
 * Recursively fetch all blocks (handles pagination automatically)
 * @param {Client} notion - Notion client
 * @param {string} blockId - Parent block ID
 * @param {number} pageSize - Page size (default: 100)
 */
export async function listAllBlocks(notion: Client, blockId: string, pageSize = 100) {
  const allBlocks = [];
  let cursor: string | null = null;
  do {
    const response = await listBlocks(notion, blockId, pageSize, cursor);
    allBlocks.push(...response.results);
    cursor = response.next_cursor;
  } while (cursor);
  return allBlocks;
}

/**
 * Find a block by text pattern (e.g., "[Prompt #1]")
 * @param {Client} notion - Notion client
 * @param {string} blockId - Parent block ID
 * @param {string} pattern - Text pattern to match
 * @param {number} pageSize - Page size (default: 100)
 * @returns {Object|null} - { block, text } or null if not found
 */
export async function findBlockByPattern(notion: Client, blockId: string, pattern: string, pageSize = 100) {
  const allBlocks = await listAllBlocks(notion, blockId, pageSize);
  for (const block of allBlocks) {
    if (block.type === 'paragraph') {
      const text = (block.paragraph as { rich_text: Array<{ text: { content: string } }> }).rich_text.map(rt => rt.text.content).join('');
      if (text.includes(pattern)) {
        return { block, text };
      }
    }
  }
  return null;
}

/**
 * Get only paragraph blocks (filter by type)
 * @param {Client} notion - Notion client
 * @param {string} blockId - Parent block ID
 * @param {number} pageSize - Page size (default: 100)
 */
export async function getParagraphBlocks(notion: Client, blockId: string, pageSize = 100) {
  const allBlocks = await listAllBlocks(notion, blockId, pageSize);
  return allBlocks.filter(b => b.type === 'paragraph');
}

/**
 * Query a Notion database
 * @param {Client} notion - Notion client
 * @param {string} databaseId - Database ID
 * @param {Object} body - Query parameters (filter, sorts, page_size, etc.)
 */
export async function queryDatabase(notion: Client, databaseId: string, body: Record<string, unknown>) {
  try {
    // Use databases.query API for standard Notion databases
    return await notion.databases.query({
      database_id: databaseId,
      ...body
    });
  } catch (error) {
    console.error('❌ Notion query failed:', (error as Error).message);
    throw error;
  }
}

export async function updatePage(notion: Client, pageId: string, properties: Record<string, unknown>) {
  return notion.pages.update({ page_id: pageId, properties });
}

export async function retrievePage(notion: Client, pageId: string) {
  return notion.pages.retrieve({ page_id: pageId });
}

export async function createPage(notion: Client, parentPageId: string, title: string) {
  return notion.pages.create({
    parent: { page_id: parentPageId },
    properties: {
      title: { title: [{ text: { content: title } }] },
    },
  });
}

export async function appendBlocks(notion: Client, blockId: string, children: unknown[]) {
  return notion.blocks.children.append({ block_id: blockId, children });
}

export async function searchPages(notion: Client, query: string, filter?: Record<string, unknown>) {
  const params: { query: string; filter?: Record<string, unknown> } = { query };
  if (filter) params.filter = filter;
  return notion.search(params);
}

export default {
  getClient,
  listBlocks,
  listAllBlocks,
  findBlockByPattern,
  getParagraphBlocks,
  queryDatabase,
  updatePage,
  retrievePage,
  createPage,
  appendBlocks,
  searchPages
};
