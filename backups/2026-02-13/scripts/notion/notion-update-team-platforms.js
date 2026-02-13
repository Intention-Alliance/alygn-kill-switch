#!/usr/bin/env node
const { Client } = require('@notionhq/client');
const notion = new Client({ auth: process.env.NOTION_API_KEY });

async function updatePages() {
  const teamPageId = '2f933487-4af6-8126-8c8f-db1efb25608f';
  const platformsPageId = '2f9334874af6816a8d56dcd632696802';

  console.log('3️⃣  Updating Team & Roles...');
  await notion.blocks.children.append({
    block_id: teamPageId,
    children: [
      { type: 'heading_2', heading_2: { rich_text: [{ text: { content: '👥 Core Team' } }] } },
      { type: 'heading_3', heading_3: { rich_text: [{ text: { content: 'Andler (AndlerRL)' } }], color: 'blue_background' } },
      { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [
        { text: { content: 'Role: Founder, CTO' } }
      ]}},
      { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [
        { text: { content: 'Email: contact@andler.dev' } }
      ]}},
      { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [
        { text: { content: 'GitHub: https://github.com/AndlerRL', link: { url: 'https://github.com/AndlerRL' } } }
      ]}},
      { type: 'paragraph', paragraph: { rich_text: [] } },

      { type: 'heading_3', heading_3: { rich_text: [{ text: { content: 'TaniaLea' } }], color: 'blue_background' } },
      { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [
        { text: { content: 'GitHub: https://github.com/TaniaLea', link: { url: 'https://github.com/TaniaLea' } } }
      ]}},
      { type: 'paragraph', paragraph: { rich_text: [] } },

      { type: 'heading_3', heading_3: { rich_text: [{ text: { content: 'wavesrcool' } }], color: 'blue_background' } },
      { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [
        { text: { content: 'GitHub: https://github.com/wavesrcool', link: { url: 'https://github.com/wavesrcool' } } }
      ]}},
      { type: 'paragraph', paragraph: { rich_text: [] } },

      { type: 'heading_3', heading_3: { rich_text: [{ text: { content: 'Jacobo' } }], color: 'blue_background' } },
      { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [
        { text: { content: 'Team Member (Alygn)' } }
      ]}},
      { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [
        { text: { content: 'Communication: WhatsApp' } }
      ]}}
    ]
  });
  console.log('   ✅ Team & Roles updated');

  console.log('4️⃣  Updating Platforms & Tools...');
  await notion.blocks.children.append({
    block_id: platformsPageId,
    children: [
      { type: 'heading_2', heading_2: { rich_text: [{ text: { content: '🛠️ Development' } }] } },
      { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [
        { text: { content: 'GitHub: https://github.com/Intention-Alliance', link: { url: 'https://github.com/Intention-Alliance' } } }
      ]}},
      { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [
        { text: { content: 'Website: https://www.alygn.us/', link: { url: 'https://www.alygn.us/' } } }
      ]}},
      { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [
        { text: { content: 'Google Drive: contact@andler.dev' } }
      ]}},

      { type: 'heading_2', heading_2: { rich_text: [{ text: { content: '📱 Communication' } }] } },
      { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [
        { text: { content: 'WhatsApp, Signal, Email' } }
      ]}},

      { type: 'heading_2', heading_2: { rich_text: [{ text: { content: '🤖 Automation' } }] } },
      { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [
        { text: { content: 'OpenClaw - Wobblus AI assistant' } }
      ]}}
    ]
  });
  console.log('   ✅ Platforms & Tools updated');
  console.log('\n🎉 Done!');
}

updatePages();
