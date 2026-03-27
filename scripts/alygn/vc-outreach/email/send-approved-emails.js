/**
 * ALYGN Send Approved Emails
 *
 * Purpose: Send approved VC outreach emails
 *
 * Workflow:
 * 1. Load approved emails from Notion (Draft Status = "Approved")
 * 2. Validate emails with ZeroBounce before sending (SINGLE VALIDATION LAYER)
 * 3. Send emails using configured provider (SMTP or Smartlead)
 * 4. Update Notion status to "Sent" (or "Invalid email" if validation fails)
 * 5. Log results
 *
 * TWO-FILTER SYSTEM:
 * Filter 1: Draft Status - Only sends if Draft Status matches --draft-status (default: "Approved")
 * Filter 2: Explicit Send List - Only sends if entity ID is in --email-send-to list
 *
 * Usage:
 *   node send-approved-emails.js [--limit=10] [--provider=smtp|smartlead] [--test-email=address] [--dry-run]
 *   node send-approved-emails.js --draft-status=Approved --email-send-to=vc_1,vc_2,vc_3
 *
 * Examples:
 *   node send-approved-emails.js --limit=5 --provider=smtp
 *   node send-approved-emails.js --limit=3 --provider=smartlead --test-email=contact@andler.dev
 *   node send-approved-emails.js --limit=1 --dry-run
 *   node send-approved-emails.js --draft-status=Approved --email-send-to=vc_abc123,vc_def456
 *
 * Created: Mar 18, 2026
 * Updated: Mar 19, 2026 - Added two-filter system for draft-to-send matching
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ABSOLUTE PATHS using home directory
const WORKSPACE_ROOT = path.resolve(process.env.HOME, '.openclaw/workspace');
const SHARED_DIR = path.resolve(WORKSPACE_ROOT, 'scripts/shared');
const ALYGN_DIR = path.resolve(WORKSPACE_ROOT, 'scripts/alygn');
const LIB_DIR = path.resolve(ALYGN_DIR, 'lib');
const EMAIL_DIR = path.resolve(LIB_DIR, 'email');

// Dynamic imports with absolute paths
const notionClient = await import(path.join(SHARED_DIR, 'notion-client.js'));
const EmailServiceModule = await import(path.join(EMAIL_DIR, 'EmailService.js'));
const EmailProviderFactoryModule = await import(path.join(EMAIL_DIR, 'EmailProviderFactory.js'));
const ZeroBounceValidatorModule = await import(path.join(EMAIL_DIR, 'validators/ZeroBounceValidator.js'));
const SentEmailTrackerModule = await import(path.join(LIB_DIR, 'SentEmailTracker.js'));

const { getClient, queryDatabase } = notionClient;
const { EmailService } = EmailServiceModule;
const { EmailProviderFactory } = EmailProviderFactoryModule;
const { ZeroBounceValidator } = ZeroBounceValidatorModule;
const { SentEmailTracker } = SentEmailTrackerModule;

// Load database ID from config
function loadDatabaseId() {
  try {
    const configPath = path.resolve(WORKSPACE_ROOT, 'scripts/alygn/vc-outreach/notion-config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      return config.databaseId;
    }
  } catch (error) {
    console.error('⚠️  Failed to load database ID from config:', error.message);
  }
  return null;
}

// Load credentials from config
function loadCredentials() {
  try {
    const credentialsPath = path.resolve(WORKSPACE_ROOT, 'config/credentials.json');
    if (fs.existsSync(credentialsPath)) {
      return JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
    }
  } catch (error) {
    console.error('⚠️  Failed to load credentials:', error.message);
  }
  return null;
}

// Configuration
const CONFIG = {
  databaseId: loadDatabaseId(),
  defaultLimit: 10,
  defaultProvider: 'smtp',
  discordChannel: '1466532145257255004',
  ccRecipient: 'tanialeaidm@gmail.com'
};

const credentials = loadCredentials();
const notion = getClient();

/**
 * Get approved VCs from Notion
 * TWO-FILTER SYSTEM:
 * Filter 1: Draft Status - Only returns VCs with matching Draft Status
 * Filter 2: Explicit Send List - Only returns VCs with IDs in the send list
 */
