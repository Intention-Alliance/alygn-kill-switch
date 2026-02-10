#!/usr/bin/env node

const { Client } = require('@notionhq/client');
const notion = new Client({ auth: process.env.NOTION_API_KEY });

async function createHub() {
  try {
    const parentPageId = '26a33487-4af6-81a8-b01c-fd1a8a5f8bcb';
    
    console.log('🏢 Creating Intention Alliance Central Hub...\n');
    
    const mainPage = await notion.pages.create({
      parent: { page_id: parentPageId },
      icon: { type: 'emoji', emoji: '🎯' },
      properties: {
        title: [{ text: { content: 'Intention Alliance - Central Hub' } }]
      },
      children: [
        { type: 'heading_1', heading_1: { rich_text: [{ text: { content: '🏢 Intention Alliance' } }] } },
        { type: 'paragraph', paragraph: { rich_text: [{ text: { content: 'Organization: Intention Alliance' }, annotations: { bold: true } }] } },
        { type: 'paragraph', paragraph: { rich_text: [{ text: { content: 'Main Project: ALYGN' }, annotations: { bold: true } }] } },
        { type: 'paragraph', paragraph: { rich_text: [{ text: { content: 'Domain: alygn.us' }, annotations: { code: true } }] } },
        { type: 'divider', divider: {} }
      ]
    });

    console.log(`✅ Main hub: ${mainPage.url}\n`);
    const hub = mainPage.id;

    // Child pages
    const pages = [
      { title: 'Access & Credentials', emoji: '🔑' },
      { title: 'GitHub Repositories', emoji: '📦' },
      { title: 'Platforms & Tools', emoji: '🛠️' },
      { title: 'Team & Roles', emoji: '👥' },
      { title: 'Administrative Info', emoji: '📋' }
    ];

    for (const p of pages) {
      const page = await notion.pages.create({
        parent: { page_id: hub },
        icon: { type: 'emoji', emoji: p.emoji },
        properties: { title: [{ text: { content: p.title } }] }
      });
      console.log(`   ✅ ${p.title}: ${page.url}`);
    }

    // Weekly Progress Database
    const db = await notion.databases.create({
      parent: { page_id: hub },
      icon: { type: 'emoji', emoji: '📊' },
      title: [{ text: { content: 'Weekly Progress Log' } }],
      properties: {
        'Week': { title: {} },
        'Date': { date: {} },
        'Category': { select: { options: [
          { name: 'Development', color: 'blue' },
          { name: 'Infrastructure', color: 'purple' },
          { name: 'Business', color: 'green' }
        ]}},
        'Summary': { rich_text: {} },
        'Status': { select: { options: [
          { name: 'In Progress', color: 'yellow' },
          { name: 'Completed', color: 'green' }
        ]}}
      }
    });

    console.log(`   ✅ Weekly Progress Log: ${db.url}\n`);
    console.log('🎉 Done! View your hub:\n');
    console.log(`   ${mainPage.url}\n`);
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

createHub();
