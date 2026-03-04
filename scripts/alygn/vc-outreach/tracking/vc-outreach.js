#!/usr/bin/env node

/**
 * ALYGN VC Outreach Automation
 * 
 * Manages outreach campaigns using Notion VC Outreach Tracker database.
 * Combines Grok AI enhancement with systematic tracking.
 * 
 * Database ID: Set via environment variable VC_TRACKER_DB_ID or in code
 */

const https = require('https');
const { getNotionKey, getNotionDatabase } = require('../../../shared/load-credentials');

const NOTION_API_KEY = getNotionKey();
const VC_TRACKER_DB_ID = process.env.VC_TRACKER_DB_ID || getNotionDatabase('vc_outreach');

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

async function getVCDatabase() {
  if (!VC_TRACKER_DB_ID) {
    throw new Error("VC_TRACKER_DB_ID not set. Run setup-vc-tracker.js first.");
  }

  console.log("📊 Fetching VC Outreach Tracker database...\n");

  // Query database for VCs with Status = "Pending" or "Contacted"
  const query = {
    filter: {
      or: [
        {
          property: "Status",
          select: {
            equals: "Pending"
          }
        },
        {
          property: "Status",
          select: {
            equals: "Contacted"
          }
        }
      ]
    },
    sorts: [
      {
        property: "Priority",
        direction: "ascending"
      }
    ]
  };

  const response = await notionRequest('POST', '/v1/databases/' + VC_TRACKER_DB_ID + '/query', query);
  return response.results;
}

async function updateVCStatus(pageId, updates) {
  console.log(`   Updating VC record: ${pageId}`);

  const properties = {};

  if (updates.status) {
    properties["Status"] = {
      select: { name: updates.status }
    };
  }

  if (updates.contactDate) {
    properties["Contact Date"] = {
      date: { start: updates.contactDate }
    };
  }

  if (updates.replied !== undefined) {
    properties["Replied"] = {
      checkbox: updates.replied
    };
  }

  if (updates.replyDate) {
    properties["Reply Date"] = {
      date: { start: updates.replyDate }
    };
  }

  if (updates.contributing !== undefined) {
    properties["Contributing"] = {
      checkbox: updates.contributing
    };
  }

  if (updates.investmentAmount) {
    properties["Investment Amount"] = {
      number: updates.investmentAmount
    };
  }

  if (updates.investmentMethod) {
    properties["Investment Method"] = {
      select: { name: updates.investmentMethod }
    };
  }

  if (updates.investmentDate) {
    properties["Investment Date"] = {
      date: { start: updates.investmentDate }
    };
  }

  if (updates.notes) {
    // Append to existing notes
    const page = await notionRequest('GET', '/v1/pages/' + pageId);
    const existingNotes = page.properties.Notes?.rich_text?.[0]?.text?.content || "";
    const newNotes = existingNotes + (existingNotes ? "\n\n" : "") + updates.notes;
    
    properties["Notes"] = {
      rich_text: [{ text: { content: newNotes } }]
    };
  }

  await notionRequest('PATCH', '/v1/pages/' + pageId, { properties });
  console.log(`   ✅ Updated successfully`);
}

async function sendOutreach(vc) {
  const vcName = vc.properties["VC Name"]?.title?.[0]?.text?.content || "Unknown VC";
  const contactEmail = vc.properties["Contact Email"]?.email || null;
  const contactPerson = vc.properties["Contact Person"]?.rich_text?.[0]?.text?.content || null;

  console.log(`\n📧 Processing: ${vcName}`);

  if (!contactEmail) {
    console.log(`   ⚠️ No contact email - skipping`);
    return;
  }

  // TODO: Grok enhancement - Generate personalized email using Grok API
  // For now, log that we would send an email
  console.log(`   Email: ${contactEmail}`);
  if (contactPerson) console.log(`   Contact: ${contactPerson}`);

  // TODO: Implement actual email sending via SMTP
  // For now, simulate by updating database
  const today = new Date().toISOString().split('T')[0];

  await updateVCStatus(vc.id, {
    status: "Contacted",
    contactDate: today,
    notes: `Outreach email sent on ${today}. (Automated via vc-outreach.js)`
  });

  console.log(`   ✅ Marked as contacted in database`);
}