async function getApprovedVCs(limit = CONFIG.defaultLimit, draftStatus = 'Approved', sendToList = []) {
  console.log('📦 Loading approved VCs from Notion...');
  console.log(`   Draft Status filter: "${draftStatus}"`);
  if (sendToList.length > 0) {
    console.log(`   Send list filter: ${sendToList.length} IDs specified`);
  }
  console.log('');

  try {
    // Build filter: Draft Status must match
    let filter = {
      property: 'Draft Status',
      select: {
        equals: draftStatus
      }
    };

    // If using old Status field as fallback
    const response = await queryDatabase(notion, CONFIG.databaseId, {
      filter: filter,
      page_size: limit * 2 // Fetch extra to account for filtering
    });

    let vcs = response.results.map(page => {
      const props = page.properties;

      return {
        pageId: page.id,
        id: props.ID?.rich_text?.[0]?.text?.content || page.id, // Use custom ID or page ID
        name: props.Name?.title?.[0]?.text?.content || 'Unknown',
        email: props.Email?.email,
        website: props.Website?.url || null,
        partners: props.Partners?.rich_text?.[0]?.text?.content || null,
        focusAreas: props['Focus Areas']?.multi_select?.map(opt => opt.name) || [],
        painPoints: props['Pain Points']?.multi_select?.map(opt => opt.name) || [],
        notes: props.Notes?.rich_text?.[0]?.text?.content || null,
        relevanceScore: props['Relevance Score']?.number || 0,
        draftStatus: props['Draft Status']?.select?.name || 'Not drafted'
      };
    }).filter(vc => vc.email); // Only return VCs with email

    // Filter 2: Apply explicit send list if provided
    if (sendToList.length > 0) {
      const beforeCount = vcs.length;
      vcs = vcs.filter(vc => sendToList.includes(vc.id));
      console.log(`   Filtered by send list: ${beforeCount} → ${vcs.length} VCs`);
    }

    // Apply limit after all filtering
    vcs = vcs.slice(0, limit);

    console.log(`   Found ${vcs.length} approved VCs with emails\n`);
    return vcs;
  } catch (error) {
    console.error('❌ Failed to load VCs:', error.message);
    throw error;
  }
}

/**
 * Load draft from temp file
 */
function loadDraft(vcName) {
  try {
    // Find most recent draft file for this VC
    const files = fs.readdirSync('/tmp')
      .filter(f => f.startsWith('alygn-vc-approved-') && f.endsWith('.json'))
      .map(f => ({
        name: f,
        path: `/tmp/${f}`,
        mtime: fs.statSync(`/tmp/${f}`).mtime
      }))
      .sort((a, b) => b.mtime - a.mtime);

    for (const file of files) {
      const draft = JSON.parse(fs.readFileSync(file.path, 'utf8'));
      if (draft.vc && draft.vc.name === vcName) {
        return draft;
      }
    }

    return null;
  } catch (error) {
    console.error(`   ⚠️  Failed to load draft for ${vcName}:`, error.message);
    return null;
  }
}

/**
 * Get current VC status from Notion
 */
async function getVCStatusFromNotion(pageId) {
  try {
    const page = await notion.pages.retrieve({ page_id: pageId });
    return page.properties.Status?.select?.name || null;
  } catch (error) {
    console.error(`   ⚠️  Failed to get status from Notion:`, error.message);
    return null;
  }
}

/**
 * Update VC status in Notion
 * Updates both Status and Draft Status fields
 */
