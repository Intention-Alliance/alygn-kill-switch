#!/usr/bin/env node
/**
 * Unified Email Sender for ALYGN Outreach
 * Handles both VC and Municipal outreach with auto-detection
 * 
 * Usage:
 *   node email-sender-smtp-v2.js --input=/tmp/vc-2026-03-17.json --approved
 *   node email-sender-smtp-v2.js --input=/tmp/muni-personalized.json --approved
 * 
 * Auto-detects type from:
 *   - File path (vc-* vs muni-*)
 *   - JSON structure
 * 
 * Tracking:
 *   - VC → Notion database
 *   - Muni → Supabase database
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';
import { sendEmail, createTransporter } from "./email-sender.js";
import { generateEmail, generateEmailHTML } from "./outreach-email-template.js";
import { validateLanguage } from "./language-validator.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration
const CONFIG = {
  discordChannel: '1471206314435809431', // #annotations
  rateLimit: 3000, // ms between sends
  defaultLimit: 10,
};

/**
 * Detect outreach type from file path and content
 * @param {string} filePath - Path to JSON file
 * @param {Object} data - Parsed JSON data
 * @returns {string} 'vc' | 'muni' | 'unknown'
 */
function detectOutreachType(filePath, data) {
  // Check file name pattern
  const fileName = path.basename(filePath).toLowerCase();
  if (fileName.startsWith('vc-')) return 'vc';
  if (fileName.startsWith('muni-')) return 'muni';
  
  // Check data structure
  if (data.vcs && Array.isArray(data.vcs)) return 'vc';
  if (data.municipalities && Array.isArray(data.municipalities)) return 'muni';
  if (data.vc && data.vc.name) return 'vc';
  if (data.name && data.mayor_email) return 'muni';
  
  return 'unknown';
}

/**
 * Load emails from JSON file (unified for VC and Muni)
 */
async function loadEmails(inputFile, limit = CONFIG.defaultLimit) {
  if (!fs.existsSync(inputFile)) {
    throw new Error(`Input file not found: ${inputFile}`);
  }
  
  const data = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
  const type = detectOutreachType(inputFile, data);
  
  console.log(`📧 Detected outreach type: ${type.toUpperCase()}`);
  console.log(`   File: ${inputFile}`);
  
  let emails = [];
  
  if (type === 'vc') {
    // VC structure: { vcs: [...] } or array of VC objects
    const vcs = data.vcs || data;
    emails = vcs.slice(0, limit).map(vc => ({
      id: vc.pageId || vc.id,
      type: 'vc',
      name: vc.vc?.name || vc.name,
      email: vc.vc?.email || vc.email,
      subject: vc.subject || vc.subjects?.optionA,
      bodyHtml: vc.bodyHtml,
      bodyText: vc.bodyText,
      recipientName: vc.recipientName || vc.vc?.contactName,
      companyName: vc.vc?.name || vc.name,
      painPoints: vc.painPoints,
      variant: vc.variant || 'governance',
      status: vc.status || 'pending',
    }));
  } else if (type === 'muni') {
    // Muni structure: { municipalities: [...] }
    const municipalities = data.municipalities || [data];
    emails = municipalities.slice(0, limit).map(muni => ({
      id: muni.id || muni.pageId,
      type: 'muni',
      name: muni.name,
      email: muni.contacts?.mayor_email || muni.mayor_email || muni.email,
      subject: muni.outreach?.subject,
      bodyHtml: muni.outreach?.bodyHtml,
      bodyText: muni.outreach?.body,
      recipientName: muni.contacts?.mayor_name || muni.mayor_name,
      municipality: muni.name,
      painPoints: muni.painPoints?.join(', '),
      variant: muni.outreach?.variant || 'governance',
      status: muni.outreach?.status || 'pending',
    }));
  }
  
  // Filter only ready emails
  emails = emails.filter(e => e.status === 'approved' || e.status === 'ready' || e.status === 'pending');
  
  return { type, emails: emails.slice(0, limit) };
}

/**
 * Build email using unified template
 */
function buildUnifiedEmail(emailData) {
  const { type } = emailData;
  
  if (type === 'vc') {
    // Use VC template (generateEmailHTML)
    return generateEmailHTML({
      recipientName: emailData.recipientName,
      companyName: emailData.companyName,
      subject: emailData.subject,
      bodyHtml: emailData.bodyHtml || '',
      bodyText: emailData.bodyText || '',
      painPoints: emailData.painPoints,
      variant: emailData.variant,
      useCid: false,
    });
  } else {
    // Use Muni template (generateEmail)
    return generateEmail({
      recipientName: emailData.recipientName,
      municipality: emailData.municipality,
      subject: emailData.subject,
      bodyHtml: emailData.bodyHtml || '',
      bodyText: emailData.bodyText || '',
      painPoints: emailData.painPoints,
      variant: emailData.variant,
      useCid: false,
    });
  }
}

/**
 * Update tracking after send
 */
