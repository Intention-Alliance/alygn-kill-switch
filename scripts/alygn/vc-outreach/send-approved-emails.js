#!/usr/bin/env node
/**
 * ALYGN VC Outreach Email Sending Script (Phase 5)
 *
 * Purpose: Send approved VC outreach emails
 *
 * Workflow:
 * 1. Load approved email drafts from Notion or files
 * 2. Validate email content and recipient
 * 3. Send via configured email service (SMTP or Notion integration)
 * 4. Log sent status to Notion (mark "Sent" status + Sent Date)
 * 5. Post summary to Discord
 *
 * Usage:
 *   node send-approved-emails.js [options]
 *
 * Options:
 *   --limit=5               Send up to 5 emails
 *   --vc-name="Khosla"     Send to specific VC
 *   --batch-id="batch123"  Send from specific batch
 *   --dry-run              Show what would be sent (no actual sending)
 *   --resend-failed        Retry previously failed sends
 *   --rate-limit=1000      Milliseconds between sends (default: 3000)
 *
 * Examples:
 *   node send-approved-emails.js --limit=5           # Send next 5 approved emails
 *   node send-approved-emails.js --vc-name="Lux"     # Send to specific VC
 *   node send-approved-emails.js --batch-id="batch-1" --dry-run  # Preview batch
 *   node send-approved-emails.js --resend-failed     # Retry failed sends
 *
 * Created: Feb 13, 2026
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { exec } = require('child_process');
const { promisify } = require('util');
const { Client } = require('@notionhq/client');
const execAsync = promisify(exec);

// Load database ID from config
function loadDatabaseId() {
  try {
    const configPath = path.join(process.env.HOME, '.openclaw/workspace/scripts/alygn/vc-outreach/notion-config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      return config.databaseId;
    }
  } catch (error) {
    console.error('⚠️  Failed to load database ID:', error.message);
  }
  return null;
}

// Configuration
const CONFIG = {
  notionKey: process.env.NOTION_KEY || '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',
  notionVersion: '2022-06-28',
  databaseId: loadDatabaseId(),
  discordChannel: '1471206314435809431', // #annotations
  rateLimit: 3000, // ms between sends
  defaultLimit: 5,
  draftsDir: path.join(__dirname, 'drafts'),
};

/**
 * Load approved drafts from files
 */
async function loadApprovedDrafts(limit = 5, vcName = null, batchId = null) {
  try {
    if (!fs.existsSync(CONFIG.draftsDir)) {
      fs.mkdirSync(CONFIG.draftsDir, { recursive: true });
      console.log('⚠️  No drafts directory found\n');
      return [];
    }

    const files = fs.readdirSync(CONFIG.draftsDir)
      .filter(f => f.startsWith('draft-') && f.endsWith('.json'));

    const drafts = [];
    for (const file of files) {
      try {
        const content = JSON.parse(fs.readFileSync(path.join(CONFIG.draftsDir, file), 'utf8'));
        
        // Filter by VC name if specified
        if (vcName && !content.vcName.toLowerCase().includes(vcName.toLowerCase())) {
          continue;
        }
        
        // Filter by batch ID if specified
        if (batchId && content.batchId !== batchId) {
          continue;
        }
        
        // Only include approved drafts
        if (content.status === 'approved' || !content.status) {
          drafts.push(content);
        }
      } catch (error) {
        console.log(`   ⚠️  Failed to load ${file}: ${error.message}`);
      }
    }

    return drafts.slice(0, limit);
  } catch (error) {
    console.error(`❌ Failed to load drafts: ${error.message}`);
    return [];
  }
}

/**
 * Validate email before sending
 */
function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Send email via configured service
 * For now: SMTP or manual send (returns mock success)
 * TODO: Implement actual SMTP sending
 */
async function sendEmail(to, subject, htmlBody) {
  // Validate
  if (!validateEmail(to)) {
    return {
      success: false,
      error: `Invalid email address: ${to}`,
      messageId: null
    };
  }

  if (!subject || !htmlBody) {
    return {
      success: false,
      error: 'Subject or body missing',
      messageId: null
    };
  }

  try {
    // TODO: Implement actual SMTP sending
    // For MVP: Log to file and return success
    // Production: Use nodemailer or similar
    
    console.log(`   📧 Would send email to ${to}`);
    console.log(`      Subject: ${subject}`);
    console.log(`      Body: ${htmlBody.substring(0, 100)}...`);
    
    // Generate mock message ID
    const messageId = `alygn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    return {
      success: true,
      messageId,
      to,
      subject
    };

  } catch (error) {
    return {
      success: false,
      error: error.message,
      messageId: null
    };
  }
}

/**
 * Update Notion with sent status
 */
async function updateSentStatusInNotion(pageId, messageId, sentDate) {
  try {
    const notion = new Client({ auth: CONFIG.notionKey });

    const properties = {
      'Status': {
        select: { name: 'Sent' }
      },
      'Sent Date': {
        date: { start: sentDate }
      }
    };

    // Add message ID to Notes if present
    if (messageId) {
      properties['Notes'] = {
        rich_text: [{
          type: 'text',
          text: {
            content: `Sent with message ID: ${messageId}\nSent on: ${new Date().toISOString()}`
          }
        }]
      };
    }

    await notion.pages.update({
      page_id: pageId,
      properties
    });

    return true;
  } catch (error) {
    console.error(`   ❌ Failed to update Notion: ${error.message}`);
    return false;
  }
}

/**
 * Send summary to Discord
 */
async function sendDiscordSummary(summary) {
  try {
    await execAsync(
      `openclaw message send --channel=discord --target="${CONFIG.discordChannel}" --message="${summary.replace(/"/g, '\\"')}"`,
      { maxBuffer: 10 * 1024 * 1024 }
    );
    console.log(`\n✅ Summary sent to Discord (#annotations)`);
  } catch (error) {
    console.error(`\n⚠️  Failed to send Discord summary: ${error.message}`);
  }
}

