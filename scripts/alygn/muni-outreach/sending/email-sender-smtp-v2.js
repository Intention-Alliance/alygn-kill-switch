/**
 * Email Sender Script - SMTP + Template Oficial Alygn
 * Sends personalized emails via Gmail SMTP using official Alygn template
 * 
 * Usage:
 *   node email-sender-smtp-v2.js --input=/tmp/muni-cr-approved-fixed.json [--mock] [--approved]
 * 
 * Flags:
 *   --mock      Simulate sending (dry run)
 *   --approved  Required for live email sending (safety flag)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { sendEmail, sendEmailsBatch } from "../../lib/email-sender.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load official Alygn email template
const templatePath = path.join(__dirname, '../../lib/outreach-email-template.js');
const emailTemplate = await import(templatePath);

const MOCK_MODE = process.argv.includes('--mock');
const APPROVED = process.argv.includes('--approved');

/**
 * Build email using official Alygn template with dynamic parameters
 */
function buildEmail(municipality) {
  const outreach = municipality.outreach;
  const mayorName = municipality.contacts?.mayor_name || 'Alcalde/Alcaldesa';
  
  // Convert plain text body to HTML if needed
  const bodyHtml = outreach.bodyHtml || `<p>${outreach.body.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>`;
  
  // Generate email using new dynamic API
  const email = emailTemplate.generateEmail({
    recipientName: mayorName,
    municipality: municipality.name,
    painPoints: municipality.painPoints?.join(', ') || '', // Add this
    subject: outreach.subject,
    bodyHtml: bodyHtml,
    bodyText: outreach.body,
    variant: outreach.variant || 'institutional',
    footer: outreach.footer, // Optional custom footer
    useCid: false // Use base64 inline (more compatible)
  });
  
  return email;
}

/**
 * Sends emails to municipalities
 */
async function sendEmails(municipalities, mock = false) {
  console.log(`📧 Sending emails to ${municipalities.length} municipalities...`);
  console.log(`   Using official Alygn template`);
  
  // Safety check: require --approved flag for live sends
  if (!mock && !APPROVED) {
    console.log('⚠️  Safety: Use --approved flag to send live emails. Running in mock mode.');
    return simulateSend(municipalities);
  }
  
  if (mock) {
    console.log('⚠️  Mock mode - simulating send');
    return simulateSend(municipalities);
  }
  
  // Build email objects for batch sending
  const emails = municipalities.map(muni => {
    const email = buildEmail(muni);
    return {
      id: muni.name,
      to: muni.contacts?.mayor_email,
      subject: email.subject,
      htmlBody: email.html,
      textBody: email.text
    };
  });
  
  // Use shared batch sender
  const results = await sendEmailsBatch(emails, { rateLimitMs: 0, mock: false });
  
  // Transform results to match expected format
  const transformedResults = {
    sent_at: results.sent_at,
    total: results.total,
    sent: results.sent,
    failed: results.failed,
    campaigns: {}
  };
  
  // Transform campaign results
  for (const [key, value] of Object.entries(results.campaigns)) {
    transformedResults.campaigns[key] = {
      status: value.success ? 'sent' : 'error',
      message_id: value.messageId,
      sent_at: results.sent_at,
      to: value.to,
      subject: value.subject,
      template: 'outreach-email-template.js',
      error: value.error
    };
  }
  
  console.log(`\n✅ Sent: ${transformedResults.sent}/${transformedResults.total}`);
  return transformedResults;
}

/**
 * Simulates email sending (mock mode)
 */
function simulateSend(municipalities) {
  const results = {
    sent_at: new Date().toISOString(),
    total: municipalities.length,
    sent: municipalities.length,
    failed: 0,
    campaigns: {},
    mock: true
  };
  
  municipalities.forEach((muni, index) => {
    const email = buildEmail(muni);
    results.campaigns[muni.name] = {
      status: 'sent (mock)',
      message_id: `mock-msg-${index + 1}`,
      campaign_id: `alygn-muni-wave1-${muni.outreach.variant}`,
      sent_at: new Date().toISOString(),
      to: muni.contacts?.mayor_email,
      subject: email.subject,
      template: 'outreach-email-template.js',
      mock: true
    };
  });
  
  console.log(`✅ Simulated send: ${municipalities.length} emails`);
  return results;
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const inputArg = args.find(a => a.startsWith('--input='));
  
  if (!inputArg) {
    console.error('Usage: node email-sender-smtp-v2.js --input=/path/to/approved.json [--mock]');
    process.exit(1);
  }
  
  const inputFile = inputArg.split('=')[1];
  const data = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
  const municipalities = data.municipalities || data;
  
  const results = await sendEmails(municipalities, MOCK_MODE);
  
  // Save results
  const outputFile = '/tmp/muni-sent.json';
  fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
  console.log(`💾 Saved to ${outputFile}`);
  
  console.log('\n📊 Send Summary:');
  console.log(`   Total approved: ${results.total}`);
  console.log(`   Sent: ${results.sent}`);
  console.log(`   Failed: ${results.failed}`);
  console.log(`   Mode: ${MOCK_MODE ? 'MOCK' : 'LIVE'}`);
  console.log(`   Template: outreach-email-template.js`);
}

main().catch(console.error);
