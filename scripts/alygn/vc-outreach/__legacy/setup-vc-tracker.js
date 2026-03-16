
/**
 * Create VC Outreach Tracker Database in Notion
 * 
 * Creates a spreadsheet-style database under ALYGN Growth Strategy Tracker
 * with all necessary columns for tracking VC outreach, replies, and investments.
 */

const https = require('https');
const { getNotionKey, getNotionPage } = require('../../../shared/load-credentials');

const NOTION_API_KEY = getNotionKey();
const PARENT_PAGE_ID = getNotionPage('alygn_tracker'); // ALYGN Growth Strategy Tracker

async function notionRequest(method, endpoint, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.notion.com',
      path: endpoint,
      method: method,
      headers: {
        'Authorization': `Bearer ${NOTION_API_KEY}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(new Error(`Notion API error: ${parsed.message || data}`));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(new Error(`Failed to parse response: ${data}`));
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function createVCDatabase() {
  console.log("📊 Creating VC Outreach Tracker Database in Notion\n");

  const databaseSchema = {
    parent: {
      type: "page_id",
      page_id: PARENT_PAGE_ID
    },
    title: [
      {
        type: "text",
        text: {
          content: "VC Outreach Tracker"
        }
      }
    ],
    properties: {
      "VC Name": {
        title: {}
      },
      "Contact Date": {
        date: {}
      },
      "Contact Email": {
        email: {}
      },
      "Contact Person": {
        rich_text: {}
      },
      "Status": {
        select: {
          options: [
            { name: "Pending", color: "gray" },
            { name: "Contacted", color: "blue" },
            { name: "Replied", color: "yellow" },
            { name: "Meeting Scheduled", color: "purple" },
            { name: "Passed", color: "red" },
            { name: "Invested", color: "green" }
          ]
        }
      },
      "Replied": {
        checkbox: {}
      },
      "Reply Date": {
        date: {}
      },
      "Contributing": {
        checkbox: {}
      },
      "Investment Amount": {
        number: {
          format: "dollar"
        }
      },
      "Investment Method": {
        select: {
          options: [
            { name: "Equity", color: "blue" },
            { name: "SAFE", color: "purple" },
            { name: "Convertible Note", color: "yellow" },
            { name: "Grant", color: "green" },
            { name: "Other", color: "gray" }
          ]
        }
      },
      "Investment Date": {
        date: {}
      },
      "Notes": {
        rich_text: {}
      },
      "Priority": {
        select: {
          options: [
            { name: "🔴 High", color: "red" },
            { name: "🟡 Medium", color: "yellow" },
            { name: "🟢 Low", color: "green" }
          ]
        }
      },
      "Check Size": {
        rich_text: {}
      },
      "Focus Areas": {
        multi_select: {
          options: [
            { name: "AI Safety", color: "red" },
            { name: "AI Infrastructure", color: "blue" },
            { name: "Enterprise AI", color: "purple" },
            { name: "Bio AI", color: "green" },
            { name: "Governance", color: "yellow" }
          ]
        }
      }
    }
  };

  try {
    const database = await notionRequest('POST', '/v1/databases', databaseSchema);
    
    console.log("✅ Database created successfully!");
    console.log(`   ID: ${database.id}`);
    console.log(`   URL: ${database.url}\n`);

    // Add initial VC entries from Grok research
    console.log("📝 Adding initial VC entries from Grok research...\n");

    const initialVCs = [
      {
        vcName: "Menlo Ventures",
        priority: "🔴 High",
        checkSize: "$5M-$100M",
        focusAreas: ["AI Safety", "AI Infrastructure"],
        notes: "TOP PRIORITY - Co-manages $100M Anthology Fund with Anthropic. Invested in Anthropic ($7.3B+ funding)."
      },
      {
        vcName: "Sequoia Capital",
        priority: "🔴 High",
        checkSize: "$10M-$100M",
        focusAreas: ["AI Safety", "Enterprise AI"],
        notes: "Invested in OpenAI, Anthropic, Databricks, xAI. Focus on foundational AI with safety considerations."
      },
      {
        vcName: "Andreessen Horowitz (a16z)",
        priority: "🔴 High",
        checkSize: "$500K-$40M",
        focusAreas: ["AI Infrastructure", "Governance"],
        notes: "Broad AI portfolio. Active in policy discussions. Invested in OpenAI, xAI, Character.AI."
      },
      {
        vcName: "Lightspeed Venture Partners",
        priority: "🟡 Medium",
        checkSize: "$1M-$50M",
        focusAreas: ["AI Infrastructure", "Governance"],
        notes: "Invested in Anthropic, Stability AI. 23 AI deals in 2024-2025 emphasizing minimal-risk governance."
      },
      {
        vcName: "Khosla Ventures",
        priority: "🟡 Medium",
        checkSize: "$1M-$25M",
        focusAreas: ["AI Safety", "Bio AI"],
        notes: "Early-stage AI with alignment focus. Invested in OpenAI. Thesis on non-negotiable biological redlines."
      },
      {
        vcName: "Bessemer Venture Partners",
        priority: "🟡 Medium",
        checkSize: "$2M-$50M",
        focusAreas: ["Enterprise AI", "Governance"],
        notes: "Enterprise AI with governance and security focus. Active in AI TRiSM (Trust, Risk, Security Management)."
      },
      {
        vcName: "Insight Partners",
        priority: "🟢 Low",
        checkSize: "$10M-$100M",
        focusAreas: ["Enterprise AI", "Governance"],
        notes: "Scalable AI with regulatory preparedness. Prioritizes compliance trends like EU AI Act."
      },
      {
        vcName: "Air Street Capital",
        priority: "🟡 Medium",
        checkSize: "$500K-$5M",
        focusAreas: ["AI Safety", "Bio AI"],
        notes: "AI-first software with safety in biology and deep tech. Seed-stage focused."
      }
    ];

    for (const vc of initialVCs) {
      try {
        await notionRequest('POST', '/v1/pages', {
          parent: { database_id: database.id },
          properties: {
            "VC Name": {
              title: [{ text: { content: vc.vcName } }]
            },
            "Status": {
              select: { name: "Pending" }
            },
            "Priority": {
              select: { name: vc.priority }
            },
            "Check Size": {
              rich_text: [{ text: { content: vc.checkSize } }]
            },
            "Focus Areas": {
              multi_select: vc.focusAreas.map(area => ({ name: area }))
            },
            "Notes": {
              rich_text: [{ text: { content: vc.notes } }]
            }
          }
        });
        console.log(`   ✅ Added: ${vc.vcName}`);
      } catch (error) {
        console.error(`   ❌ Failed to add ${vc.vcName}:`, error.message);
      }
    }

    console.log("\n✅ VC Outreach Tracker ready!");
    console.log(`\n📊 View in Notion: ${database.url}`);
    console.log("\n💡 To export as CSV/Excel:");
    console.log("   1. Open the database in Notion");
    console.log("   2. Click '...' menu (top right)");
    console.log("   3. Select 'Export'");
    console.log("   4. Choose 'CSV' format");
    console.log("   5. Download → Opens in Excel or Google Sheets");
    console.log("\n💾 Database ID saved for vc-outreach.js:");
    console.log(`   ${database.id}`);

    return database.id;

  } catch (error) {
    console.error("\n❌ Error creating database:", error.message);
    process.exit(1);
  }
}

// Main execution
if (require.main === module) {
  createVCDatabase()
    .then(dbId => {
      console.log("\n🎯 Next steps:");
      console.log("   1. Update vc-outreach.js with database ID");
      console.log("   2. Run vc-outreach.js to start tracking outreach");
      console.log("   3. Export to CSV/Excel anytime from Notion UI");
      process.exit(0);
    })
    .catch(error => {
      console.error("\n❌ Fatal error:", error);
      process.exit(1);
    });
}

module.exports = { createVCDatabase };
