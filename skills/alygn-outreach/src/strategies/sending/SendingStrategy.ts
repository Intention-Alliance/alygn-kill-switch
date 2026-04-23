/**
 * SendingStrategy - Sends emails using existing EmailService
 */
import fs from 'fs';
import path from 'path';
import type { OutreachEntity } from '../../entities/OutreachEntity';

interface SendingResult {
  success: boolean;
  messageId?: string;
  error?: string;
  testMode?: boolean;
  originalTo?: string;
  skipped?: boolean;
  reason?: string;
  wouldSend?: boolean;
  previouslySentAt?: string;
  provider?: string;
  // Contact fallback fields
  fallbackMethod?: 'email' | 'generic-email' | 'form' | 'linkedin' | 'manual';
  fallbackDetails?: Record<string, unknown>;
}

interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

interface SentEmailEntry {
  email: string;
  name: string;
  partnerName: string | null;
  vcName: string;
  subject: string;
  sentAt: string;
  messageId: string;
}

export class SendingStrategy {
  protected config: Record<string, unknown>;
  protected emailService: EmailService | null;

  constructor(config: Record<string, unknown> = {}) {
    this.config = config;
    this.emailService = null;
  }

  /**
   * Initialize email service
   */
  async initialize(): Promise<void> {
    const providerType = (this.config.providerType as string) || 'smtp';

    // Load credentials from file if not provided in config
    let providerConfig = (this.config.providerConfig as Record<string, unknown>) || {};

    if (Object.keys(providerConfig).length === 0) {
      const credentials = this.loadCredentials();
      if (credentials?.email?.smtp) {
        providerConfig = {
          server: credentials.email.smtp.server,
          port: credentials.email.smtp.port,
          user: credentials.email.address,
          password: credentials.email.smtp.password,
          secure: credentials.email.smtp.secure || false
        };
        console.log('   📧 Loaded SMTP credentials from config');
      }
    }

    // Use local EmailService with async initialization
    try {
      const { EmailService } = await import('../../lib/email/EmailService');
      this.emailService = new EmailService(providerType, providerConfig);
      // Initialize synchronously - provider will be created lazily on first send
    } catch (err) {
      const error = err as Error;
      console.warn('   ⚠️  Could not load EmailService:', error.message);
    }

    // Set test email if configured
    if (this.config.testEmail && this.emailService) {
      this.emailService.setTestEmail(this.config.testEmail as string);
    }
  }

  /**
   * Load credentials from config file
   */
  private loadCredentials(): Record<string, unknown> | null {
    try {
      // Self-contained: check skill's config first, then fallback to legacy
      const configPath = path.resolve(__dirname, '../../../config/credentials.json');
      if (fs.existsSync(configPath)) {
        return JSON.parse(fs.readFileSync(configPath, 'utf8'));
      }
      // Legacy fallback
      const legacyPath = path.join(process.env.HOME || '', '.openclaw/workspace/config/credentials.json');
      if (fs.existsSync(legacyPath)) {
        return JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
      }
    } catch (error) {
      console.error('⚠️  Failed to load credentials:', (error as Error).message);
    }
    return null;
  }

