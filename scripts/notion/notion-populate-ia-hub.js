
import { Client } from "@notionhq/client";
const notion = new Client({ auth: process.env.NOTION_API_KEY });

async function updateHub() {
  try {
    console.log('📝 Updating Alygn documentation...\n');

    // Page IDs from creation
    const accessPageId = '2f9334874af68131ab09edd9911732f4';
    const reposPageId = '2f9334874af6811ab5d2ebb48719f2b7';
    const platformsPageId = '2f9334874af6816a8d56dcd632696802';
    const teamPageId = '2f9334874af6816a8c8fdb1efb25608f';

    // 1. Update Access & Credentials
    console.log('1️⃣  Updating Access & Credentials...');
    await notion.blocks.children.append({
      block_id: accessPageId,
      children: [
        { type: 'heading_2', heading_2: { rich_text: [{ text: { content: '🌐 Domain & Website' } }] } },
        { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [
          { text: { content: 'Domain: ' }, annotations: { bold: true } },
          { text: { content: 'alygn.us' }, annotations: { code: true } }
        ]}},
        { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [
          { text: { content: 'Website: ' }, annotations: { bold: true } },
          { text: { content: 'https://www.alygn.us/', link: { url: 'https://www.alygn.us/' } } }
        ]}},
        { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [
          { text: { content: 'Status: ' }, annotations: { bold: true } },
          { text: { content: 'Active (redirects to /lander)' } }
        ]}},
        
        { type: 'heading_2', heading_2: { rich_text: [{ text: { content: '🐙 GitHub Organization' } }] } },
        { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [
          { text: { content: 'Org Name: ' }, annotations: { bold: true } },
          { text: { content: 'Intention-Alliance', link: { url: 'https://github.com/Intention-Alliance' } } }
        ]}},
        { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [
          { text: { content: 'Display Name: ' }, annotations: { bold: true } },
          { text: { content: 'Alygn' } }
        ]}},
        { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [
          { text: { content: 'Tagline: ' }, annotations: { bold: true } },
          { text: { content: 'AI Governance' } }
        ]}},
        { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [
          { text: { content: 'Created: ' }, annotations: { bold: true } },
          { text: { content: 'November 24, 2023' } }
        ]}},
        { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [
          { text: { content: 'Members: ' }, annotations: { bold: true } },
          { text: { content: 'AndlerRL, TaniaLea, wavesrcool' } }
        ]}},

        { type: 'heading_2', heading_2: { rich_text: [{ text: { content: '📁 Google Drive' } }] } },
        { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [
          { text: { content: 'Account: ' }, annotations: { bold: true } },
          { text: { content: 'contact@andler.dev' } }
        ]}},
        { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [
          { text: { content: 'Shared folders for Alygn documentation' } }
        ]}},

        { type: 'heading_2', heading_2: { rich_text: [{ text: { content: '📧 Email & Communication' } }] } },
        { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [
          { text: { content: 'Primary: ' }, annotations: { bold: true } },
          { text: { content: 'contact@andler.dev' } }
        ]}},
        { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [
          { text: { content: 'Google Workspace: ' }, annotations: { bold: true } },
          { text: { content: 'Pending setup for @alygn.us emails' } }
        ]}}
      ]
    });
    console.log('   ✅ Access & Credentials updated');

    // 2. Update GitHub Repositories
    console.log('2️⃣  Updating GitHub Repositories...');
    await notion.blocks.children.append({
      block_id: reposPageId,
      children: [
        { type: 'heading_2', heading_2: { rich_text: [{ text: { content: '📦 Active Repositories' } }] } },
        { type: 'paragraph', paragraph: { rich_text: [
          { text: { content: 'Organization: ' }, annotations: { bold: true } },
          { text: { content: 'Intention-Alliance', link: { url: 'https://github.com/Intention-Alliance' } } }
        ]}},
        
        { type: 'heading_3', heading_3: { rich_text: [{ text: { content: 'align-core-infra' } }], color: 'blue_background' } },
        { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [
          { text: { content: 'Description: ' }, annotations: { bold: true } },
          { text: { content: 'Killer Switch - Hardware-enforced AI safety compliance with cryptoeconomic incentives on Bitcoin blockchain' } }
        ]}},
        { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [
          { text: { content: 'URL: ' }, annotations: { bold: true } },
          { text: { content: 'https://github.com/Intention-Alliance/align-core-infra', link: { url: 'https://github.com/Intention-Alliance/align-core-infra' } } }
        ]}},
        { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [
          { text: { content: 'Status: ' }, annotations: { bold: true } },
          { text: { content: '🔒 Private' } }
        ]}},
        { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [
          { text: { content: 'Created: ' }, annotations: { bold: true } },
          { text: { content: 'January 30, 2026' } }
        ]}},
        { type: 'paragraph', paragraph: { rich_text: [] } },

        { type: 'heading_3', heading_3: { rich_text: [{ text: { content: 'examples' } }], color: 'blue_background' } },
        { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [
          { text: { content: 'URL: ' }, annotations: { bold: true } },
          { text: { content: 'https://github.com/Intention-Alliance/examples', link: { url: 'https://github.com/Intention-Alliance/examples' } } }
        ]}},
        { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [
          { text: { content: 'Status: ' }, annotations: { bold: true } },
          { text: { content: '🔒 Private' } }
        ]}},
        { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [
          { text: { content: 'Created: ' }, annotations: { bold: true } },
          { text: { content: 'February 22, 2024' } }
        ]}},
        { type: 'paragraph', paragraph: { rich_text: [] } },

        { type: 'heading_3', heading_3: { rich_text: [{ text: { content: 'license-app' } }], color: 'blue_background' } },
        { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [
          { text: { content: 'URL: ' }, annotations: { bold: true } },
          { text: { content: 'https://github.com/Intention-Alliance/license-app', link: { url: 'https://github.com/Intention-Alliance/license-app' } } }
        ]}},
        { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [
          { text: { content: 'Status: ' }, annotations: { bold: true } },
          { text: { content: '🔒 Private' } }
        ]}},
        { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [
          { text: { content: 'Created: ' }, annotations: { bold: true } },
          { text: { content: 'December 29, 2023' } }
        ]}},
        { type: 'paragraph', paragraph: { rich_text: [] } },

        { type: 'heading_3', heading_3: { rich_text: [{ text: { content: 'docs' } }], color: 'blue_background' } },
        { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [
          { text: { content: 'URL: ' }, annotations: { bold: true } },
          { text: { content: 'https://github.com/Intention-Alliance/docs', link: { url: 'https://github.com/Intention-Alliance/docs' } } }
        ]}},
        { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [
          { text: { content: 'Status: ' }, annotations: { bold: true } },
          { text: { content: '🔒 Private' } }
        ]}},
        { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [
          { text: { content: 'Created: ' }, annotations: { bold: true } },
          { text: { content: 'November 24, 2023' } }
        ]}}
      ]
    });
    console.log('   ✅ GitHub Repositories updated');

    // 3. Update Team & Roles
    console.log('3️⃣  Updating Team & Roles...');
    await notion.blocks.children.append({
      block_id: teamPageId,
      children: [
        { type: 'heading_2', heading_2: { rich_text: [{ text: { content: '👥 Core Team' } }] } },
        
        { type: 'heading_3', heading_3: { rich_text: [{ text: { content: 'Andler (AndlerRL)' } }], color: 'blue_background' } },
        { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [
          { text: { content: 'Role: ' }, annotations: { bold: true } },
          { text: { content: 'Founder, CTO' } }
        ]}},
        { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [
          { text: { content: 'Email: ' }, annotations: { bold: true } },
          { text: { content: 'contact@andler.dev' } }
        ]}},
        { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [
          { text: { content: 'GitHub: ' }, annotations: { bold: true } },
          { text: { content: 'https://github.com/AndlerRL', link: { url: 'https://github.com/AndlerRL' } } }
        ]}},
        { type: 'paragraph', paragraph: { rich_text: [] } },

        { type: 'heading_3', heading_3: { rich_text: [{ text: { content: 'TaniaLea' } }], color: 'blue_background' } },
        { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [
          { text: { content: 'GitHub: ' }, annotations: { bold: true } },
          { text: { content: 'https://github.com/TaniaLea', link: { url: 'https://github.com/TaniaLea' } } }
        ]}},
        { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [
          { text: { content: 'Role: ' }, annotations: { bold: true } },
          { text: { content: '[To be added]' } }
        ]}},
        { type: 'paragraph', paragraph: { rich_text: [] } },

        { type: 'heading_3', heading_3: { rich_text: [{ text: { content: 'wavesrcool' } }], color: 'blue_background' } },
        { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [
          { text: { content: 'GitHub: ' }, annotations: { bold: true } },
          { text: { content: 'https://github.com/wavesrcool', link: { url: 'https://github.com/wavesrcool' } } }
        ]}},
        { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [
          { text: { content: 'Role: ' }, annotations: { bold: true } },
          { text: { content: '[To be added]' } }
        ]}},
        { type: 'paragraph', paragraph: { rich_text: [] } },

        { type: 'heading_3', heading_3: { rich_text: [{ text: { content: 'Jacobo' } }], color: 'blue_background' } },
        { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [
          { text: { content: 'Team Member (Alygn)' } }
        ]}},
        { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [
          { text: { content: 'Communication: ' }, annotations: { bold: true } },
          { text: { content: 'WhatsApp' } }
        ]}},
        { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [
          { text: { content: 'Daily summaries tracked via cron job' } }
        ]}},
        { type: 'paragraph', paragraph: { rich_text: [] } },

        { type: 'heading_3', heading_3: { rich_text: [{ text: { content: 'Wobblus (AI)' } }], color: 'purple_background' } },
        { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [
          { text: { content: 'Role: ' }, annotations: { bold: true } },
          { text: { content: 'AI Assistant, Documentation, Automation' } }
        ]}},
        { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [
          { text: { content: 'Platform: ' }, annotations: { bold: true } },
          { text: { content: 'OpenClaw' } }
        ]}}
      ]
    });
    console.log('   ✅ Team & Roles updated');

    // 4. Update Platforms & Tools
    console.log('4️⃣  Updating Platforms & Tools...');
    await notion.blocks.children.append({
      block_id: platformsPageId,
      children: [
        { type: 'heading_2', heading_2: { rich_text: [{ text: { content: '🛠️ Development & Infrastructure' } }] } },
        { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [
          { text: { content: 'GitHub: ' }, annotations: { bold: true } },
          { text: { content: 'https://github.com/Intention-Alliance', link: { url: 'https://github.com/Intention-Alliance' } } }
        ]}},
        { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [
          { text: { content: 'Website: ' }, annotations: { bold: true } },
          { text: { content: 'https://www.alygn.us/', link: { url: 'https://www.alygn.us/' } } }
        ]}},
        { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [
          { text: { content: 'Domain: ' }, annotations: { bold: true } },
          { text: { content: 'alygn.us' } }
        ]}},
        { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [
          { text: { content: 'Notion: ' }, annotations: { bold: true } },
          { text: { content: 'Project documentation & management' } }
        ]}},
        { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [
          { text: { content: 'Google Drive: ' }, annotations: { bold: true } },
          { text: { content: 'contact@andler.dev (shared folders)' } }
        ]}},

        { type: 'heading_2', heading_2: { rich_text: [{ text: { content: '📱 Communication' } }] } },
        { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [
          { text: { content: 'WhatsApp: ' }, annotations: { bold: true } },
          { text: { content: 'Team coordination' } }
        ]}},
        { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [
          { text: { content: 'Signal: ' }, annotations: { bold: true } },
          { text: { content: 'ALYGN Team group' } }
        ]}},
        { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [
          { text: { content: 'Email: ' }, annotations: { bold: true } },
          { text: { content: 'contact@andler.dev' } }
        ]}},

        { type: 'heading_2', heading_2: { rich_text: [{ text: { content: '🤖 Automation & AI' } }] } },
        { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [
          { text: { content: 'OpenClaw: ' }, annotations: { bold: true } },
          { text: { content: 'Wobblus AI assistant' } }
        ]}},
        { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [
          { text: { content: 'Daily Jacobo summaries: ' }, annotations: { bold: true } },
          { text: { content: 'Automated via cron (6 PM daily)' } }
        ]}},
        { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [
          { text: { content: 'Twitter automation: ' }, annotations: { bold: true } },
          { text: { content: 'Pending setup' } }
        ]}}
      ]
    });
    console.log('   ✅ Platforms & Tools updated');

    console.log('\n🎉 All documentation updated!\n');
    console.log('📍 View hub: https://www.notion.so/Intention-Alliance-Central-Hub-2f9334874af6819fa5c5f32ae95088f1');
    
  } catch (error) {
    console.error('Error:', error.message);
    if (error.body) {
      console.error(JSON.stringify(error.body, null, 2));
    }
    process.exit(1);
  }
}

updateHub();
