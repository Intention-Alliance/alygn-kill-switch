#!/usr/bin/env node
/**
 * Find VC Outreach Database in Notion
 */

import fetch from 'node-fetch';

const NOTION_KEY = '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';

async function searchNotion(query) {
  const response = await fetch('https://api.notion.com/v1/search', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${NOTION_KEY}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query: query,
      filter: {
        property: 'object',
        value: 'database'
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Notion API error: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

async function main() {
  console.log('🔍 Searching for VC databases...\n');
  
  const searches = ['VC', 'Outreach', 'Grant', 'Investor', 'Contact'];
  
  for (const query of searches) {
    console.log(`Searching for: "${query}"`);
    const data = await searchNotion(query);
    
    if (data.results.length > 0) {
      data.results.forEach(db => {
        if (db.object === 'database') {
          const title = db.title?.[0]?.plain_text || 'Untitled';
          console.log(`  ✅ Database: "${title}"`);
          console.log(`     ID: ${db.id}`);
          console.log(`     URL: ${db.url}`);
          console.log(`     Created: ${db.created_time}`);
          console.log(`     Updated: ${db.last_edited_time}`);
          
          // Show properties
          if (db.properties) {
            const props = Object.keys(db.properties);
            console.log(`     Properties: ${props.join(', ')}`);
          }
          console.log('');
        }
      });
    } else {
      console.log(`  No results\n`);
    }
  }
}

main().catch(console.error);