async function updateTracking(emailData, messageId, sentDate) {
  const { type, id } = emailData;
  
  if (type === 'vc') {
    // Update Notion for VC
    try {
      const { getClient } = await import("../vc-outreach/core/notion-utils.js");
      const notion = getClient();
      
      await notion.pages.update({
        page_id: id,
        properties: {
          'Status': { select: { name: 'Sent' } },
          'Sent Date': { date: { start: sentDate } },
          'Notes': { 
            rich_text: [{ 
              text: { content: `Sent: ${sentDate} | Message ID: ${messageId}` }
            }]
          }
        }
      });
      console.log(`   ✅ Updated Notion: ${id}`);
    } catch (error) {
      console.error(`   ⚠️  Failed to update Notion: ${error.message}`);
    }
  } else {
    // Update Supabase for Muni
    try {
      const { updateSentStatus } = await import("../muni-outreach/core/supabase-utils.ts");
      await updateSentStatus(id, messageId, sentDate, {
        subject: emailData.subject,
        body: emailData.bodyText || '',
        variant: emailData.variant,
        recipientName: emailData.recipientName,
        recipientEmail: emailData.email,
      });
      console.log(`   ✅ Updated Supabase: ${id}`);
    } catch (error) {
      console.error(`   ⚠️  Failed to update Supabase: ${error.message}`);
    }
  }
}

/**
 * Main sending workflow
 */
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const approved = args.includes('--approved');
  const inputArg = args.find(a => a.startsWith('--input='));
  const limitArg = args.find(a => a.startsWith('--limit='));
  
  if (!inputArg) {
    console.error('Usage: node email-sender-smtp-v2.js --input=/path/to/emails.json [--limit=5] [--approved]');
    process.exit(1);
  }
  
  const inputFile = inputArg.split('=')[1];
  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : CONFIG.defaultLimit;
  
  console.log('🚀 ALYGN Unified Email Sender\n');
  console.log(`   Input: ${inputFile}`);
  console.log(`   Limit: ${limit}`);
  console.log(`   Mode: ${dryRun ? 'DRY RUN' : (approved ? 'LIVE' : 'PREVIEW')}`);
  console.log();
  
  // Load emails
  const { type, emails } = await loadEmails(inputFile, limit);
  
  if (emails.length === 0) {
    console.log('✅ No emails ready to send\n');
    return;
  }
  
  console.log(`📋 Loaded ${emails.length} ${type} emails:\n`);
  emails.forEach((e, i) => {
    console.log(`   ${i + 1}. ${e.name} → ${e.email}`);
    console.log(`      Subject: ${e.subject?.substring(0, 60)}...`);
  });
  console.log();
  
  // Safety check
  if (!dryRun && !approved) {
    console.log('⚠️  SAFETY: Use --approved to send live emails\n');
    console.log('   Running in preview mode (no emails sent)\n');
    return;
  }
  
  // Send emails
  const stats = { sent: 0, failed: 0, updated: 0 };
  
  for (let i = 0; i < emails.length; i++) {
    const email = emails[i];
    
    console.log('='.repeat(60));
    console.log(`\n📬 [${i + 1}/${emails.length}] ${email.name}\n`);
    console.log(`   To: ${email.email}`);
    console.log(`   Type: ${email.type.toUpperCase()}`);
    
    try {
      // Build email with template
      const built = buildUnifiedEmail(email);
      
      // Issue #41: Language validation before send (municipal outreach)
      if (email.type === 'muni') {
        const validation = validateLanguage(
          { subject: built.subject, body: built.html },
          'es' // Municipal emails should be in Spanish
        );
        
        if (!validation.valid) {
          console.error(`   ⚠️  BLOCKED: ${validation.warning}`);
          stats.failed++;
          continue; // Skip this email
        }
        
        if (validation.warning) {
          console.log(`   ⚠️  Warning: ${validation.warning}`);
        } else {
          console.log(`   ✅ Language validated: ${validation.detected.toUpperCase()}`);
        }
      }
      
      if (dryRun) {
        console.log(`   ✅ DRY RUN - Would send: ${built.subject}`);
        stats.sent++;
        continue;
      }
      
      // Send via SMTP
      const result = await sendEmail({
        to: email.email,
        subject: built.subject,
        htmlBody: built.html,
        textBody: email.bodyText || built.html.replace(/<[^>]+>/g, '')
      });
      
      if (result.success) {
        console.log(`   ✅ Sent: ${result.messageId}`);
        stats.sent++;
        
        // Update tracking
        await updateTracking(email, result.messageId, new Date().toISOString());
        stats.updated++;
      } else {
        console.error(`   ❌ Failed: ${result.error}`);
        stats.failed++;
      }
      
      // Rate limiting
      if (i < emails.length - 1) {
        console.log(`   ⏱️  Waiting ${CONFIG.rateLimit}ms...`);
        await new Promise(r => setTimeout(r, CONFIG.rateLimit));
      }
      
    } catch (error) {
      console.error(`   ❌ Error: ${error.message}`);
      stats.failed++;
    }
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 Send Summary:\n');
  console.log(`   Type: ${type.toUpperCase()}`);
  console.log(`   Total: ${emails.length}`);
  console.log(`   Sent: ${stats.sent}`);
  console.log(`   Failed: ${stats.failed}`);
  console.log(`   Updated: ${stats.updated}`);
  console.log(`   Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log();
}

main().catch(error => {
  console.error(`\n❌ Fatal error: ${error.message}`);
  process.exit(1);
});
