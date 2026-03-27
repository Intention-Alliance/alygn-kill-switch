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

    if (!entity.email) {
      console.log(`   ⚠️  No email address for ${entity.name}`);
      return {
        success: false,
        error: 'No email address'
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

    const subject = (entity.personalizationContext?.customSubject as string) || `Outreach from Alygn`;
    const html = entity.personalizationContext?.customBody as string | undefined;
    
    if (!html) {
      console.log(`   ⚠️  No personalized content for ${entity.name}`);
      return {
        success: false,
        error: 'No personalized content'
      };
    }
    
    const payload: EmailPayload = {
      to: entity.email,
      subject,
      html,
      from: (this.config.fromEmail as string) || 'Alygn R&D <andrew@alygn.com>'
    };
    
    if (dryRun) {
      console.log(`📧 [DRY RUN] Would send to ${entity.name} (${entity.email})`);
      console.log(`    Subject: ${subject}`);
      return {
        success: true,
        wouldSend: true,
        testMode: true,
        to: entity.email,
        subject
      };
    }
    
    console.log(`📧 Sending email to ${entity.name} (${entity.email})...`);

    try {
      const result = await this.emailService?.sendEmail(payload) || { success: false, error: 'Email service not initialized' };

      if (result.success) {
        entity.status = 'sent';
        console.log(`   ✅ Email sent (ID: ${result.messageId})`);
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
   */
  private async checkAlreadySent(email: string, type: string): Promise<{ alreadySent: boolean; sentAt?: string }> {
    try {
      // Use local SentEmailTracker
      const { SentEmailTracker } = await import('../../lib/SentEmailTracker');
      const tracker = new SentEmailTracker();
      const existing = tracker.getSentEntry(email, '', type as 'vc' | 'municipal');
      
      if (existing) {
        return { alreadySent: true, sentAt: existing.sentAt };
      }
    } catch {
      // SentEmailTracker not available, continue
    }
    return { alreadySent: false };
  }
}

// Forward declare EmailService for type reference
declare class EmailService {
  constructor(providerType: string, config: Record<string, unknown>);
  setTestEmail(email: string): void;
  sendEmail(payload: EmailPayload): Promise<{ success: boolean; messageId?: string; error?: string; provider?: string }>;
}

export default SendingStrategy;
