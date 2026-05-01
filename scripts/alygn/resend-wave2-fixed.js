/**
 * Re-send Wave 2 emails with corrected HTML bodies
 * Uses nodemailer directly (what EmailService wraps)
 * Reads from Supabase outreach_emails, sends via SMTP
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import nodemailer from 'nodemailer';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_KEY');
  process.exit(1);
}

const DRY_RUN = process.argv.includes('--dry-run');
const APPROVED = process.argv.includes('--approved');

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Load credentials
const credentialsPath = path.join(process.env.HOME, '.openclaw/workspace/config/credentials.json');
const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));

const FROM_EMAIL = `"Alygn R&D" <${credentials.email.address}>`;
const CC_EMAIL = 'tanialeaidm@gmail.com';
const RATE_LIMIT_MS = 3000;

// Create transporter
const transporter = nodemailer.createTransport({
  host: credentials.email.smtp.server,
  port: credentials.email.smtp.port,
  secure: false,
  auth: {
    user: credentials.email.address,
    pass: credentials.email.smtp.password
  }
});

async function main() {
  console.log('📧 Wave 2 Re-send (Fixed HTML Bodies)');
  console.log('=====================================');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : APPROVED ? 'LIVE' : 'NEEDS --approved'}`);
  console.log('');

  // Fetch the 14 wave 2 emails (sent today)
  const { data: emails, error } = await supabase.from('outreach_emails')
    .select('id, recipient_name, recipient_email, subject, body')
    .eq('status', 'sent')
    .gte('sent_at', '2026-04-28')
    .order('recipient_name');

  if (error) {
    console.error('❌ Failed to fetch emails:', error.message);
    process.exit(1);
  }

  console.log(`📋 Found ${emails.length} emails to re-send with corrected HTML\n`);

  if (!APPROVED && !DRY_RUN) {
    console.log('⚠️  Use --approved flag to send live emails. Running dry run.\n');
  }

  const isLive = APPROVED && !DRY_RUN;
  const results = { sent: 0, failed: 0, total: emails.length, details: [] };

  for (let i = 0; i < emails.length; i++) {
    const email = emails[i];
    const num = i + 1;

    console.log(`[${num}/${emails.length}] ${email.recipient_name} → ${email.recipient_email}`);
    console.log(`  Subject: ${email.subject}`);

    // Verify body is HTML, not JSON
    const body = email.body;
    const isHtml = body.startsWith('<!DOCTYPE') || body.startsWith('<html') || body.startsWith('<!--');
    if (!isHtml) {
      console.log(`  ❌ Body is NOT HTML, skipping (starts with: ${body.substring(0, 30)})`);
      results.failed++;
      results.details.push({ id: email.id, name: email.recipient_name, status: 'skipped', reason: 'not-html' });
      continue;
    }

    if (DRY_RUN || !isLive) {
      console.log(`  ✅ DRY RUN - would re-send with corrected HTML`);
      results.sent++;
      results.details.push({ id: email.id, name: email.recipient_name, status: 'dry_run' });
      continue;
    }

    try {
      const info = await transporter.sendMail({
        from: FROM_EMAIL,
        to: email.recipient_email,
        cc: CC_EMAIL,
        subject: email.subject,
        html: body,
        text: body.replace(/<[^>]+>/g, '').replace(/\s{3,}/g, '\n\n').trim()
      });

      console.log(`  ✅ Re-sent! MessageId: ${info.messageId}`);
      results.sent++;
      results.details.push({ id: email.id, name: email.recipient_name, status: 'resent', messageId: info.messageId });
    } catch (err) {
      console.log(`  ❌ Failed: ${err.message}`);
      results.failed++;
      results.details.push({ id: email.id, name: email.recipient_name, status: 'failed', error: err.message });
    }

    if (i < emails.length - 1 && isLive) {
      console.log(`  ⏳ Waiting ${RATE_LIMIT_MS / 1000}s...`);
      await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_MS));
    }
  }

  console.log('\n📊 Re-send Summary:');
  console.log(`   Total: ${results.total}`);
  console.log(`   Re-sent: ${results.sent}`);
  console.log(`   Failed: ${results.failed}`);
  console.log(`   Mode: ${DRY_RUN ? 'DRY RUN' : isLive ? 'LIVE' : 'DRY RUN (no --approved)'}`);

  const outputFile = '/tmp/wave2-resend-results.json';
  fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
  console.log(`\n💾 Results saved to ${outputFile}`);
}

main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