  /**
   * Send email to entity
   */
  async send(
    entity: OutreachEntity,
    options: Record<string, unknown> = {}
  ): Promise<SendingResult> {
    if (!this.emailService) {
      await this.initialize();
    }

    const dryRun = (options.dryRun as boolean) || false;
    const draftStatus = (options.draftStatus as string) || 'Approved';
    const sendToList = (options.sendToList as string[]) || [];

    // TWO-FILTER SYSTEM
    // Filter 1: Check Draft Status
    const entityDraftStatus = entity.draftStatus || 'Not drafted';
    if (entityDraftStatus !== draftStatus) {
      console.log(`   ⏭️  FILTERED OUT: Draft status is "${entityDraftStatus}", required "${draftStatus}"`);
      return {
        success: false,
        skipped: true,
        reason: `Draft status mismatch: ${entityDraftStatus} !== ${draftStatus}`
      };
    }

    // Filter 2: Check Explicit Send List (if provided)
    if (sendToList.length > 0 && !sendToList.includes(entity.id)) {
      console.log(`   ⏭️  FILTERED OUT: Entity ID "${entity.id}" not in send list`);
      return {
        success: false,
        skipped: true,
        reason: 'Not in explicit send list'
      };
    }

    // CONTACT FALLBACK CHAIN
    // When no direct email or only generic email, trigger fallback:
    // email → generic-email → form → linkedin → manual
    const { handleContactFallback, isGenericEmail } = await import('./ContactFallbackStrategy');
    const fallbackResult = await handleContactFallback(entity);

    if (fallbackResult.method !== 'email' && fallbackResult.method !== 'generic-email') {
      // Non-email outreach (form, linkedin, manual) — return result for agent/human processing
      console.log(`   🔄 Fallback method: ${fallbackResult.method}`);
      console.log(`   📝 Reason: ${fallbackResult.reason}`);

      if (fallbackResult.details?.manualInstructions) {
        console.log(`\n${fallbackResult.details.manualInstructions}\n`);
      }

      return {
        success: true, // Successfully determined fallback method
        skipped: true,  // But email was NOT sent — needs alternate action
        reason: `FALLBACK: ${fallbackResult.method} — ${fallbackResult.reason}`,
        fallbackMethod: fallbackResult.method,
        fallbackDetails: fallbackResult.details
      };
    }

    // For generic emails, modify subject to include partner name
    if (fallbackResult.method === 'generic-email' && fallbackResult.details?.partnerName) {
      console.log(`   📧 Generic email detected — adding partner name to subject`);
      if (entity.personalizationContext) {
        const currentSubject = entity.personalizationContext.customSubject as string || '';
        if (!currentSubject.includes(fallbackResult.details.partnerName)) {
          entity.personalizationContext.customSubject = `For ${fallbackResult.details.partnerName}: ${currentSubject}`;
        }
      }
    }

    // For direct email, proceed with normal sending flow below

    // P0: Validate email format and domain before sending
    const emailValidation = await this.validateEmail(entity.email, entity.name);
    if (!emailValidation.valid) {
      console.error(`   ❌ ABORT: Email validation failed for ${entity.name}`);
      console.error(`   🚫 Reason: ${emailValidation.reason}`);
      return {
        success: false,
        error: `EMAIL_VALIDATION: ${emailValidation.reason}`
      };
    }

    // CRITICAL: Check if already sent FIRST - before any validation or processing
    const alreadySentResult = await this.checkAlreadySent(entity.email, entity.type);
    if (alreadySentResult.alreadySent) {
      console.log(`⏭️  SKIPPING: ${entity.name} (${entity.email}) already sent on ${new Date(alreadySentResult.sentAt || '').toLocaleDateString()}`);
      return {
        success: false,
        skipped: true,
        reason: 'Already sent',
        previouslySentAt: alreadySentResult.sentAt
      };
    }

    // Get subject from personalization context
    let subject = entity.personalizationContext?.customSubject as string | undefined;
    if (!subject) {
      subject = `Outreach from Alygn`; // Default fallback
    }

    const customBody = entity.personalizationContext?.customBody as { html?: string; subject?: string; text?: string } | string | undefined;

    // Handle customBody as object or string
    let html: string | undefined;
    if (customBody && typeof customBody === 'object') {
      html = customBody.html;
    } else if (typeof customBody === 'string') {
      html = customBody;
    }

    // CRITICAL: Template enforcement - emails MUST use proper HTML template
    if (!html) {
      console.error(`   ❌ ABORT: No personalized content for ${entity.name}`);
      console.error(`   🚫 Email sending blocked - template not loaded`);
      return {
        success: false,
        error: 'TEMPLATE_ENFORCEMENT: No personalized content available. Email not sent.'
      };
    }

    // ENHANCED TEMPLATE VALIDATION
    // 1. Check for DOCTYPE, opening and closing HTML tags
    const hasDoctype = html.includes('<!DOCTYPE html>');
    const hasHtmlOpen = html.includes('<html');
    const hasHtmlClose = html.includes('</html>');
    if (!hasDoctype || !hasHtmlOpen || !hasHtmlClose) {
      console.error(`   ❌ ABORT: Email content for ${entity.name} lacks proper HTML structure`);
      console.error(`   🚫 Missing: DOCTYPE=${!hasDoctype}, <html=${!hasHtmlOpen}, </html>=${!hasHtmlClose}`);
      return {
        success: false,
        error: 'TEMPLATE_ENFORCEMENT: Email body missing proper HTML structure (DOCTYPE, <html>, or </html>). Send aborted.'
      };
    }

    // 2. Check for ALYGN branding
    const hasAlygnBranding = html.includes('ALYGN') || html.includes('alygn') || html.includes('Alygn');
    if (!hasAlygnBranding) {
      console.error(`   ❌ ABORT: Email content for ${entity.name} missing Alygn branding`);
      return {
        success: false,
        error: 'TEMPLATE_ENFORCEMENT: Email body missing Alygn branding. Send aborted.'
      };
    }

    // 3. SIZE-BASED VALIDATION: Check if HTML matches expected template size
    // Baseline: Template HTML without personalization ≈ 3000-3500 bytes
    // With personalization: 3500-5000+ bytes depending on content
    const htmlSize = html.length;
    const MIN_TEMPLATE_SIZE = 3500;  // Minimum expected size for valid template
    const MAX_TEMPLATE_SIZE = 12000;  // Maximum expected size (increased per audit)

    if (htmlSize < MIN_TEMPLATE_SIZE) {
      console.error(`   ⚠️  Template size validation FAILED for ${entity.name}`);
      console.error(`   📊 Actual size: ${htmlSize} bytes`);
      console.error(`   📊 Expected minimum: ${MIN_TEMPLATE_SIZE} bytes`);
      console.error(`   🚫 Template appears to be incomplete or plain text.`);

      // ATTEMPT REGENERATION
      console.log(`   🔄 Attempting to regenerate template...`);
      const regenerated = await this.regenerateTemplate(entity, subject);

      if (regenerated && regenerated.html && regenerated.html.length >= MIN_TEMPLATE_SIZE) {
        console.log(`   ✅ Template regenerated successfully (${regenerated.html.length} bytes)`);
        html = regenerated.html;
        subject = regenerated.subject || subject;

        // Update entity with regenerated content
        if (!entity.personalizationContext) {
          entity.personalizationContext = {};
        }
        if (typeof entity.personalizationContext.customBody === 'object' && entity.personalizationContext.customBody !== null) {
          (entity.personalizationContext.customBody as any).html = html;
        } else {
          entity.personalizationContext.customBody = html;
        }
        entity.personalizationContext.customSubject = subject;

        // Persist the regenerated content
        await this.persistRegeneratedDraft(entity);
      } else {
        console.error(`   ❌ Template regeneration failed or still too small.`);
        console.error(`   🚫 ABORT: Cannot send email without valid template.`);
        return {
          success: false,
          error: `TEMPLATE_ENFORCEMENT: Template size validation failed (${htmlSize} < ${MIN_TEMPLATE_SIZE}). Regeneration failed. Send aborted.`
        };
      }
    }

    if (htmlSize > MAX_TEMPLATE_SIZE) {
      console.warn(`   ⚠️  Template size unusually large: ${htmlSize} bytes`);
      console.warn(`   📝 Proceeding with caution - verify content manually.`);
    }

    // Final validation after potential regeneration
    const finalValidation = html.includes('<!DOCTYPE html>') &&
                           (html.includes('<html') || html.includes('</html>')) &&
                           (html.includes('ALYGN') || html.includes('alygn')) &&
                           html.length >= MIN_TEMPLATE_SIZE;

    if (!finalValidation) {
      console.error(`   ❌ ABORT: Final template validation failed for ${entity.name}`);
      return {
        success: false,
        error: 'TEMPLATE_ENFORCEMENT: Final template validation failed after regeneration. Send aborted.'
      };
    }

    console.log(`   ✅ Template validation passed for ${entity.name} (${html.length} bytes)`);

    // P1 SECURITY: Basic HTML sanitization without external dependencies
    // NOTE: Using built-in sanitization to avoid bundling issues with isomorphic-dompurify
    console.log(`   🧹 Sanitizing HTML content...`);
    const sanitizedHtml = this.sanitizeHtmlBasic(html);

    if (sanitizedHtml.length < html.length * 0.8) {
      console.warn(`   ⚠️  HTML was significantly modified during sanitization`);
      console.warn(`   📊 Original: ${html.length} bytes, Sanitized: ${sanitizedHtml.length} bytes`);
    }

    // P0 CRITICAL: CC Tania Lea on ALL production emails (unless dry-run or test mode)
    // Tania's email: tanialeaidm@gmail.com
    // CC is required for VC and Municipal outreach per workflow specs
    const isTestMode = dryRun || (this.config.testEmail as boolean) || false;
    const ccEmails: string[] = [];
    
    if (!isTestMode) {
      ccEmails.push('tanialeaidm@gmail.com');
      console.log(`   📧 CC: tanialeaidm@gmail.com`);
    }

    const payload: EmailPayload = {
      to: entity.email,
      subject,
      html: sanitizedHtml,
      from: (this.config.fromEmail as string) || 'Alygn R&D <andrew@alygn.com>',
      cc: ccEmails.length > 0 ? ccEmails : undefined
    };

    if (dryRun) {
      console.log(`📧 [DRY RUN] Would send to ${entity.name} (${entity.email})`);
      console.log(`    Subject: ${subject}`);
      if (ccEmails.length > 0) {
        console.log(`    CC: ${ccEmails.join(', ')}`);
      }
      return {
        success: true,
        wouldSend: true,
        testMode: true,
        to: entity.email,
        subject,
        cc: ccEmails
      };
    }

    console.log(`📧 Sending email to ${entity.name} (${entity.email})...`);

    try {
      const result = await this.emailService?.sendEmail(payload) || { success: false, error: 'Email service not initialized' };

      if (result.success) {
        // Bug 4.1 fix: Record sentAt immediately on successful send
        entity.sentAt = new Date();
        entity.status = 'sent';
        entity.lastUpdatedAt = new Date();
        console.log(`   ✅ Email sent (ID: ${result.messageId})`);

        // Persist sentAt to wave-state.json
        await this.persistSentStatus(entity);

        // Bug 4.2 fix: IMAP verification after send
        await this.verifySentViaIMAP(entity.email, subject);
      } else {
        console.log(`   ❌ Send failed: ${result.error}`);
      }

      return {
        success: result.success,
        messageId: result.messageId,
        error: result.error,
        provider: result.provider
      };

    } catch (error) {
      const err = error as Error;
      console.error(`   ❌ Send error: ${err.message}`);
      return {
        success: false,
        error: err.message
      };
    }
  }

