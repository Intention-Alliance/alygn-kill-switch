#!/usr/bin/env node

const fs = require('fs').promises;

const NOTION_KEY = "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";
const NOTION_VERSION = "2022-06-28";
const NDA_PAGE_ID = "2fc334874af6801b948cf44183466fc4";

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

async function fetchNDA() {
  console.log("📄 Fetching NDA content from Notion...\n");
  
  const blocks = await notionRequest(`blocks/${NDA_PAGE_ID}/children?page_size=100`);
  
  let ndaContent = `# Intention Alliance - Non-Disclosure Agreement\n\n`;
  ndaContent += `**Source:** Notion (Administrative Info → Non-Disclosure Agreement)\n`;
  ndaContent += `**Page ID:** ${NDA_PAGE_ID}\n`;
  ndaContent += `**Retrieved:** ${new Date().toISOString()}\n\n`;
  ndaContent += `---\n\n`;
  
  for (const block of blocks.results) {
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
    } else if (block.type === 'quote') {
      const text = block.quote.rich_text.map(rt => rt.text.content).join('');
      ndaContent += `> ${text}\n\n`;
    } else if (block.type === 'divider') {
      ndaContent += `---\n\n`;
    } else if (block.type === 'file') {
      const url = block.file.url || block.file.external?.url || 'N/A';
      const caption = block.file.caption?.map(rt => rt.text.content).join('') || 'Attachment';
      ndaContent += `📎 **File:** [${caption}](${url})\n\n`;
    } else if (block.type === 'pdf') {
      const url = block.pdf.url || block.pdf.external?.url || 'N/A';
      ndaContent += `📕 **PDF Document:** ${url}\n\n`;
    }
  }
  
  // Save to file
  await fs.writeFile('intention-alliance/NDA.md', ndaContent);
  console.log("✅ NDA content saved to: intention-alliance/NDA.md\n");
  
  console.log(ndaContent);
  
  return ndaContent;
}

fetchNDA().catch(console.error);