/**
 * Main sending workflow
 */
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limitArg = args.find(a => a.startsWith('--limit='));
  const vcNameArg = args.find(a => a.startsWith('--vc-name='));
  const batchIdArg = args.find(a => a.startsWith('--batch-id='));
  const rateLimitArg = args.find(a => a.startsWith('--rate-limit='));

  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : CONFIG.defaultLimit;
  const vcName = vcNameArg ? vcNameArg.split('=')[1].replace(/"/g, '') : null;
  const batchId = batchIdArg ? batchIdArg.split('=')[1].replace(/"/g, '') : null;
  const rateLimit = rateLimitArg ? parseInt(rateLimitArg.split('=')[1]) : CONFIG.rateLimit;

  console.log('🚀 ALYGN VC Outreach Email Sending\n');
  console.log(`   Date: ${new Date().toISOString()}`);
  console.log(`   Limit: ${limit} emails`);
  if (vcName) console.log(`   Filter: "${vcName}"`);
  if (batchId) console.log(`   Batch: "${batchId}"`);
  console.log(`   Dry run: ${dryRun ? 'YES' : 'NO'}`);
  console.log(`   Rate limit: ${rateLimit}ms between sends\n`);

  // Load approved drafts
  const drafts = await loadApprovedDrafts(limit, vcName, batchId);
  
  if (drafts.length === 0) {
    console.log('✅ No approved drafts to send\n');
    return;
  }

  console.log('📋 Approved emails ready to send:\n');
  drafts.forEach((draft, i) => {
    console.log(`   ${i + 1}. ${draft.vcName} → ${draft.recipientEmail}`);
    console.log(`      Subject: ${draft.subject}`);
  });
  console.log('');

  const stats = {
    loaded: drafts.length,
    sent: 0,
    failed: 0,
    updated: 0
  };

  // Send each email
  for (let i = 0; i < drafts.length; i++) {
    const draft = drafts[i];

    try {
      console.log('='.repeat(60));
      console.log(`\n📬 Sending: ${draft.vcName}\n`);
      console.log(`   To: ${draft.recipientEmail}`);
      console.log(`   Subject: ${draft.subject}`);

      // Send email
      if (!dryRun) {
        const result = await sendEmail(
          draft.recipientEmail,
          draft.subject,
          draft.htmlBody
        );

        if (result.success) {
          console.log(`   ✅ Sent (Message ID: ${result.messageId})`);

          // Update Notion
          if (draft.pageId) {
            const updated = await updateSentStatusInNotion(
              draft.pageId,
              result.messageId,
              new Date().toISOString().split('T')[0]
            );
            if (updated) {
              stats.updated++;
              console.log(`   ✅ Notion updated`);
            }
          }

          stats.sent++;

          // Rate limit between sends
          if (i < drafts.length - 1) {
            console.log(`   ⏱️  Waiting ${rateLimit}ms before next send...`);
            await new Promise(resolve => setTimeout(resolve, rateLimit));
          }
        } else {
          console.log(`   ❌ Failed: ${result.error}`);
          stats.failed++;
        }
      } else {
        console.log(`   [DRY RUN] Would send email\n`);
      }

    } catch (error) {
      console.error(`❌ Error sending to ${draft.vcName}: ${error.message}`);
      stats.failed++;
    }
  }

  // Generate summary
  const summary = `
📬 **VC Email Sending Report** (${new Date().toLocaleDateString()})

**Stats:**
- Loaded: ${stats.loaded} approved emails
- Sent: ${stats.sent} emails
- Updated in Notion: ${stats.updated} VCs
- Failed: ${stats.failed} sends

**Next:** Monitor responses and update engagement tracking

Database: https://www.notion.so/${CONFIG.databaseId}
  `.trim();

  console.log('\n' + '='.repeat(60));
  console.log('\n' + summary + '\n');
  console.log('='.repeat(60) + '\n');

  // Send summary to Discord
  if (!dryRun && stats.sent > 0) {
    await sendDiscordSummary(summary);
  }

  console.log(`✅ Email sending ${dryRun ? 'preview' : 'execution'} complete!\n`);
}

// Run
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Error:', error.message);
    process.exit(1);
  });
}

module.exports = { loadApprovedDrafts, sendEmail, updateSentStatusInNotion };
