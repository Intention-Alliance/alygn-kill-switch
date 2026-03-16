
import { getClient, listBlocks } from '../shared/notion-client.js';

const IA_HUB_PAGE_ID = "2f9334874af6819fa5c5f32ae95088f1";
const notion = getClient();

async function listPages() {
  console.log("📋 Listing all pages in Alygn Hub...\n");
  
  const blocks = await listBlocks(notion, IA_HUB_PAGE_ID);
  
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
