#!/usr/bin/env node

/**
 * Fetch Intention Alliance NDA from Notion
 */

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

async function searchForNDA() {
  console.log("🔍 Searching for NDA in Intention Alliance hub...\n");
  
  // Search for NDA document
  const searchResult = await notionRequest("search", "POST", {
    query: "NDA",
    filter: {
      property: "object",
      value: "page"
    }
  });
  
  console.log(`Found ${searchResult.results.length} pages matching "NDA"`);
  
  // Also check blocks in IA Hub page
  const blocks = await notionRequest(`blocks/${IA_HUB_PAGE_ID}/children?page_size=100`);
  
  let ndaPageId = null;
  let ndaTitle = null;
  
  for (const block of blocks.results) {
    if (block.type === 'child_page') {
      const title = block.child_page.title.toLowerCase();
      if (title.includes('nda') || title.includes('non-disclosure')) {
        ndaPageId = block.id;
        ndaTitle = block.child_page.title;
        break;
      }
    }
  }
  
  if (!ndaPageId) {
    // Check search results
    for (const page of searchResult.results) {
      const title = page.properties?.title?.title?.[0]?.text?.content || '';
      if (title.toLowerCase().includes('intention') || title.toLowerCase().includes('alliance')) {
        ndaPageId = page.id;
        ndaTitle = title;
        break;
      }
    }
  }
  
  if (!ndaPageId) {
    console.error("❌ NDA document not found in Notion");
    console.log("\nSearch results:");
    for (const page of searchResult.results) {
      const title = page.properties?.title?.title?.[0]?.text?.content || 'Untitled';
      console.log(`  - ${title} (${page.id})`);
    }
    process.exit(1);
  }
  
  console.log(`✅ Found NDA: "${ndaTitle}"`);
  console.log(`   Page ID: ${ndaPageId}\n`);
  
  // Fetch NDA content
  const ndaBlocks = await notionRequest(`blocks/${ndaPageId}/children?page_size=100`);
  
  let ndaContent = `# Intention Alliance - NDA\n\n`;
  ndaContent += `**Source:** Notion (Intention Alliance Hub)\n`;
  ndaContent += `**Document:** ${ndaTitle}\n\n`;
  ndaContent += `---\n\n`;
  
  for (const block of ndaBlocks.results) {
    if (block.type === 'paragraph') {
      const text = block.paragraph.rich_text.map(rt => rt.text.content).join('');
      if (text.trim()) ndaContent += text + '\n\n';
    } else if (block.type === 'heading_1') {
      const text = block.heading_1.rich_text.map(rt => rt.text.content).join('');
      ndaContent += `# ${text}\n\n`;
    } else if (block.type === 'heading_2') {
      const text = block.heading_2.rich_text.map(rt => rt.text.content).join('');
      ndaContent += `## ${text}\n\n`;
    } else if (block.type === 'heading_3') {
      const text = block.heading_3.rich_text.map(rt => rt.text.content).join('');
      ndaContent += `### ${text}\n\n`;
    } else if (block.type === 'bulleted_list_item') {
      const text = block.bulleted_list_item.rich_text.map(rt => rt.text.content).join('');
      ndaContent += `- ${text}\n`;
    } else if (block.type === 'numbered_list_item') {
      const text = block.numbered_list_item.rich_text.map(rt => rt.text.content).join('');
      ndaContent += `1. ${text}\n`;
    } else if (block.type === 'callout') {
      const text = block.callout.rich_text.map(rt => rt.text.content).join('');
      const emoji = block.callout.icon?.emoji || '📌';
      ndaContent += `${emoji} **Note:** ${text}\n\n`;
    }
  }
  
  return { ndaPageId, ndaTitle, ndaContent };
}

searchForNDA()
  .then(({ ndaContent }) => {
    console.log("📄 NDA Content:\n");
    console.log(ndaContent);
  })
  .catch(err => {
    console.error("❌ Error:", err.message);
    process.exit(1);
  });
