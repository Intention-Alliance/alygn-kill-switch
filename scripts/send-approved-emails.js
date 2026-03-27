/**
 * ALYGN Send Approved Emails - Fixed for dataSources API
 */

import { Client } from '@notionhq/client';
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';
import { getNotionKey } from './shared/load-credentials.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WORKSPACE_ROOT = path.resolve(process.env.HOME, '.openclaw/workspace');
const SHARED_DIR = path.resolve(WORKSPACE_ROOT, 'scripts/shared');
const ALYGN_DIR = path.resolve(WORKSPACE_ROOT, 'scripts/alygn');
const LIB_DIR = path.resolve(ALYGN_DIR, 'lib');
const EMAIL_DIR = path.resolve(LIB_DIR, 'email');

const notion = new Client({ auth: getNotionKey() });

const emailTemplateModule = await import(path.join(ALYGN_DIR, 'lib/outreach-email-template.js'));
const { generateEmailHTML } = emailTemplateModule;

const EmailServiceModule = await import(path.join(EMAIL_DIR, 'EmailService.js'));
const EmailProviderFactoryModule = await import(path.join(EMAIL_DIR, 'EmailProviderFactory.js'));
const { EmailService } = EmailServiceModule;
const { EmailProviderFactory } = EmailProviderFactoryModule;

const credentialsPath = path.resolve(WORKSPACE_ROOT, 'config/credentials.json');
const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));

const DATABASE_ID = '30533487-4af6-81e7-ad64-000bbd4829ff';

const CONFIG = {
  databaseId: DATABASE_ID,
  defaultLimit: 10,
  defaultProvider: 'smtp',
  discordChannel: '1466532145257255004',
  ccRecipient: 'tanialeaidm@gmail.com'
};

async function getApprovedVCs(limit = CONFIG.defaultLimit, draftStatus = 'Approved', sendToList = []) {
  console.log('📦 Loading approved VCs from Notion...');
  console.log(`   Draft Status filter: "${draftStatus}"`);
  if (sendToList.length > 0) {
    console.log(`   Send list filter: ${sendToList.length} IDs specified`);
  }
  console.log('');

  try {
    const response = await notion.dataSources.query({
      data_source_id: DATABASE_ID,
      filter: {
        property: 'Draft Status',
        select: {
          equals: draftStatus
        }
      },
      page_size: limit * 2
    });

    let vcs = response.results.map(page => {
      const props = page.properties;

      return {
        pageId: page.id,
        id: props.ID?.rich_text?.[0]?.text?.content || page.id,
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
    }).filter(vc => vc.email);

    if (sendToList.length > 0) {
      const beforeCount = vcs.length;
      vcs = vcs.filter(vc => sendToList.includes(vc.id));
      console.log(`   Filtered by send list: ${beforeCount} → ${vcs.length} VCs`);
    }

    vcs = vcs.slice(0, limit);

    console.log(`   Found ${vcs.length} approved VCs with emails\n`);
    return vcs;
  } catch (error) {
    console.error('❌ Failed to load VCs:', error.message);
    throw error;
  }
}

function loadDraft(vcName) {
  try {
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

async function getVCStatusFromNotion(pageId) {
  try {
    const page = await notion.pages.retrieve({ page_id: pageId });
    return page.properties.Status?.select?.name || null;
  } catch (error) {
    console.error(`   ⚠️  Failed to get status from Notion:`, error.message);
    return null;
  }
}

async function updateVCStatus(pageId, status, metadata = {}) {
  try {
    const properties = {
      'Status': {
        select: { name: status }
      }
    };

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

    await notion.pages.update({
      page_id: pageId,
      properties
    });
    console.log(`   ✅ Updated Notion status to "${status}"`);
  } catch (error) {
    console.error(`   ⚠️  Failed to update Notion:`, error.message);
  }
}

function createEmailPayload(vc, draft, testEmail = null) {
  const recipient = testEmail || vc.email;
  const shouldAddCC = !testEmail;

  const payload = {
    to: recipient,
    subject: draft.subjects.optionA,
    html: draft.emailHTML,
    text: draft.emailText,
    from: 'Alygn R&D <outreach@alyygn.com>',
    cc: shouldAddCC ? CONFIG.ccRecipient : undefined,
    headers: {
      'X-Campaign': 'vc-wave-1',
      'X-Variant': draft.variant,
      'X-VC-Name': vc.name
    }
  };

  if (shouldAddCC) {
    console.log(`   📧 CC: ${CONFIG.ccRecipient}`);
  }

  return payload;
}

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

  const sentAt = new Date().toISOString();

  console.log('📧 Sending emails:\n');

  for (const vc of vcs) {
    console.log(`   📤 ${vc.name} (${vc.email})`);

    const draft = loadDraft(vc.name);
    if (!draft) {
      console.log(`      ⚠️  No draft found, skipping`);
      stats.skipped++;
      continue;
    }

    const currentStatus = await getVCStatusFromNotion(vc.pageId);
    if (currentStatus === 'Sent' || currentStatus === 'Invalid email') {
      console.log(`      ⏭️  BLOCKED: Status is "${currentStatus}"`);
      stats.skipped++;
      continue;
    }

    const payload = createEmailPayload(vc, draft, testEmail);

    if (dryRun) {
      console.log(`      [DRY RUN] Would send via ${provider}${testEmail ? ` (redirected to ${testEmail})` : ''}`);
      stats.sent++;
      continue;
    }

    try {
      const result = await emailService.sendEmail(payload);

      if (result.success) {
        console.log(`      ✅ Sent (Message ID: ${result.messageId})`);
        stats.sent++;
        await updateVCStatus(vc.pageId, 'Sent', { sentAt });
      } else {
        console.log(`      ❌ Failed: ${result.error}`);
        stats.failed++;
      }

      if (vcs.indexOf(vc) < vcs.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    } catch (error) {
      console.error(`      ❌ Error: ${error.message}`);
      stats.failed++;
    }
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputFile = `${process.env.HOME}/.openclaw/workspace/reports/alygn/vc-sent/alygn-vc-sent-${timestamp}.json`;

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

  console.log('\n' + '='.repeat(60));
  console.log(`\n✅ Sending complete!`);
  console.log(`   Total: ${stats.total}`);
  console.log(`   Sent: ${stats.sent}`);
  console.log(`   Failed: ${stats.failed}`);
  console.log(`   Skipped: ${stats.skipped}`);
  console.log('='.repeat(60) + '\n');
}

main().catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});
