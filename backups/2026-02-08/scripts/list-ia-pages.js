#!/usr/bin/env node

const NOTION_KEY = "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";
const NOTION_VERSION = "2022-06-28";
const IA_HUB_PAGE_ID = "2f9334874af6819fa5c5f32ae95088f1";

async function notionRequest(endpoint, method = "GET", body = null) {
  const url = `https://api.notion.com/v1/${endpoint}`;
  const options = {
    method,
    headers: {
      "Authorization": `Bearer ${NOTION_KEY}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json"
    }
  };
  if (body) options.body = JSON.stringify(body);
  
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`Notion API error: ${res.status} ${await res.text()}`);
  return res.json();
}

async function listPages() {
  console.log("📋 Listing all pages in Intention Alliance Hub...\n");
  
  const blocks = await notionRequest(`blocks/${IA_HUB_PAGE_ID}/children?page_size=100`);
  
  console.log(`Found ${blocks.results.length} blocks\n`);
  
  for (const block of blocks.results) {
    if (block.type === 'child_page') {
      console.log(`📄 ${block.child_page.title}`);
      console.log(`   ID: ${block.id}`);
      console.log(`   Type: ${block.type}`);
      console.log();
    } else {
      console.log(`📌 ${block.type}`);
    }
  }
}

listPages().catch(console.error);