  /**
   * Check if entity was already sent
   * TWO-VERIFICATION SYSTEM:
   * 1. Check local SentEmailTracker (data/sent-emails.json)
   * 2. Check Supabase database (for municipalities table)
   * Both must pass (return false) to proceed with sending
   *
   * SYNC BEHAVIOR:
   * If found in one source but not the other, sync the missing record
   * to maintain consistency between local tracker and Supabase
   */
  private async checkAlreadySent(
    email: string,
    type: string,
    entityName?: string
  ): Promise<{ alreadySent: boolean; sentAt?: string; source?: string }> {
    let localResult: { found: boolean; sentAt?: string; data?: any } = { found: false };
    let supabaseResult: { found: boolean; sentAt?: string; data?: any } = { found: false };

    // Verification 1: Check local SentEmailTracker
    try {
      const { SentEmailTracker } = await import('../../lib/SentEmailTracker');
      const tracker = new SentEmailTracker();
      const existing = tracker.getSentEntry(email, '', type as 'vc' | 'municipal');

      if (existing) {
        localResult = { found: true, sentAt: existing.sentAt, data: existing };
      }
    } catch (err) {
      // SentEmailTracker not available
    }

    // Verification 2: Check Supabase (for municipalities)
    if (type === 'municipal') {
      try {
        const credentials = this.loadCredentials();
        if (credentials?.supabase?.url && credentials?.supabase?.key) {
          const { createClient } = await import('@supabase/supabase-js');
          const supabase = createClient(credentials.supabase.url, credentials.supabase.key);

          // Check municipalities table
          const { data, error } = await supabase
            .from('municipalities')
            .select('id, name, outreach_sent_at, mayor_name')
            .eq('mayor_email', email)
            .not('outreach_sent_at', 'is', null)
            .maybeSingle();

          if (!error && data?.outreach_sent_at) {
            supabaseResult = {
              found: true,
              sentAt: data.outreach_sent_at,
              data: { name: data.name, mayor: data.mayor_name }
            };
          }

          // Also check outreach_emails table
          if (!supabaseResult.found) {
            const { data: emailData, error: emailError } = await supabase
              .from('outreach_emails')
              .select('sent_at, recipient_name')
              .eq('recipient_email', email)
              .eq('status', 'sent')
              .maybeSingle();

            if (!emailError && emailData?.sent_at) {
              supabaseResult = {
                found: true,
                sentAt: emailData.sent_at,
                data: { recipient: emailData.recipient_name }
              };
            }
          }
        }
      } catch (err) {
        console.warn(`   ⚠️  Supabase check failed: ${(err as Error).message}`);
      }
    }

    // SYNC LOGIC: Update the source that has less/generic information
    if (localResult.found && !supabaseResult.found && type === 'municipal') {
      // Found in local but not in Supabase - sync TO Supabase
      console.log(`   🔄 Sync: Local tracker has record for ${email}, updating Supabase...`);
      await this.syncToSupabase(email, entityName || localResult.data?.name || 'Unknown', localResult.sentAt!, type);
      return { alreadySent: true, sentAt: localResult.sentAt, source: 'local-tracker' };
    }

    if (!localResult.found && supabaseResult.found && type === 'municipal') {
      // Found in Supabase but not in local - sync TO local
      console.log(`   🔄 Sync: Supabase has record for ${email}, updating local tracker...`);
      await this.syncToLocalTracker(email, supabaseResult.data?.name || entityName || 'Unknown', supabaseResult.sentAt!, type);
      return { alreadySent: true, sentAt: supabaseResult.sentAt, source: 'supabase' };
    }

    if (localResult.found && supabaseResult.found) {
      // Found in both - use the earlier date
      const localDate = new Date(localResult.sentAt || 0).getTime();
      const supabaseDate = new Date(supabaseResult.sentAt || 0).getTime();
      const earlierDate = localDate < supabaseDate ? localResult.sentAt : supabaseResult.sentAt;
      const source = localDate < supabaseDate ? 'local-tracker' : 'supabase';
      console.log(`   ✅ Found in both sources, using ${source} date`);
      return { alreadySent: true, sentAt: earlierDate, source };
    }

    // Not found in either system
    return { alreadySent: false };
  }

