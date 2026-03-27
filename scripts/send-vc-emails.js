/**
 * ALYGN Send VC Emails - Generates drafts and sends
 */

import { Client } from '@notionhq/client';
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';
import { getNotionKey } from './shared/load-credentials.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WORKSPACE_ROOT = path.resolve(process.env.HOME, '.openclaw/workspace');
const ALYGN_DIR = path.resolve(WORKSPACE_ROOT, 'scripts/alygn');
const LIB_DIR = path.resolve(ALYGN_DIR, 'lib');
const EMAIL_DIR = path.resolve(LIB_DIR, 'email');

const notion = new Client({ auth: getNotionKey() });

const emailTemplateModule = await import(path.join(ALYGN_DIR, 'lib/outreach-email-template.js'));
const { generateEmailHTML } = emailTemplateModule;

const EmailServiceModule = await import(path.join(EMAIL_DIR, 'EmailService.js'));
const { EmailService } = EmailServiceModule;

const credentialsPath = path.resolve(WORKSPACE_ROOT, 'config/credentials.json');
const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));

const DATABASE_ID = '30533487-4af6-81e7-ad64-000bbd4829ff';

const CONFIG = {
  databaseId: DATABASE_ID,
  ccRecipient: 'tanialeaidm@gmail.com'
};

function generateCustomHook(vc) {
  const focusText = vc.focusAreas?.join(' ')?.toLowerCase() || '';
  const notesText = vc.notes?.toLowerCase() || '';

  if (vc.name.includes('Air Street')) {
    return `Given Air Street Capital's focus on AI-native companies and your thesis on the intelligence era, you understand that governance infrastructure becomes the critical layer when frontier AI scales beyond traditional oversight mechanisms.`;
  }

  if (vc.name.includes('2048')) {
    return `Given 2048 Ventures' focus on technical founders and AI infrastructure, you recognize that coordination—not just capability—is what determines success as AI systems scale across organizational boundaries.`;
  }

  return `Given ${vc.name}'s focus on ${vc.focusAreas?.[0] || 'AI'}, you understand that governance becomes the critical challenge as frontier AI systems scale beyond traditional oversight mechanisms.`;
}

function generateCustomPS(vc) {
  if (vc.name.includes('Air Street')) {
    return `P.S.: Your thesis on the intelligence era aligns with our view that governance infrastructure must evolve alongside capability.`;
  }

  if (vc.name.includes('2048')) {
    return `P.S.: Your focus on technical founders building AI infrastructure resonates with our institutional approach to governance.`;
  }

  return `P.S.: ${vc.name}'s focus on ${vc.focusAreas?.[0] || 'AI'} resonates with our institutional approach to governance.`;
}

async function getApprovedVCs(sendToList) {
  console.log('📦 Loading approved VCs from Notion...');

  try {
    const response = await notion.dataSources.query({
      data_source_id: DATABASE_ID,
      filter: {
        property: 'Draft Status',
        select: {
          equals: 'Approved'
        }
      },
      page_size: 20
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
      };
    }).filter(vc => vc.email && sendToList.includes(vc.id));

    console.log(`   Found ${vcs.length} approved VCs with emails\n`);
    return vcs;
  } catch (error) {
    console.error('❌ Failed to load VCs:', error.message);
    throw error;
  }
}

function generateEmailForVC(vc) {
  const partnerName = vc.partners ? vc.partners.split(',')[0].split('(')[0].trim() : 'there';
  const customHook = generateCustomHook(vc);
  const customPS = generateCustomPS(vc);

  // Determine variant
  const focusText = vc.focusAreas.join(' ').toLowerCase();
  const variant = focusText.includes('infrastructure') || focusText.includes('enterprise')
    ? 'institutional'
    : 'governance';

  // Generate subject lines
  const subjects = {
    optionA: 'AI Governance Infrastructure',
    optionB: 'Coordination Before Crisis',
    optionC: 'Independent AI Oversight',
    recommended: 'A (clear, institutional)'
  };

  // Generate email using template
  const emailResult = generateEmailHTML({
    recipientName: partnerName,
    companyName: vc.name,
    painPoints: vc.painPoints || [],
    variant: variant,
    language: 'en',
    subject: subjects.optionA,
    customHook,
    customPS
  });

  return {
    subjects,
    emailHTML: emailResult.html,
    emailText: emailResult.text,
    partnerName,
    variant
  };
}