async function updateVCStatus(pageId, status, metadata = {}) {
  try {
    const properties = {
      'Status': {
        select: { name: status }
      }
    };

    // Also update Draft Status if sending
    if (status === 'Sent') {
      properties['Draft Status'] = {
        select: { name: 'Sent' }
      };
    }

    if (metadata.sentAt) {
      properties['Last Contacted'] = {
        date: { start: metadata.sentAt }
      };
    }

    // Add validation result to notes if available
    if (metadata.validationResult) {
      const existingPage = await notion.pages.retrieve({ page_id: pageId });
      const existingNotes = existingPage.properties.Notes?.rich_text?.[0]?.text?.content || '';
      const validationNote = `\n\n[${new Date().toISOString()}] Email validation: ${metadata.validationResult}`;
      if (metadata.subStatus) {
        properties['Notes'] = {
          rich_text: [{ text: { content: existingNotes + validationNote + ` (${metadata.subStatus})` } }]
        };
      }
    }

    // Add note if provided
    if (metadata.note) {
      const existingPage = await notion.pages.retrieve({ page_id: pageId });
      const existingNotes = existingPage.properties.Notes?.rich_text?.[0]?.text?.content || '';
      properties['Notes'] = {
        rich_text: [{ text: { content: existingNotes + `\n\n[${new Date().toISOString()}] ${metadata.note}` } }]
      };
    }

    await notion.pages.update({
      page_id: pageId,
      properties
    });
    console.log(`   ✅ Updated Notion status to "${status}"`);
  } catch (error) {
    console.error(`   ⚠️  Failed to update Notion:`, error.message);
  }
}

/**
 * Create email payload from draft
 */
function createEmailPayload(vc, draft, testEmail = null) {
  const recipient = testEmail || vc.email;

  // Determine if CC should be added
  const shouldAddCC = !testEmail;

  const payload = {
    to: recipient,
    subject: draft.subjects.optionA,
    html: draft.emailHTML,
    text: draft.emailText,
    from: 'Alygn R&D <outreach@alyygn.com>',
    // NEW: Add CC only if enabled and not in test mode
    cc: shouldAddCC ? CONFIG.ccRecipient : undefined,
    headers: {
      'X-Campaign': 'vc-wave-1',
      'X-Variant': draft.variant,
      'X-VC-Name': vc.name
    }
  };

  // Log CC status
  if (shouldAddCC) {
    console.log(`   📧 CC: ${CONFIG.ccRecipient}`);
  } else if (testEmail) {
    console.log(`   📧 CC: Disabled (test mode)`);
  }

  return payload;
}

/**
 * Initialize email service with provider
 */
async function initializeEmailService(providerType) {
  let config;

  if (providerType === 'smtp') {
    config = {
      server: credentials?.email?.smtp?.server,
      port: credentials?.email?.smtp?.port,
      user: credentials?.email?.address,
      password: credentials?.email?.smtp?.password,
      secure: false
    };
  } else if (providerType === 'smartlead') {
    config = {
      apiKey: process.env.SMARTLEAD_API_KEY
    };
  } else {
    throw new Error(`Unknown provider: ${providerType}`);
  }

  const service = new EmailService(providerType, config);
  const valid = await service.validateConfig();

  if (!valid) {
    throw new Error(`Failed to validate ${providerType} configuration`);
  }

  return service;
}

