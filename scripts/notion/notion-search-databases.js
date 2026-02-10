#!/usr/bin/env node

const { Client } = require('@notionhq/client');

const notion = new Client({ auth: process.env.NOTION_API_KEY });

async function searchDatabases() {
  try {
    console.log('🔍 Searching for databases...\n');
    
    const response = await notion.search({
      filter: {
        property: 'object',
        value: 'database'
      },
      sort: {
        direction: 'descending',
        timestamp: 'last_edited_time'
      }
    });

    console.log(`Found ${response.results.length} databases:\n`);
    
    response.results.forEach((db, i) => {
      const title = db.title?.[0]?.plain_text || 'Untitled';
      console.log(`${i + 1}. ${title}`);
      console.log(`   ID: ${db.id}`);
      console.log(`   URL: ${db.url}`);
      console.log(`   Last edited: ${db.last_edited_time}`);
      console.log();
    });
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

searchDatabases();
