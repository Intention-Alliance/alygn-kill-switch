#!/usr/bin/env node

const { Client } = require('@notionhq/client');

const notion = new Client({ auth: process.env.NOTION_API_KEY });

async function createCostTrackingDatabase() {
  try {
    // Find parent page (we'll use Organizations TODO Lists as parent for now)
    const parentPageId = '26a33487-4af6-81a8-b01c-fd1a8a5f8bcb';
    
    console.log('📊 Creating Cost Tracking Database for ALYGN...\n');
    
    const database = await notion.databases.create({
      parent: {
        type: 'page_id',
        page_id: parentPageId
      },
      title: [
        {
          type: 'text',
          text: {
            content: 'ALYGN Cost Tracking'
          }
        }
      ],
      properties: {
        'Item': {
          title: {}
        },
        'Category': {
          select: {
            options: [
              { name: 'Domain', color: 'blue' },
              { name: 'Email', color: 'green' },
              { name: 'Infrastructure', color: 'purple' },
              { name: 'VCs/Funding', color: 'orange' },
              { name: 'Post-Centrito', color: 'pink' },
              { name: 'Other', color: 'gray' }
            ]
          }
        },
        'Cost': {
          number: {
            format: 'dollar'
          }
        },
        'Frequency': {
          select: {
            options: [
              { name: 'One-time', color: 'default' },
              { name: 'Monthly', color: 'blue' },
              { name: 'Yearly', color: 'green' },
              { name: 'Quarterly', color: 'yellow' }
            ]
          }
        },
        'Status': {
          select: {
            options: [
              { name: 'Pending', color: 'yellow' },
              { name: 'Paid', color: 'green' },
              { name: 'Overdue', color: 'red' }
            ]
          }
        },
        'Date': {
          date: {}
        },
        'Notes': {
          rich_text: {}
        }
      }
    });

    console.log('✅ Database created!');
    console.log(`   ID: ${database.id}`);
    console.log(`   URL: ${database.url}`);
    
    // Add initial entries
    console.log('\n📝 Adding initial cost entries...\n');
    
    const entries = [
      {
        'Item': 'Domain alygn.us',
        'Category': 'Domain',
        'Cost': 12,
        'Frequency': 'Yearly',
        'Status': 'Pending',
        'Notes': 'Main domain for ALYGN project'
      },
      {
        'Item': 'Google Workspace',
        'Category': 'Email',
        'Cost': 6,
        'Frequency': 'Monthly',
        'Status': 'Pending',
        'Notes': 'Organization emails for Alygn'
      }
    ];
    
    for (const entry of entries) {
      await notion.pages.create({
        parent: { database_id: database.id },
        properties: {
          'Item': {
            title: [{ text: { content: entry.Item } }]
          },
          'Category': {
            select: { name: entry.Category }
          },
          'Cost': {
            number: entry.Cost
          },
          'Frequency': {
            select: { name: entry.Frequency }
          },
          'Status': {
            select: { name: entry.Status }
          },
          'Notes': {
            rich_text: [{ text: { content: entry.Notes } }]
          }
        }
      });
      console.log(`   ✅ Added: ${entry.Item}`);
    }
    
    console.log('\n🎉 Done! Cost tracking database ready.');
    console.log(`   Visit: ${database.url}`);
    
  } catch (error) {
    console.error('Error:', error.message);
    if (error.body) {
      console.error(JSON.stringify(error.body, null, 2));
    }
    process.exit(1);
  }
}

createCostTrackingDatabase();
