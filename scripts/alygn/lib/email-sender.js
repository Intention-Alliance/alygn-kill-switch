/**
 * Shared Email Sender for Alygn Outreach Systems (Refactored)
 * Uses new EmailService with dependency injection
 * 
 * Usage:
 *   import { EmailServiceFactory } from './email-sender.js';
 *   
 *   // Create service with provider
 *   const service = await EmailServiceFactory.create('smtp');
 *   
 *   // Send email
 *   const result = await service.sendEmail({
 *     to: 'recipient@example.com',
 *     subject: 'Hello',
 *     html: '<p>Hello</p>',
 *     text: 'Hello'
 *   });
 * 
 * CLI Usage:
 *   node email-sender.js --provider=smtp --test-email=contact@andler.dev
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { EmailService } from "./email/EmailService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Parse CLI arguments
const args = process.argv.slice(2);
const TEST_EMAIL_ARG = args.find(a => a.startsWith('--test-email='));
const PROVIDER_ARG = args.find(a => a.startsWith('--provider='));
const DRY_RUN = args.includes('--dry-run');

const TEST_EMAIL = TEST_EMAIL_ARG ? TEST_EMAIL_ARG.split('=')[1] : null;
const PROVIDER = PROVIDER_ARG ? PROVIDER_ARG.split('=')[1] : 'smtp';

// Load credentials from config
function loadCredentials() {
  const credentialsPath = path.join(process.cwd(), 'config', 'credentials.json');
  if (!fs.existsSync(credentialsPath)) {
    throw new Error(`Credentials file not found: ${credentialsPath}`);
  }
  return JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
}

const credentials = loadCredentials();

/**
 * Create email service with appropriate provider configuration
 * @param {string} providerType - 'smtp' or 'smartlead'
 * @returns {Promise<EmailService>}
 */
export async function createEmailService(providerType = 'smtp') {
  let config;
  
  if (providerType === 'smtp') {
    config = {
      server: credentials.email.smtp.server,
      port: credentials.email.smtp.port,
      user: credentials.email.address,
      password: credentials.email.smtp.password,
      secure: false
    };
  } else if (providerType === 'smartlead') {
    config = {
      apiKey: process.env.SMARTLEAD_API_KEY,
      baseUrl: 'https://api.smartlead.ai/v1'
    };
  } else {
    throw new Error(`Unknown provider type: ${providerType}`);
  }
  
  const service = new EmailService(providerType, config);
  const valid = await service.validateConfig();
  
  if (!valid) {
    throw new Error(`Failed to validate ${providerType} configuration`);
  }
  
  return service;
}

/**
 * Simple email validation
 */
export function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Send single email (legacy compatibility)
 * @deprecated Use createEmailService().sendEmail() instead
 */
export async function sendEmail(options) {
  const service = await createEmailService(PROVIDER);
  
  if (TEST_EMAIL) {
    service.setTestEmail(TEST_EMAIL);
    console.log(`🧪 TEST MODE: All emails redirected to ${TEST_EMAIL}`);
  }
  
  const { to, subject, htmlBody, textBody, fromName = 'Alygn R&D', cc = 'tanialeaidm@gmail.com', mock = false } = options;
  
  if (mock || DRY_RUN) {
    const messageId = `alygn-mock-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    console.log(`📧 [MOCK] Would send to ${to}:`);
    console.log(`   Subject: ${subject}`);
    return {
      success: true,
      messageId,
      to,
      subject,
      mock: true
    };
  }
  
  return await service.sendEmail({
    to,
    subject,
    html: htmlBody,
    text: textBody,
    from: `${fromName} <${credentials.email.address}>`,
    cc
  });
}

/**
 * Send multiple emails with rate limiting (legacy compatibility)
 * @deprecated Use createEmailService().sendBatch() instead
 */
export async function sendEmailsBatch(emails, options = {}) {
  const service = await createEmailService(PROVIDER);
  
  if (TEST_EMAIL) {
    service.setTestEmail(TEST_EMAIL);
    console.log(`🧪 TEST MODE: All ${emails.length} emails redirected to ${TEST_EMAIL}`);
  }
  
  return await service.sendBatch(emails, {
    ...options,
    dryRun: DRY_RUN || options.mock
  });
}

// Legacy exports for compatibility
export { EmailService } from './email/EmailService.js';
export { EmailProviderFactory } from './email/EmailProviderFactory.js';

// Backwards compatibility
export const SMTP_CONFIG = {
  server: credentials.email.smtp.server,
  port: credentials.email.smtp.port,
  user: credentials.email.address,
  password: credentials.email.smtp.password
};

export default {
  createEmailService,
  sendEmail,
  sendEmailsBatch,
  validateEmail,
  EmailService
};

// CLI usage
if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  console.log('Alygn Email Service');
  console.log('===================\n');
  console.log('This module provides email sending functionality.');
  console.log('Import and use createEmailService(provider) to get started.\n');
  console.log('Example:');
  console.log('  import { createEmailService } from "./email-sender.js";');
  console.log('  const service = await createEmailService("smtp");');
  console.log('  await service.sendEmail({ to, subject, html, text });\n');
}
