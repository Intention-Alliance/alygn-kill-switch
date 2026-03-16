
import { Client } from "@notionhq/client";

const notion = new Client({ auth: process.env.NOTION_API_KEY });

async function searchPages() {
  try {
    console.log('🔍 Searching for pages...\n');
    
    const response = await notion.search({
      filter: {
        property: 'object',
        value: 'page'
      },
      sort: {
        direction: 'descending',
        timestamp: 'last_edited_time'
      }
    });

    console.log(`Found ${response.results.length} pages:\n`);
    
    response.results.forEach((page, i) => {
      const title = page.properties?.title?.title?.[0]?.plain_text || 
                   page.properties?.Name?.title?.[0]?.plain_text ||
                   'Untitled';
      console.log(`${i + 1}. ${title}`);
      console.log(`   ID: ${page.id}`);
      console.log(`   URL: ${page.url}`);
      console.log(`   Last edited: ${page.last_edited_time}`);
      console.log();
    });
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

searchPages();
