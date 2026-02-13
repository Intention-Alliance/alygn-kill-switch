#!/usr/bin/env node

const NOTION_KEY = "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";
const NOTION_VERSION = "2022-06-28";
const ADMIN_PAGE_ID = "2f9334874af6817d88e8c2cfe62c4499"; // Administrative Info

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

async function checkAdminPage() {
  console.log("🔍 Checking Administrative Info page for NDA...\n");
  
  const blocks = await notionRequest(`blocks/${ADMIN_PAGE_ID}/children?page_size=100`);
  
  console.log(`Found ${blocks.results.length} blocks\n`);
  
  for (const block of blocks.results) {
    if (block.type === 'child_page') {
      console.log(`📄 ${block.child_page.title}`);
      console.log(`   ID: ${block.id}\n`);
    } else if (block.type === 'file') {
      console.log(`📎 File attachment`);
      console.log(`   URL: ${block.file.url || block.file.external?.url}\n`);
    } else if (block.type === 'pdf') {
      console.log(`📕 PDF attachment`);
      console.log(`   URL: ${block.pdf.url || block.pdf.external?.url}\n`);
    } else if (block.type === 'heading_1' || block.type === 'heading_2' || block.type === 'heading_3') {
      const text = block[block.type].rich_text.map(rt => rt.text.content).join('');
      console.log(`📌 ${block.type}: ${text}`);
    } else if (block.type === 'paragraph') {
      const text = block.paragraph.rich_text.map(rt => rt.text.content).join('');
      if (text.toLowerCase().includes('nda') || text.toLowerCase().includes('non-disclosure')) {
        console.log(`🔴 FOUND NDA MENTION: ${text}\n`);
      }
    }
  }
}

checkAdminPage().catch(console.error);