async function initializeEmailService() {
  const config = {
    server: credentials?.email?.smtp?.server,
    port: credentials?.email?.smtp?.port,
    user: credentials?.email?.address,
    password: credentials?.email?.smtp?.password,
    secure: false
  };

  const service = new EmailService('smtp', config);
  const valid = await service.validateConfig();

  if (!valid) {
    throw new Error('Failed to validate SMTP configuration');
  }

  return service;
}

async function updateVCStatus(pageId, status) {
  try {
    await notion.pages.update({
      page_id: pageId,
      properties: {
        'Status': { select: { name: status } },
        'Draft Status': { select: { name: 'Sent' } },
        'Last Contacted': { date: { start: new Date().toISOString() } }
      }
    });
    console.log(`   ✅ Updated Notion status to "Sent"`);
  } catch (error) {
    console.error(`   ⚠️  Failed to update Notion:`, error.message);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const sendToArg = args.find(a => a.startsWith('--email-send-to='));

  if (!sendToArg) {
    console.error('❌ Error: --email-send-to required');
    console.log('Usage: node send-vc-emails.js --email-send-to=vc-hC5bXd,vc-zTC37p');
    process.exit(1);
  }

  const sendToList = sendToArg.split('=')[1].split(',').filter(id => id.trim());

  console.log('🚀 ALYGN Send VC Emails\n');
  console.log(`   Date: ${new Date().toISOString()}`);
  console.log(`   Send To: ${sendToList.join(', ')}\n`);

  let emailService;
  try {
    emailService = await initializeEmailService();
    console.log(`   ✅ Email service initialized (SMTP)\n`);
  } catch (error) {
    console.error(`   ❌ Failed to initialize email service:`, error.message);
    process.exit(1);
  }

  const vcs = await getApprovedVCs(sendToList);

  if (vcs.length === 0) {
    console.log('⚠️  No approved VCs with emails found!\n');
    return;
  }

  const results = {
    sent: [],
    failed: []
  };

  console.log('📧 Sending emails:\n');

  for (const vc of vcs) {
    console.log(`   📤 ${vc.name} (${vc.email})`);

    const draft = generateEmailForVC(vc);

    const payload = {
      to: vc.email,
      subject: draft.subjects.optionA,
      html: draft.emailHTML,
      text: draft.emailText,
      from: 'Alygn R&D <outreach@alyygn.com>',
      cc: CONFIG.ccRecipient,
      headers: {
        'X-Campaign': 'vc-wave-1',
        'X-Variant': draft.variant,
        'X-VC-Name': vc.name
      }
    };

    console.log(`      Subject: ${payload.subject}`);
    console.log(`      Partner: ${draft.partnerName}`);
    console.log(`      Variant: ${draft.variant}`);
    console.log(`      CC: ${CONFIG.ccRecipient}`);

    try {
      const result = await emailService.sendEmail(payload);

      if (result.success) {
        console.log(`      ✅ Sent (Message ID: ${result.messageId})`);
        results.sent.push({
          name: vc.name,
          email: vc.email,
          messageId: result.messageId
        });
        await updateVCStatus(vc.pageId, 'Sent');
      } else {
        console.log(`      ❌ Failed: ${result.error}`);
        results.failed.push({
          name: vc.name,
          email: vc.email,
          error: result.error
        });
      }

      // Rate limit
      if (vcs.indexOf(vc) < vcs.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    } catch (error) {
      console.error(`      ❌ Error: ${error.message}`);
      results.failed.push({
        name: vc.name,
        email: vc.email,
        error: error.message
      });
    }

    console.log('');
  }

  // Save results
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputFile = `${process.env.HOME}/.openclaw/workspace/reports/alygn/vc-sent/alygn-vc-sent-${timestamp}.json`;
  fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));

  console.log('\n' + '='.repeat(60));
  console.log(`\n✅ Sending complete!`);
  console.log(`   Sent: ${results.sent.length}`);
  console.log(`   Failed: ${results.failed.length}`);
  console.log(`\n   Results saved to: ${outputFile}`);
  console.log('='.repeat(60) + '\n');

  // Return summary
  console.log('📊 MESSAGE IDs:');
  results.sent.forEach(r => {
    console.log(`   ${r.name}: ${r.messageId}`);
  });
}

main().catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});
