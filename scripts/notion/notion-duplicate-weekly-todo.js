
import { Client } from "@notionhq/client";

const notion = new Client({ auth: process.env.NOTION_API_KEY });

async function duplicateWeeklyTodoBlock() {
  try {
    // Get the Organizations TODO Lists page
    const parentPageId = '26a33487-4af6-81a8-b01c-fd1a8a5f8bcb';
    
    console.log('🔍 Finding synced blocks...\n');
    
    const response = await notion.blocks.children.list({
      block_id: parentPageId,
      page_size: 100
    });

    // Find the most recent synced_block (should be the template)
    const syncedBlocks = response.results.filter(b => b.type === 'synced_block');
    
    console.log(`Found ${syncedBlocks.length} synced blocks\n`);
    
    if (syncedBlocks.length === 0) {
      console.error('No synced blocks found!');
      return;
    }

    // Get the first synced_block (template)
    const templateBlock = syncedBlocks[0];
    console.log(`Template block ID: ${templateBlock.id}`);
    
    // Get children of the synced block
    const children = await notion.blocks.children.list({
      block_id: templateBlock.id
    });
    
    console.log(`\nTemplate has ${children.results.length} children:\n`);
    children.results.forEach((child, i) => {
      console.log(`${i + 1}. ${child.type}`);
      if (child.type === 'heading_1' && child.heading_1?.rich_text?.[0]) {
        console.log(`   Text: ${child.heading_1.rich_text[0].plain_text}`);
      }
      if (child.type === 'heading_2' && child.heading_2?.rich_text?.[0]) {
        console.log(`   Text: ${child.heading_2.rich_text[0].plain_text}`);
      }
    });
    
    console.log('\n📋 To duplicate this block via Notion UI:');
    console.log('1. Right-click the synced block');
    console.log('2. Select "Duplicate"');
    console.log('3. Edit the title to: "February 2nd - February 6th, 2026"');
    console.log('4. Add ALYGN tasks inside');
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

duplicateWeeklyTodoBlock();
