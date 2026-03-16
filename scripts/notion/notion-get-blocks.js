
import { Client } from "@notionhq/client";

const notion = new Client({ auth: process.env.NOTION_API_KEY });

async function getPageBlocks(pageId) {
  try {
    console.log('📄 Getting page blocks...\n');
    
    const response = await notion.blocks.children.list({
      block_id: pageId,
      page_size: 100
    });

    console.log(`Found ${response.results.length} blocks:\n`);
    
    response.results.forEach((block, i) => {
      console.log(`${i + 1}. Type: ${block.type}`);
      console.log(`   ID: ${block.id}`);
      
      // Show content based on type
      if (block.type === 'paragraph' && block.paragraph.rich_text.length > 0) {
        console.log(`   Text: ${block.paragraph.rich_text[0].plain_text}`);
      } else if (block.type === 'heading_1' && block.heading_1.rich_text.length > 0) {
        console.log(`   H1: ${block.heading_1.rich_text[0].plain_text}`);
      } else if (block.type === 'heading_2' && block.heading_2.rich_text.length > 0) {
        console.log(`   H2: ${block.heading_2.rich_text[0].plain_text}`);
      } else if (block.type === 'heading_3' && block.heading_3.rich_text.length > 0) {
        console.log(`   H3: ${block.heading_3.rich_text[0].plain_text}`);
      } else if (block.type === 'child_page') {
        console.log(`   Page: ${block.child_page.title}`);
      } else if (block.type === 'child_database') {
        console.log(`   Database: ${block.child_database.title}`);
      }
      
      if (block.has_children) {
        console.log(`   ⚠️  Has children (${block.type})`);
      }
      
      console.log();
    });
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

const pageId = process.argv[2] || '26a33487-4af6-81a8-b01c-fd1a8a5f8bcb';
getPageBlocks(pageId);
