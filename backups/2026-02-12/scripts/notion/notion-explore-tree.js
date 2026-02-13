#!/usr/bin/env node

const { Client } = require('@notionhq/client');

const notion = new Client({ auth: process.env.NOTION_API_KEY });

async function getAllChildren(blockId, depth = 0) {
  try {
    const response = await notion.blocks.children.list({
      block_id: blockId,
      page_size: 100
    });

    for (const block of response.results) {
      const indent = '  '.repeat(depth);
      
      if (block.type === 'child_page') {
        console.log(`${indent}📄 ${block.child_page.title}`);
        console.log(`${indent}   ID: ${block.id}`);
      } else if (block.type === 'child_database') {
        console.log(`${indent}🗃️  ${block.child_database.title}`);
        console.log(`${indent}   ID: ${block.id}`);
      } else {
        console.log(`${indent}• ${block.type}`);
      }
      
      if (block.has_children && depth < 2) {
        await getAllChildren(block.id, depth + 1);
      }
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

const pageId = process.argv[2] || '26a33487-4af6-81a8-b01c-fd1a8a5f8bcb';
console.log('🔍 Exploring page structure...\n');
getAllChildren(pageId);
