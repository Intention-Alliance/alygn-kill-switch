#!/usr/bin/env node
const { Client } = require('@notionhq/client');
const notion = new Client({ auth: process.env.NOTION_API_KEY });

async function createDb() {
  const hub = '2f9334874af6819fa5c5f32ae95088f1'; // Main hub ID
  
  const db = await notion.databases.create({
    parent: { type: 'page_id', page_id: hub },
    icon: { type: 'emoji', emoji: '📊' },
    title: [{ text: { content: 'Weekly Progress Log' } }],
    properties: {
      'Week': { title: {} },
      'Date': { date: {} },
      'Category': { select: { options: [
        { name: 'Development', color: 'blue' },
        { name: 'Infrastructure', color: 'purple' },
        { name: 'Business', color: 'green' },
        { name: 'Team', color: 'orange' }
      ]}},
      'Summary': { rich_text: {} },
      'Status': { select: { options: [
        { name: 'In Progress', color: 'yellow' },
        { name: 'Completed', color: 'green' },
        { name: 'Blocked', color: 'red' }
      ]}}
    }
  });
  console.log(`✅ Weekly Progress Log: ${db.url}`);
}

createDb();