/**
 * Main sending workflow
 * TWO-FILTER SYSTEM implementation
 */
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limitArg = args.find(a => a.startsWith('--limit='));
  const providerArg = args.find(a => a.startsWith('--provider='));
  const testEmailArg = args.find(a => a.startsWith('--test-email='));
  const draftStatusArg = args.find(a => a.startsWith('--draft-status='));
  const sendToArg = args.find(a => a.startsWith('--email-send-to='));

  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : CONFIG.defaultLimit;
  const provider = providerArg ? providerArg.split('=')[1] : CONFIG.defaultProvider;
  const testEmail = testEmailArg ? testEmailArg.split('=')[1] : null;
  const draftStatus = draftStatusArg ? draftStatusArg.split('=')[1] : 'Approved';
  const sendToList = sendToArg ? sendToArg.split('=')[1].split(',').filter(id => id.trim()) : [];

  if (!CONFIG.databaseId) {
    console.error('❌ Error: Notion database ID not found!');
    process.exit(1);
  }

  console.log('🚀 ALYGN Send Approved Emails\n');
  console.log(`   Date: ${new Date().toISOString()}`);
  console.log(`   Database: ${CONFIG.databaseId}`);
  console.log(`   Provider: ${provider}`);
  console.log(`   Limit: ${limit} VCs`);
  console.log(`   Draft Status: "${draftStatus}"`);
  if (sendToList.length > 0) console.log(`   Send To: ${sendToList.join(', ')}`);
  console.log(`   Dry run: ${dryRun ? 'YES' : 'NO'}`);
  if (testEmail) console.log(`   Test email: ${testEmail}`);
  console.log('');

  // Initialize email service
  let emailService;
  try {
    emailService = await initializeEmailService(provider);
    if (testEmail) {
      emailService.setTestEmail(testEmail);
    }
    console.log(`   ✅ Email service initialized (${provider})\n`);
  } catch (error) {
    console.error(`   ❌ Failed to initialize email service:`, error.message);
    process.exit(1);
  }

  // Initialize ZeroBounce validator
  let validator;
  try {
    const zbApiKey = credentials?.zerobounce?.apiKey || process.env.ZEROBOUNCE_API_KEY;
    if (!zbApiKey) {
      console.warn('   ⚠️  ZeroBounce API key not found, validation will be skipped');
    } else {
      validator = new ZeroBounceValidator({ apiKey: zbApiKey });
      console.log(`   ✅ ZeroBounce validator initialized\n`);
    }
  } catch (error) {
    console.error(`   ⚠️  Failed to initialize ZeroBounce:`, error.message);
  }

  // Initialize SentEmailTracker
  const tracker = new SentEmailTracker();

  // Get approved VCs (with two-filter system)
  const vcs = await getApprovedVCs(limit, draftStatus, sendToList);

  if (vcs.length === 0) {
    console.log('⚠️  No approved VCs with emails found!\n');
    return;
  }

  const stats = {
    total: vcs.length,
    sent: 0,
    failed: 0,
    skipped: 0,
    invalid: 0,
    risky: 0
  };

  const dryRunOperations = [];
  const sentAt = new Date().toISOString();

  console.log('📧 Sending emails:\n');

  for (const vc of vcs) {
    console.log(`   📤 ${vc.name} (${vc.email})`);

    // Load draft
    const draft = loadDraft(vc.name);
    if (!draft) {
      console.log(`      ⚠️  No draft found, skipping`);
      stats.skipped++;
      continue;
    }

    // CRITICAL: Validate email with ZeroBounce before sending
    // Validation MUST happen even in test mode to protect domain reputation
    if (validator) {
      console.log(`      🔍 Validating with ZeroBounce...`);
      try {
        const validation = await validator.validate(vc.email);

        // BLOCK invalid emails (even in test mode)
        if (validation.result === 'invalid' || validation.result === 'do_not_mail') {
          console.error(`      ❌ BLOCKED: ${vc.email} is invalid (${validation.result})`);
          stats.invalid++;

          // Update Notion status to "Invalid email"
          await updateVCStatus(vc.pageId, 'Invalid email', {
            validationResult: validation.result,
            subStatus: validation.details?.rawStatus
          });
          continue; // Skip this VC
        }

        // Log validation result
        if (validation.result === 'valid') {
          console.log(`      ✅ Email validation passed`);
        } else if (validation.result === 'risky') {
          console.warn(`      ⚠️  RISKY: ${vc.email}`);
          stats.risky++;
        }
      } catch (validationError) {
        console.warn(`      ⚠️  Validation failed: ${validationError.message}, proceeding with caution`);
      }
    }

    // CRITICAL: Check Notion status BEFORE any send attempt
    const currentStatus = await getVCStatusFromNotion(vc.pageId);
    if (currentStatus === 'Sent' || currentStatus === 'Invalid email') {
      console.log(`      ⏭️  BLOCKED: Status is "${currentStatus}"`);
      stats.skipped++;
      continue;
    }

    // Check for duplicate (partner-level)
    const partnerName = vc.partners ? vc.partners.split(',')[0].trim() : null;
    if (tracker.wasAlreadySent(vc.email, partnerName, 'vc')) {
      console.log(`      ⏭️  BLOCKED: Already sent to ${vc.name} (${vc.email})`);
      stats.skipped++;
      continue;
    }

    // Create email payload
    const payload = createEmailPayload(vc, draft, testEmail);

    if (dryRun) {
      dryRunOperations.push({
        type: 'email_send',
        entity: {
          name: vc.name,
          email: vc.email,
          partnerName: partnerName
        },
        payload: {
          to: payload.to,
          subject: payload.subject,
          html: payload.html.substring(0, 500) + '...'
        },
        provider: provider,
        testMode: !!testEmail,
        wouldValidate: !!validator
      });
      console.log(`      [DRY RUN] Would validate with ZeroBounce`);
      console.log(`      [DRY RUN] Would send via ${provider}${testEmail ? ` (redirected to ${testEmail})` : ''}`);
      stats.sent++;
      continue;
    }

    // Send email
    try {
      const result = await emailService.sendEmail(payload);

      if (result.success) {
        console.log(`      ✅ Sent (Message ID: ${result.messageId})`);
        stats.sent++;

        // Record to SentEmailTracker with partner info
        tracker.recordSent({
          email: vc.email,
          name: vc.name,
          partnerName: partnerName,
          type: 'vc',
          subject: payload.subject,
          sentAt: sentAt,
          messageId: result.messageId
        });

        // Update Notion status to "Sent"
        await updateVCStatus(vc.pageId, 'Sent', { sentAt });
      } else {
        console.log(`      ❌ Failed: ${result.error}`);
        stats.failed++;
      }

      // Rate limit between sends
      if (vcs.indexOf(vc) < vcs.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    } catch (error) {
      console.error(`      ❌ Error: ${error.message}`);
      stats.failed++;
    }
  }

  // Save results to temp file
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputFile = `/tmp/alygn-vc-sent-${timestamp}.json`;

  const results = {
    timestamp: sentAt,
    provider: provider,
    testMode: !!testEmail,
    stats: stats,
    vcs: vcs.map(vc => ({
      name: vc.name,
      email: vc.email,
      status: dryRun ? 'dry_run' : 'sent'
    }))
  };

  if (!dryRun) {
    fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
    console.log(`\n💾 Results saved to: ${outputFile}`);
  }

  if (dryRun) {
    // Output dry-run JSON to stdout
    const dryRunReport = {
      dryRun: true,
      timestamp: new Date().toISOString(),
      script: 'send-approved-emails.js',
      summary: {
        total: stats.total,
        wouldSend: dryRunOperations.length,
        wouldFail: stats.failed,
        wouldSkip: stats.skipped,
        wouldBlock: stats.invalid,
        wouldRisk: stats.risky
      },
      operations: dryRunOperations,
      files: {
        wouldCreate: [`/tmp/alygn-vc-sent-${timestamp}.json`]
      },
      provider: provider,
      testMode: !!testEmail,
      testEmail: testEmail || null
    };

    console.log('\n' + '='.repeat(60));
    console.log('\nDRY RUN OUTPUT:\n');
    console.log(JSON.stringify(dryRunReport, null, 2));
    console.log('='.repeat(60) + '\n');
  } else {
    console.log('\n' + '='.repeat(60));
    console.log(`\n✅ Sending complete!`);
    console.log(`   Total: ${stats.total}`);
    console.log(`   Sent: ${stats.sent}`);
    console.log(`   Failed: ${stats.failed}`);
    console.log(`   Skipped: ${stats.skipped}`);
    console.log(`   Blocked (invalid): ${stats.invalid}`);
    console.log(`   Risky: ${stats.risky}`);
    console.log('='.repeat(60) + '\n');
  }
}

// Run
if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  main().catch(error => {
    console.error('❌ Error:', error.message);
    process.exit(1);
  });
}

export { createEmailPayload, getApprovedVCs, getVCStatusFromNotion, updateVCStatus };
