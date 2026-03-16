
import { getClient, listBlocks } from '../shared/notion-client.js';

const ADMIN_PAGE_ID = "2f9334874af6817d88e8c2cfe62c4499"; // Administrative Info
const notion = getClient();

async function checkAdminPage() {
  console.log("🔍 Checking Administrative Info page for NDA...\n");
  
  const blocks = await listBlocks(notion, ADMIN_PAGE_ID);
  
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
