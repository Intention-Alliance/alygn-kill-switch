/**
 * Email Sender Script - SMTP + Template Oficial Alygn
 * Sends personalized emails via Gmail SMTP using official Alygn template
 * 
 * Usage:
 *   node email-sender-smtp-v2.js --input=/tmp/muni-cr-approved-fixed.json
 */

import fs from "fs";
import nodemailer from "nodemailer";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load official Alygn email template
const templatePath = path.join(__dirname, '../../lib/outreach-email-template.js');
const emailTemplate = await import(templatePath);

// Load credentials
const credentialsPath = path.join(process.cwd(), 'config', 'credentials.json');
const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));

const SMTP_CONFIG = {
  server: credentials.email.smtp.server,
  port: credentials.email.smtp.port,
  user: credentials.email.address,
  password: credentials.email.smtp.password
};

const MOCK_MODE = process.argv.includes('--mock');

/**
 * Create SMTP transporter
 */
function createTransporter() {
  return nodemailer.createTransport({
    host: SMTP_CONFIG.server,
    port: SMTP_CONFIG.port,
    secure: false,
    auth: {
      user: SMTP_CONFIG.user,
      pass: SMTP_CONFIG.password
    }
  });
}

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
  
  if (mock) {
    console.log('⚠️  Mock mode - simulating send');
    return simulateSend(municipalities);
  }
  
  const transporter = createTransporter();
  
  const results = {
    sent_at: new Date().toISOString(),
    total: municipalities.length,
    sent: 0,
    failed: 0,
    campaigns: {}
  };
  
  for (const muni of municipalities) {
    try {
      const email = buildEmail(muni);
      const result = await sendSingleEmail(transporter, muni, email);
      results.sent++;
      results.campaigns[muni.name] = result;
      console.log(`✅ Sent to ${muni.name}`);
    } catch (error) {
      console.error(`❌ Error sending to ${muni.name}:`, error.message);
      results.failed++;
      results.campaigns[muni.name] = {
        status: 'error',
        error: error.message
      };
    }
  }
  
  console.log(`\n✅ Sent: ${results.sent}/${results.total}`);
  return results;
}

/**
 * Sends single email via SMTP
 */
async function sendSingleEmail(transporter, municipality, email) {
  const recipientEmail = municipality.contacts?.mayor_email;
  
  if (!recipientEmail) {
    throw new Error('No email address found');
  }
  
  const mailOptions = {
    from: `Alygn Governance <${SMTP_CONFIG.user}>`,
    to: recipientEmail,
    subject: email.subject,
    text: email.text,
    html: email.html
  };
  
  const info = await transporter.sendMail(mailOptions);
  
  return {
    status: 'sent',
    message_id: info.messageId,
    sent_at: new Date().toISOString(),
    to: recipientEmail,
    subject: email.subject,
    template: 'outreach-email-template.js'
  };
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
  const municipalities = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
  
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