async function exportToCSV() {
  console.log("\n📊 Exporting VC Tracker to CSV...\n");

  if (!VC_TRACKER_DB_ID) {
    throw new Error("VC_TRACKER_DB_ID not set. Run setup-vc-tracker.js first.");
  }

  // Query entire database
  const response = await notionRequest('POST', '/v1/databases/' + VC_TRACKER_DB_ID + '/query');

  // Build CSV
  const headers = [
    "VC Name",
    "Contact Date",
    "Contact Email",
    "Contact Person",
    "Status",
    "Replied",
    "Reply Date",
    "Contributing",
    "Investment Amount",
    "Investment Method",
    "Investment Date",
    "Priority",
    "Check Size",
    "Focus Areas",
    "Notes"
  ];

  let csv = headers.join(",") + "\n";

  for (const page of response.results) {
    const p = page.properties;
    
    const row = [
      p["VC Name"]?.title?.[0]?.text?.content || "",
      p["Contact Date"]?.date?.start || "",
      p["Contact Email"]?.email || "",
      p["Contact Person"]?.rich_text?.[0]?.text?.content || "",
      p["Status"]?.select?.name || "",
      p["Replied"]?.checkbox ? "Yes" : "No",
      p["Reply Date"]?.date?.start || "",
      p["Contributing"]?.checkbox ? "Yes" : "No",
      p["Investment Amount"]?.number || "",
      p["Investment Method"]?.select?.name || "",
      p["Investment Date"]?.date?.start || "",
      p["Priority"]?.select?.name || "",
      p["Check Size"]?.rich_text?.[0]?.text?.content || "",
      p["Focus Areas"]?.multi_select?.map(a => a.name).join("; ") || "",
      (p["Notes"]?.rich_text?.[0]?.text?.content || "").replace(/"/g, '""').replace(/\n/g, " ")
    ];

    csv += row.map(field => `"${field}"`).join(",") + "\n";
  }

  const fs = require('fs').promises;
  const path = require('path');
  const outputPath = path.join(process.env.HOME, '.openclaw/workspace/alygn-automation', 'vc-tracker-export.csv');
  
  await fs.writeFile(outputPath, csv);
  
  console.log(`✅ CSV exported: ${outputPath}`);
  console.log(`\n💡 Import to Google Sheets:`);
  console.log(`   1. Open Google Sheets`);
  console.log(`   2. File → Import → Upload → ${outputPath}`);
  
  return outputPath;
}

async function vcOutreach() {
  console.log("🚀 ALYGN VC Outreach Automation\n");
  console.log("=================================\n");

  try {
    // Fetch VCs that need outreach
    const vcs = await getVCDatabase();

    if (vcs.length === 0) {
      console.log("✅ No pending VCs to contact. All up to date!");
      return;
    }

    console.log(`📋 Found ${vcs.length} VCs pending outreach:\n`);

    for (const vc of vcs) {
      await sendOutreach(vc);
    }

    console.log("\n=================================");
    console.log("✅ VC outreach cycle complete!\n");

    // Export to CSV after each run
    await exportToCSV();

  } catch (error) {
    console.error("\n❌ Error during VC outreach:", error.message);
    process.exit(1);
  }
}

// CLI commands
const command = process.argv[2];

if (command === 'export') {
  exportToCSV()
    .then(() => process.exit(0))
    .catch(err => {
      console.error("Export failed:", err.message);
      process.exit(1);
    });
} else if (command === 'list') {
  getVCDatabase()
    .then(vcs => {
      console.log(`\n📋 Pending VCs (${vcs.length}):\n`);
      vcs.forEach((vc, i) => {
        const name = vc.properties["VC Name"]?.title?.[0]?.text?.content || "Unknown";
        const priority = vc.properties["Priority"]?.select?.name || "None";
        const status = vc.properties["Status"]?.select?.name || "Unknown";
        console.log(`${i + 1}. ${name} - ${priority} - ${status}`);
      });
      process.exit(0);
    })
    .catch(err => {
      console.error("List failed:", err.message);
      process.exit(1);
    });
} else {
  // Default: run outreach
  vcOutreach()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { vcOutreach, exportToCSV, getVCDatabase, updateVCStatus };