  /**
   * Sync sent record to Supabase (for municipalities)
   */
  private async syncToSupabase(
    email: string,
    name: string,
    sentAt: string,
    type: 'vc' | 'municipal'
  ): Promise<void> {
    try {
      const credentials = this.loadCredentials();
      if (!credentials?.supabase?.url || !credentials?.supabase?.key) return;

      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(credentials.supabase.url, credentials.supabase.key);

      // Update municipalities table
      const { error: updateError } = await supabase
        .from('municipalities')
        .update({ outreach_sent_at: sentAt })
        .eq('mayor_email', email);

      if (updateError) {
        console.warn(`   ⚠️  Failed to sync to Supabase municipalities: ${updateError.message}`);
      } else {
        console.log(`   ✅ Synced to Supabase municipalities table`);
      }

      // Also create outreach_emails record if not exists
      const { data: existing } = await supabase
        .from('outreach_emails')
        .select('id')
        .eq('recipient_email', email)
        .eq('status', 'sent')
        .maybeSingle();

      if (!existing) {
        await supabase.from('outreach_emails').insert({
          recipient_email: email,
          recipient_name: name,
          status: 'sent',
          sent_at: sentAt,
          subject: `Municipal outreach - ${name}`,
          variant: 'traiga-municipal',
          created_at: new Date().toISOString()
        });
        console.log(`   ✅ Created outreach_emails record`);
      }
    } catch (err) {
      console.warn(`   ⚠️  Supabase sync failed: ${(err as Error).message}`);
    }
  }

