#!/usr/bin/env node

const { Client } = require('@notionhq/client');

const notion = new Client({ auth: process.env.NOTION_API_KEY });

async function createIntentionAllianceHub() {
  try {
    // Find the main workspace or create under Organizations TODO Lists for now
    const parentPageId = '26a33487-4af6-81a8-b01c-fd1a8a5f8bcb';
    
    console.log('🏢 Creating Alygn Central Hub...\n');
    
    // Create main page
    const mainPage = await notion.pages.create({
      parent: { page_id: parentPageId },
      icon: { type: 'emoji', emoji: '🎯' },
      properties: {
        title: [{ text: { content: 'Alygn - Central Hub' } }]
      },
      children: [
        {
          type: 'heading_1',
          heading_1: {
            rich_text: [{ text: { content: '🏢 Alygn' } }]
          }
        },
        {
          type: 'paragraph',
          paragraph: {
            rich_text: [
              { text: { content: 'Organization: ', annotations: { bold: true } } },
              { text: { content: 'Alygn' } }
            ]
          }
        },
        {
          type: 'paragraph',
          paragraph: {
            rich_text: [
              { text: { content: 'Main Project: ', annotations: { bold: true } } },
              { text: { content: 'ALYGN' } }
            ]
          }
        },
        {
          type: 'paragraph',
          paragraph: {
            rich_text: [
              { text: { content: 'Domain: ', annotations: { bold: true } } },
              { text: { content: 'alygn.us', annotations: { code: true } } }
            ]
          }
        },
        {
          type: 'divider',
          divider: {}
        },
        {
          type: 'heading_2',
          heading_2: {
            rich_text: [{ text: { content: '📋 Quick Links' } }]
          }
        },
        {
          type: 'callout',
          callout: {
            icon: { type: 'emoji', emoji: '🔗' },
            rich_text: [{ text: { content: 'Access all project resources from here' } }],
            color: 'blue_background'
          }
        }
      ]
    });

    console.log(`✅ Main hub created: ${mainPage.url}\n`);

    // Create child pages
    console.log('📄 Creating documentation pages...\n');

    // 1. Access & Credentials
    const accessPage = await notion.pages.create({
      parent: { page_id: mainPage.id },
      icon: { type: 'emoji', emoji: '🔑' },
      properties: {
        title: [{ text: { content: 'Access & Credentials' } }]
      },
      children: [
        {
          type: 'callout',
          callout: {
            icon: { type: 'emoji', emoji: '⚠️' },
            rich_text: [{ text: { content: '🔒 CONFIDENTIAL - Keep secure', annotations: { bold: true } } }],
            color: 'red_background'
          }
        },
        {
          type: 'heading_2',
          heading_2: { rich_text: [{ text: { content: '🌐 Domain & Hosting' } }] }
        },
        {
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [
              { text: { content: 'Domain: ', annotations: { bold: true } } },
              { text: { content: 'alygn.us (pending setup)' } }
            ]
          }
        },
        {
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [
              { text: { content: 'Registrar: ', annotations: { bold: true } } },
              { text: { content: 'TBD' } }
            ]
          }
        },
        {
          type: 'heading_2',
          heading_2: { rich_text: [{ text: { content: '📧 Email Accounts (Google Workspace)' } }] }
        },
        {
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [{ text: { content: 'Pending setup' } }]
          }
        },
        {
          type: 'heading_2',
          heading_2: { rich_text: [{ text: { content: '🐙 GitHub Organization' } }] }
        },
        {
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [
              { text: { content: 'Org: ', annotations: { bold: true } } },
              { text: { content: '[Add GitHub org name here]' } }
            ]
          }
        },
        {
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [
              { text: { content: 'Members: ', annotations: { bold: true } } },
              { text: { content: 'Andler, Jacobo' } }
            ]
          }
        },
        {
          type: 'heading_2',
          heading_2: { rich_text: [{ text: { content: '🔐 Other Services' } }] }
        },
        {
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [
              { text: { content: 'Twitter API: ', annotations: { bold: true } } },
              { text: { content: 'TBD (for automation)' } }
            ]
          }
        }
      ]
    });

    console.log(`   ✅ Access & Credentials: ${accessPage.url}`);

    // 2. GitHub Repositories
    const reposPage = await notion.pages.create({
      parent: { page_id: mainPage.id },
      icon: { type: 'emoji', emoji: '📦' },
      properties: {
        title: [{ text: { content: 'GitHub Repositories' } }]
      },
      children: [
        {
          type: 'heading_2',
          heading_2: { rich_text: [{ text: { content: '📦 Active Repositories' } }] }
        },
        {
          type: 'paragraph',
          paragraph: {
            rich_text: [{ text: { content: 'List all repositories related to ALYGN/Alygn here.' } }]
          }
        },
        {
          type: 'heading_3',
          heading_3: { rich_text: [{ text: { content: 'Example Format:' } }] }
        },
        {
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [
              { text: { content: 'Repository Name', annotations: { bold: true } } },
              { text: { content: ' - Description' } }
            ]
          }
        },
        {
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [
              { text: { content: '  URL: ', annotations: { bold: true } } },
              { text: { content: 'https://github.com/org/repo' } }
            ]
          }
        },
        {
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [
              { text: { content: '  Status: ', annotations: { bold: true } } },
              { text: { content: 'Active / In Development / Archived' } }
            ]
          }
        },
        {
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [
              { text: { content: '  Tech Stack: ', annotations: { bold: true } } },
              { text: { content: 'Node.js, React, etc.' } }
            ]
          }
        }
      ]
    });

    console.log(`   ✅ GitHub Repositories: ${reposPage.url}`);

    // 3. Platforms & Tools
    const platformsPage = await notion.pages.create({
      parent: { page_id: mainPage.id },
      icon: { type: 'emoji', emoji: '🛠️' },
      properties: {
        title: [{ text: { content: 'Platforms & Tools' } }]
      },
      children: [
        {
          type: 'heading_2',
          heading_2: { rich_text: [{ text: { content: '🛠️ Development Tools' } }] }
        },
        {
          type: 'bulleted_list_item',
          bulleted_list_item: { rich_text: [{ text: { content: 'GitHub (version control)' } }] }
        },
        {
          type: 'bulleted_list_item',
          bulleted_list_item: { rich_text: [{ text: { content: 'Notion (documentation & project management)' } }] }
        },
        {
          type: 'heading_2',
          heading_2: { rich_text: [{ text: { content: '🌐 Infrastructure' } }] }
        },
        {
          type: 'bulleted_list_item',
          bulleted_list_item: { rich_text: [{ text: { content: 'Domain: alygn.us' } }] }
        },
        {
          type: 'bulleted_list_item',
          bulleted_list_item: { rich_text: [{ text: { content: 'Google Workspace (email)' } }] }
        },
        {
          type: 'heading_2',
          heading_2: { rich_text: [{ text: { content: '📱 Communication' } }] }
        },
        {
          type: 'bulleted_list_item',
          bulleted_list_item: { rich_text: [{ text: { content: 'WhatsApp (team communication)' } }] }
        },
        {
          type: 'bulleted_list_item',
          bulleted_list_item: { rich_text: [{ text: { content: 'Signal (ALYGN Team group)' } }] }
        },
        {
          type: 'heading_2',
          heading_2: { rich_text: [{ text: { content: '🤖 Automation' } }] }
        },
        {
          type: 'bulleted_list_item',
          bulleted_list_item: { rich_text: [{ text: { content: 'OpenClaw (AI assistant)' } }] }
        },
        {
          type: 'bulleted_list_item',
          bulleted_list_item: { rich_text: [{ text: { content: 'Twitter automation (pending setup)' } }] }
        }
      ]
    });

    console.log(`   ✅ Platforms & Tools: ${platformsPage.url}`);

    // 4. Team & Roles
    const teamPage = await notion.pages.create({
      parent: { page_id: mainPage.id },
      icon: { type: 'emoji', emoji: '👥' },
      properties: {
        title: [{ text: { content: 'Team & Roles' } }]
      },
      children: [
        {
          type: 'heading_2',
          heading_2: { rich_text: [{ text: { content: '👥 Core Team' } }] }
        },
        {
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [
              { text: { content: 'Andler', annotations: { bold: true } } },
              { text: { content: ' - Founder, CTO' } }
            ]
          }
        },
        {
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [
              { text: { content: '  Email: ', annotations: { bold: true } } },
              { text: { content: 'contact@andler.dev' } }
            ]
          }
        },
        {
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [
              { text: { content: 'Jacobo', annotations: { bold: true } } },
              { text: { content: ' - Team Member' } }
            ]
          }
        },
        {
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [
              { text: { content: '  Role: ', annotations: { bold: true } } },
              { text: { content: '[Add role details]' } }
            ]
          }
        },
        {
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [
              { text: { content: 'Wobblus (AI)', annotations: { bold: true } } },
              { text: { content: ' - AI Assistant, Documentation' } }
            ]
          }
        }
      ]
    });

    console.log(`   ✅ Team & Roles: ${teamPage.url}`);

    // 5. Weekly Progress Tracker (Database)
    const progressDb = await notion.databases.create({
      parent: { page_id: mainPage.id },
      icon: { type: 'emoji', emoji: '📊' },
      title: [{ text: { content: 'Weekly Progress Log' } }],
      properties: {
        'Week': { title: {} },
        'Date': { date: {} },
        'Category': {
          select: {
            options: [
              { name: 'Development', color: 'blue' },
              { name: 'Infrastructure', color: 'purple' },
              { name: 'Business', color: 'green' },
              { name: 'Team', color: 'orange' },
              { name: 'Admin', color: 'gray' }
            ]
          }
        },
        'Summary': { rich_text: {} },
        'Status': {
          select: {
            options: [
              { name: 'In Progress', color: 'yellow' },
              { name: 'Completed', color: 'green' },
              { name: 'Blocked', color: 'red' }
            ]
          }
        }
      }
    });

    console.log(`   ✅ Weekly Progress Log: ${progressDb.url}`);

    // 6. Administrative Info
    const adminPage = await notion.pages.create({
      parent: { page_id: mainPage.id },
      icon: { type: 'emoji', emoji: '📋' },
      properties: {
        title: [{ text: { content: 'Administrative Info' } }]
      },
      children: [
        {
          type: 'heading_2',
          heading_2: { rich_text: [{ text: { content: '💰 Financial' } }] }
        },
        {
          type: 'paragraph',
          paragraph: {
            rich_text: [
              { text: { content: 'Cost Tracking: ', annotations: { bold: true } } },
              { text: { content: 'See ALYGN Cost Tracking database' } }
            ]
          }
        },
        {
          type: 'heading_2',
          heading_2: { rich_text: [{ text: { content: '📅 Important Dates' } }] }
        },
        {
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [
              { text: { content: 'Project Start: ', annotations: { bold: true } } },
              { text: { content: 'January 2026' } }
            ]
          }
        },
        {
          type: 'heading_2',
          heading_2: { rich_text: [{ text: { content: '🎯 Milestones' } }] }
        },
        {
          type: 'to_do',
          to_do: {
            rich_text: [{ text: { content: 'Setup domain alygn.us' } }],
            checked: false
          }
        },
        {
          type: 'to_do',
          to_do: {
            rich_text: [{ text: { content: 'Configure Google Workspace' } }],
            checked: false
          }
        },
        {
          type: 'to_do',
          to_do: {
            rich_text: [{ text: { content: 'Setup VCs/funding system' } }],
            checked: false
          }
        },
        {
          type: 'heading_2',
          heading_2: { rich_text: [{ text: { content: '📝 Notes' } }] }
        },
        {
          type: 'paragraph',
          paragraph: {
            rich_text: [{ text: { content: 'Add any administrative notes, legal info, or other important details here.' } }]
          }
        }
      ]
    });

    console.log(`   ✅ Administrative Info: ${adminPage.url}`);

    // Update main page with links
    console.log('\n🔗 Adding navigation links to main hub...\n');
    
    await notion.blocks.children.append({
      block_id: mainPage.id,
      children: [
        {
          type: 'paragraph',
          paragraph: {
            rich_text: [
              { text: { content: '🔑 ', annotations: { bold: true } } },
              { 
                type: 'mention',
                mention: { type: 'page', page: { id: accessPage.id } },
                plain_text: 'Access & Credentials'
              }
            ]
          }
        },
        {
          type: 'paragraph',
          paragraph: {
            rich_text: [
              { text: { content: '📦 ', annotations: { bold: true } } },
              { 
                type: 'mention',
                mention: { type: 'page', page: { id: reposPage.id } },
                plain_text: 'GitHub Repositories'
              }
            ]
          }
        },
        {
          type: 'paragraph',
          paragraph: {
            rich_text: [
              { text: { content: '🛠️ ', annotations: { bold: true } } },
              { 
                type: 'mention',
                mention: { type: 'page', page: { id: platformsPage.id } },
                plain_text: 'Platforms & Tools'
              }
            ]
          }
        },
        {
          type: 'paragraph',
          paragraph: {
            rich_text: [
              { text: { content: '👥 ', annotations: { bold: true } } },
              { 
                type: 'mention',
                mention: { type: 'page', page: { id: teamPage.id } },
                plain_text: 'Team & Roles'
              }
            ]
          }
        },
        {
          type: 'paragraph',
          paragraph: {
            rich_text: [
              { text: { content: '📊 ', annotations: { bold: true } } },
              { 
                type: 'mention',
                mention: { type: 'database', database: { id: progressDb.id } },
                plain_text: 'Weekly Progress Log'
              }
            ]
          }
        },
        {
          type: 'paragraph',
          paragraph: {
            rich_text: [
              { text: { content: '📋 ', annotations: { bold: true } } },
              { 
                type: 'mention',
                mention: { type: 'page', page: { id: adminPage.id } },
                plain_text: 'Administrative Info'
              }
            ]
          }
        }
      ]
    });

    console.log('✅ Navigation links added!\n');
    console.log('🎉 Alygn Central Hub is ready!\n');
    console.log(`📍 Main Hub: ${mainPage.url}\n`);
    console.log('📝 Next steps:');
    console.log('   1. Fill in GitHub organization details');
    console.log('   2. Add repository information');
    console.log('   3. Update credentials as services are configured');
    console.log('   4. Start logging weekly progress in the database');
    
  } catch (error) {
    console.error('Error:', error.message);
    if (error.body) {
      console.error(JSON.stringify(error.body, null, 2));
    }
    process.exit(1);
  }
}

createIntentionAllianceHub();
