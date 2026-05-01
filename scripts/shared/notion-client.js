/**
 * Shared Notion SDK Client
 * Wraps @notionhq/client for use across all automation scripts.
 */

import { Client } from '@notionhq/client';
import { getNotionKey } from './load-credentials.js';

/**
 * Create an authenticated Notion SDK client.
 * @param {string} [notionKey] - Optional API key override; falls back to credentials.json
 */
export function getClient(notionKey) {
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
export async function listBlocks(notion, blockId, pageSize = 100, startCursor = null) {
  const params = { block_id: blockId, page_size: pageSize };
  if (startCursor) params.start_cursor = startCursor;
  return notion.blocks.children.list(params);
}

/**
 * Recursively fetch all blocks (handles pagination automatically)
 * @param {Client} notion - Notion client
 * @param {string} blockId - Parent block ID
 * @param {number} pageSize - Page size (default: 100)
 */
export async function listAllBlocks(notion, blockId, pageSize = 100) {
  const allBlocks = [];
  let cursor = null;
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
export async function findBlockByPattern(notion, blockId, pattern, pageSize = 100) {
  const allBlocks = await listAllBlocks(notion, blockId, pageSize);
  for (const block of allBlocks) {
    if (block.type === 'paragraph') {
      const text = block.paragraph.rich_text.map(rt => rt.text.content).join('');
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
export async function getParagraphBlocks(notion, blockId, pageSize = 100) {
  const allBlocks = await listAllBlocks(notion, blockId, pageSize);
  return allBlocks.filter(b => b.type === 'paragraph');
}

/**
 * Query a Notion database (supports both traditional databases and data sources)
 * @param {Client} notion - Notion client
 * @param {string} databaseId - Database/Data Source ID
 * @param {Object} body - Query parameters (filter, sorts, page_size, etc.)
 */
export async function queryDatabase(notion, databaseId, body) {
  // Try databases.query first (standard Notion API for database queries)
  try {
    return await notion.databases.query({
      database_id: databaseId,
      ...body
    });
  } catch (dbError) {
    // If databases.query fails, try dataSources.query as fallback
    if (notion.dataSources?.query) {
      try {
        return await notion.dataSources.query({
          data_source_id: databaseId,
          ...body
        });
      } catch (dsError) {
        console.error('❌ Both Notion query methods failed:');
        console.error('   databases.query:', dbError.message);
        console.error('   dataSources.query:', dsError.message);
        throw dsError;
      }
    }
    throw dbError;
  }
}

export async function updatePage(notion, pageId, properties) {
  return notion.pages.update({ page_id: pageId, properties });
}

export async function retrievePage(notion, pageId) {
  return notion.pages.retrieve({ page_id: pageId });
}

export async function createPage(notion, parentPageId, title) {
  return notion.pages.create({
    parent: { page_id: parentPageId },
    properties: {
      title: { title: [{ text: { content: title } }] },
    },
  });
}

export async function appendBlocks(notion, blockId, children) {
  return notion.blocks.children.append({ block_id: blockId, children });
}

export async function searchPages(notion, query, filter) {
  const params = { query };
  if (filter) params.filter = filter;
  return notion.search(params);
}