  /**
   * Sync sent record to local tracker
   */
  private async syncToLocalTracker(
    email: string,
    name: string,
    sentAt: string,
    type: 'vc' | 'municipal'
  ): Promise<void> {
    try {
      const { SentEmailTracker } = await import('../../lib/SentEmailTracker');
      const tracker = new SentEmailTracker();

      tracker.recordSent({
        email,
        name,
        type,
        subject: `Municipal outreach - ${name}`,
        sentAt
      });

      console.log(`   ✅ Synced to local SentEmailTracker`);
    } catch (err) {
      console.warn(`   ⚠️  Local tracker sync failed: ${(err as Error).message}`);
    }
  }

  /**
   * Validate email address format and domain
   * Performs regex validation, pattern checks, and DNS MX lookup
   */
  /**
   * Validate email address format and domain
   * Performs regex validation, pattern checks, and DNS MX lookup
   */
  private async validateEmail(email: string, entityName: string): Promise<{ valid: boolean; reason?: string }> {
    // 1. Regex validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return { valid: false, reason: 'Invalid email format' };
    }

    // 2. Extract domain
    const domain = email.split('@')[1];
    if (!domain) {
      return { valid: false, reason: 'Missing domain in email' };
    }

    // 3. Check for common invalid patterns
    const invalidPatterns = ['example.com', 'test.com', 'localhost', 'example.org', 'test.org', 'domain.com'];
    if (invalidPatterns.includes(domain.toLowerCase())) {
      return { valid: false, reason: 'Test/placeholder domain' };
    }

    // 4. DNS MX record validation
    try {
      const { promisify } = require('util');
      const { execSync } = require('child_process');
      const dns = require('dns');
      const resolveMx = promisify(dns.resolveMx);

      let hasMx = false;

      try {
        const mxRecords = dns.resolveSync ? dns.resolveSync(domain, 'MX') : null;
        if (mxRecords && mxRecords.length > 0) {
          hasMx = true;
        }
      } catch (syncErr) {
        // Try async way
      }

      if (!hasMx) {
        try {
          const mxRecords = await resolveMx(domain);
          hasMx = mxRecords && mxRecords.length > 0;
        } catch (asyncErr) {
          // Ignore async errors
        }
      }

      // Fallback: use dig/nslookup to check MX
      if (!hasMx) {
        try {
          const digResult = execSync(`dig +short MX ${domain} 2>/dev/null || echo ""`, {
            timeout: 5000,
            encoding: 'utf8'
          });
          if (digResult && digResult.trim()) {
            hasMx = true;
          }
        } catch (digErr) {
          // dig not available or timeout
        }
      }

      // If dig didn't work, try nslookup
      if (!hasMx) {
        try {
          const nslookupResult = execSync(`nslookup -type=MX ${domain} 2>/dev/null || echo ""`, {
            timeout: 5000,
            encoding: 'utf8'
          });
          if (nslookupResult && nslookupResult.includes('mail exchanger')) {
            hasMx = true;
          }
        } catch (nsErr) {
          // nslookup not available or timeout
        }
      }

      if (!hasMx) {
        console.warn(`   ⚠️  No MX records found for domain: ${domain}`);
        console.warn(`   📝 Email will likely fail delivery: ${email}`);
        return {
          valid: false,
          reason: `DNS_NXDOMAIN: No MX records found for domain "${domain}" - domain may not exist or email may not be deliverable`
        };
      }

      console.log(`   ✅ DNS MX validation passed for domain: ${domain}`);
      return { valid: true };

    } catch (err) {
      // If DNS validation fails completely, warn but allow sending
      // (some networks restrict DNS lookups)
      console.warn(`   ⚠️  DNS MX lookup failed for ${domain}: ${(err as Error).message}`);
      console.warn(`   📝 Allowing send despite DNS lookup failure (network may restrict queries)`);
      return { valid: true };
    }
  }

  /**
   * Basic HTML sanitization with CSS inlining for email compatibility
   * Strips script tags and dangerous content while preserving email-safe HTML
   * Also inlines CSS from <style> tags for better email client compatibility
   */
  private sanitizeHtmlBasic(html: string): string {
    // Step 1: Extract CSS from <style> tags
    const cssRules: { [selector: string]: { [prop: string]: string } } = {};
    const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
    let styleMatch;
    
    while ((styleMatch = styleRegex.exec(html)) !== null) {
      const cssContent = styleMatch[1];
      // Parse CSS rules (simplified parser for common cases)
      const ruleRegex = /([^{]+)\{([^}]+)\}/g;
      let ruleMatch;
      while ((ruleMatch = ruleRegex.exec(cssContent)) !== null) {
        const selector = ruleMatch[1].trim();
        const properties = ruleMatch[2].trim();
        
        // Parse properties
        cssRules[selector] = cssRules[selector] || {};
        const propRegex = /([\w-]+)\s*:\s*([^;]+)/g;
        let propMatch;
        while ((propMatch = propRegex.exec(properties)) !== null) {
          cssRules[selector][propMatch[1].trim()] = propMatch[2].trim();
        }
      }
    }
    
    // Step 2: Remove <style> tags
    let sanitized = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    
    // Step 3: Apply inline styles based on CSS classes
    // Handle .class selectors
    for (const selector in cssRules) {
      if (selector.startsWith('.')) {
        const className = selector.substring(1);
        const styles = Object.entries(cssRules[selector])
          .map(([prop, val]) => `${prop}: ${val}`)
          .join('; ');
        
        // Find elements with this class and add inline style
        const classRegex = new RegExp(`(<[^>]*class="[^"]*\\b${className}\\b[^"]*")`, 'gi');
        sanitized = sanitized.replace(classRegex, (match) => {
          if (match.includes('style="')) {
            // Append to existing style
            return match.replace(/style="([^"]*)"/, `style="$1; ${styles}"`);
          } else {
            // Add new style attribute
            return `${match} style="${styles}"`;
          }
        });
      }
    }
    
    // Step 4: Remove script tags
    sanitized = sanitized.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    
    // Step 5: Remove event handlers
    sanitized = sanitized.replace(/\s+on\w+\s*=\s*"[^"]*"/gi, '');
    sanitized = sanitized.replace(/\s+on\w+\s*=\s*'[^']*'/gi, '');
    sanitized = sanitized.replace(/\s+on\w+\s*=\s*[^\s>]+/gi, '');
    
    // Step 6: Remove javascript: and data: URLs
    sanitized = sanitized.replace(/(href|src|action)\s*=\s*"javascript:[^"]*"/gi, '$1="#"');
    sanitized = sanitized.replace(/(href|src|action)\s*=\s*'javascript:[^']*'/gi, '$1="#"');
    sanitized = sanitized.replace(/(href|src|action)\s*=\s*"data:[^"]*"/gi, '$1="#"');
    sanitized = sanitized.replace(/(href|src|action)\s*=\s*'data:[^']*'/gi, '$1="#"');
    
    // Step 7: Remove iframe, object, embed tags
    sanitized = sanitized.replace(/<(iframe|object|embed)[^>]*>[\s\S]*?<\/\1>/gi, '');
    sanitized = sanitized.replace(/<(iframe|object|embed)[^>]*\/?>/gi, '');
    
    return sanitized.trim();
  }

  /**
   * Regenerate template from personalization parameters
   * Called when template size validation fails
   */
  private async regenerateTemplate(
    entity: OutreachEntity,
    currentSubject: string
  ): Promise<{ html: string; subject: string } | null> {
    try {
      const context = entity.personalizationContext || {};
      const recipientName = (context.partnerName as string) || (context.recipientName as string) || 'there';
      const painPoints = (context.painPoints as string[]) || [];
      const customHook = (context.tailoredHook as string) || (context.customHook as string) || '';
      const customPS = (context.personalizedPS as string) || (context.customPS as string) || '';

      // P2 VALIDATION: Warn if no pain points available
      if (!painPoints || painPoints.length === 0) {
        console.warn(`   ⚠️  No pain points available for ${entity.name} - template quality may be degraded`);
      }

      // Determine language and variant
      const isMunicipal = entity.type === 'municipal';
      const language = isMunicipal ? 'es' : 'en';
      const variant = isMunicipal ? 'traiga' : 'governance';

      console.log(`   📝 Regenerating template for ${entity.name}...`);
      console.log(`   📋 Params: ${recipientName}, ${painPoints.length} pain points, lang=${language}`);

      // Import template generator
      const { generateEmailHTML, generateEmail } = await import('../../lib/email/outreach-email-template');

      let result;
      if (isMunicipal) {
        // Municipal uses generateEmail (Spanish)
        result = generateEmail({
          recipientName,
          companyName: entity.name,
          painPoints,
          variant: variant as 'governance' | 'institutional' | 'traiga',
          language,
          subject: currentSubject,
          customPS
        });
      } else {
        // VC uses generateEmailHTML (English)
        result = generateEmailHTML({
          recipientName,
          companyName: entity.name,
          painPoints,
          variant: variant as 'governance' | 'institutional',
          language,
          subject: currentSubject,
          customHook,
          customPS
        });
      }

      if (result && result.html) {
        console.log(`   ✅ Template regenerated: ${result.html.length} bytes`);
        return {
          html: result.html,
          subject: result.subject || currentSubject
        };
      }

      return null;
    } catch (err) {
      console.error(`   ❌ Template regeneration failed: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Persist sent status to wave-state.json and Supabase
   * Bug 4.1 fix: Ensure sentAt is recorded immediately after send
   */
  private async persistSentStatus(entity: OutreachEntity): Promise<void> {
    try {
      // 1. Update wave-state.json
      const waveStatePath = path.join(
        process.env.HOME || '',
        '.openclaw/workspace/reports/alygn',
        entity.type === 'vc' ? 'vc-waves' : 'muni-waves',
        'wave-state.json'
      );

      if (fs.existsSync(waveStatePath)) {
        const state = JSON.parse(fs.readFileSync(waveStatePath, 'utf8'));

        if (state.data?.entities) {
          const entityIndex = state.data.entities.findIndex((e: any) => e.id === entity.id);
          if (entityIndex !== -1) {
            // Update entity with sent data
            state.data.entities[entityIndex] = {
              ...state.data.entities[entityIndex],
              status: 'sent',
              sentAt: entity.sentAt?.toISOString() || new Date().toISOString(),
              lastUpdatedAt: new Date().toISOString()
            };
            state.lastUpdatedAt = new Date().toISOString();
            fs.writeFileSync(waveStatePath, JSON.stringify(state, null, 2));
            console.log(`   💾 Updated wave-state.json: ${entity.name} marked as sent`);
          }
        }
      }

      // 2. Sync to Supabase outreach_emails table
      if (entity.type === 'municipal') {
        await this.syncSentToSupabase(entity);
      }
    } catch (err) {
      console.warn(`   ⚠️  Failed to persist sent status: ${(err as Error).message}`);
      // Non-blocking: email was sent, persistence failure is not critical
    }
  }

  /**
   * Sync sent status to Supabase outreach_emails table
   */
  private async syncSentToSupabase(entity: OutreachEntity): Promise<void> {
    try {
      const credentials = this.loadCredentials();
      if (!credentials?.supabase?.url || !credentials?.supabase?.key) return;

      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(credentials.supabase.url, credentials.supabase.key);

      const sentAtISO = entity.sentAt?.toISOString() || new Date().toISOString();

      // Update municipalities table
      const { error: updateError } = await supabase
        .from('municipalities')
        .update({ outreach_sent_at: sentAtISO })
        .eq('mayor_email', entity.email);

      if (updateError) {
        console.warn(`   ⚠️  Supabase municipalities update failed: ${updateError.message}`);
      } else {
        console.log(`   ✅ Synced sent status to Supabase municipalities`);
      }

      // Insert outreach_emails record
      const { error: insertError } = await supabase
        .from('outreach_emails')
        .upsert({
          recipient_email: entity.email,
          recipient_name: entity.name,
          status: 'sent',
          sent_at: sentAtISO,
          subject: entity.personalizationContext?.customSubject as string || 'Outreach from Alygn',
          variant: 'traiga-municipal',
          created_at: new Date().toISOString()
        }, { onConflict: 'recipient_email' });

      if (insertError) {
        console.warn(`   ⚠️  Supabase outreach_emails insert failed: ${insertError.message}`);
      } else {
        console.log(`   ✅ Synced sent status to Supabase outreach_emails`);
      }
    } catch (err) {
      console.warn(`   ⚠️  Supabase sync failed: ${(err as Error).message}`);
    }
  }

  /**
   * Verify email delivery via IMAP Sent folder
   * Bug 4.2 fix: Post-send IMAP verification
   */
  private async verifySentViaIMAP(email: string, subject: string): Promise<boolean> {
    try {
      const credentials = this.loadCredentials();
      if (!credentials?.email?.imap) {
        console.log(`   ℹ️  IMAP verification skipped: no IMAP config`);
        return false;
      }

      const imap = credentials.email.imap as Record<string, unknown>;
      const Imap = await import('imap');

      return new Promise((resolve) => {
        const imapClient = new Imap.default({
          user: credentials.email.address as string,
          password: imap.password as string,
          host: imap.host as string,
          port: imap.port as number || 993,
          tls: true,
          tlsOptions: { rejectUnauthorized: false }
        });

        imapClient.once('ready', () => {
          imapClient.openBox('Sent', false, (err: Error | null, box: any) => {
            if (err) {
              console.warn(`   ⚠️  IMAP Sent folder open failed: ${err.message}`);
              imapClient.end();
              resolve(false);
              return;
            }

            // Search for the sent email by subject
            imapClient.search([
              ['TO', email],
              ['SUBJECT', subject],
              ['SINCE', new Date(Date.now() - 86400000)] // Last 24h
            ], (searchErr: Error | null, results: number[]) => {
              if (searchErr || results.length === 0) {
                console.warn(`   ⚠️  Email sent but not found in IMAP Sent folder`);
                imapClient.end();
                resolve(false);
                return;
              }

              console.log(`   ✅ IMAP verification: Found ${results.length} matching email(s) in Sent folder`);
              imapClient.end();
              resolve(true);
            });
          });
        });

        imapClient.once('error', (err: Error) => {
          console.warn(`   ⚠️  IMAP verification error: ${err.message}`);
          resolve(false);
        });

        imapClient.once('end', () => {
          // Promise already resolved in handlers
        });

        // Timeout after 10 seconds
        setTimeout(() => {
          console.warn(`   ⚠️  IMAP verification timed out`);
          try { imapClient.end(); } catch { /* ignore */ }
          resolve(false);
        }, 10000);

        imapClient.connect();
      });
    } catch (err) {
      console.log(`   ℹ️  IMAP verification skipped: ${(err as Error).message}`);
      return false;
    }
  }

  /**
   * Persist regenerated draft to disk
   */
  private async persistRegeneratedDraft(entity: OutreachEntity): Promise<void> {
    try {
      const fs = await import('fs');
      const path = await import('path');

      // Update personalization file
      const personalizePath = path.join(
        process.env.HOME || '',
        '.openclaw/workspace/reports/alygn',
        entity.type === 'vc' ? 'vc-personalize' : 'muni-personalize',
        `alygn-${entity.type}-personalized-${new Date().toISOString().split('T')[0]}.json`
      );

      if (fs.existsSync(personalizePath)) {
        const data = JSON.parse(fs.readFileSync(personalizePath, 'utf8'));

        // Find and update entity
        if (data.data?.entities) {
          const entityIndex = data.data.entities.findIndex((e: any) => e.id === entity.id);
          if (entityIndex !== -1) {
            data.data.entities[entityIndex] = entity;
            fs.writeFileSync(personalizePath, JSON.stringify(data, null, 2));
            console.log(`   💾 Updated personalization file: ${personalizePath}`);
          }
        }
      }

      // Update state file
      const statePath = path.join(
        process.env.HOME || '',
        '.openclaw/workspace/reports/alygn',
        entity.type === 'vc' ? 'vc-waves' : 'muni-waves',
        'wave-state.json'
      );

      if (fs.existsSync(statePath)) {
        const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));

        if (state.data?.entities) {
          const entityIndex = state.data.entities.findIndex((e: any) => e.id === entity.id);
          if (entityIndex !== -1) {
            state.data.entities[entityIndex] = entity;
            state.lastUpdatedAt = new Date().toISOString();
            fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
            console.log(`   💾 Updated state file: ${statePath}`);
          }
        }
      }
    } catch (err) {
      // P1: Make persistence failures BLOCKING
      const errorMessage = `Failed to persist regenerated draft: ${(err as Error).message}`;
      console.error(`   ❌ ${errorMessage}`);
      throw new Error(`Persistence failed: ${(err as Error).message}`);
    }
  }
}

// Forward declare EmailService for type reference
declare class EmailService {
  constructor(providerType: string, config: Record<string, unknown>);
  setTestEmail(email: string): void;
  sendEmail(payload: EmailPayload): Promise<{ success: boolean; messageId?: string; error?: string; provider?: string }>;
}

export default SendingStrategy;
