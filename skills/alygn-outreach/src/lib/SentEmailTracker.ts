/**
 * SentEmailTracker
 * Tracks sent emails to prevent duplicates
 * Self-contained: uses local data directory within skill
 */
import fs from 'fs';
import path from 'path';

// Self-contained data directory within skill
const SKILL_DATA_DIR = path.resolve(__dirname, '../../data');
const SENT_LOG_FILE = path.resolve(SKILL_DATA_DIR, 'sent-emails.json');

interface SentEmailEntry {
  email: string;
  name: string;
  partnerName: string | null;
  vcName: string;
  subject: string;
  sentAt: string;
  messageId: string;
  status?: 'sent' | 'bounced' | 'opened' | 'clicked' | 'deferred' | 'spam_report' | 'unsubscribed';
  bounceReason?: string;
  bouncedAt?: string;
}

interface SentEmails {
  vcs: SentEmailEntry[];
  municipalities: SentEmailEntry[];
  lastUpdated: string | null;
}

interface RecordSentParams {
  email: string;
  name: string;
  partnerName?: string;
  vcName?: string;
  type: 'vc' | 'municipal';
  subject: string;
  sentAt?: string;
  messageId?: string;
}

export class SentEmailTracker {
  sentEmails: SentEmails;

  constructor() {
    // Ensure data directory exists
    if (!fs.existsSync(SKILL_DATA_DIR)) {
      fs.mkdirSync(SKILL_DATA_DIR, { recursive: true });
    }
    this.sentEmails = this.loadSentLog();
  }

  private loadSentLog(): SentEmails {
    try {
      if (fs.existsSync(SENT_LOG_FILE)) {
        return JSON.parse(fs.readFileSync(SENT_LOG_FILE, 'utf8')) as SentEmails;
      }
    } catch (e) {
      const err = e as Error;
      console.error('Error loading sent log:', err.message);
    }
    return { vcs: [], municipalities: [], lastUpdated: null };
  }

  private saveSentLog(): void {
    try {
      fs.writeFileSync(SENT_LOG_FILE, JSON.stringify(this.sentEmails, null, 2));
    } catch (e) {
      const err = e as Error;
      console.error('Error saving sent log:', err.message);
    }
  }

  /**
   * Check if email was already sent
   */
  wasAlreadySent(email: string, partnerName?: string, type: 'vc' | 'municipal' = 'vc'): boolean {
    const key = type === 'vc' ? 'vcs' : 'municipalities';
    
    if (!email) return false;
    
    // For VCs, check email + partner combination if partnerName provided
    if (type === 'vc' && partnerName) {
      return this.sentEmails[key].some(entry => 
        entry.email.toLowerCase() === email.toLowerCase() &&
        entry.partnerName === partnerName
      );
    }
    
    // For municipalities or if no partner name, just check email
    return this.sentEmails[key].some(entry => 
      entry.email.toLowerCase() === email.toLowerCase()
    );
  }

  /**
   * Record sent email
   */
  recordSent(params: RecordSentParams): void {
    const { email, name, partnerName, vcName, type, subject, sentAt, messageId } = params;
    const key = type === 'vc' ? 'vcs' : 'municipalities';
    
    if (!email) {
      console.warn('Cannot record sent email: no email provided');
      return;
    }
    
    // Check if already exists (email + partner combination for VCs)
    let existingIndex = -1;
    if (type === 'vc' && partnerName) {
      existingIndex = this.sentEmails[key].findIndex(
        entry => entry.email.toLowerCase() === email.toLowerCase() &&
                 entry.partnerName === partnerName
      );
    } else {
      existingIndex = this.sentEmails[key].findIndex(
        entry => entry.email.toLowerCase() === email.toLowerCase()
      );
    }
    
    const entry: SentEmailEntry = {
      email,
      name,
      partnerName: partnerName || null,
      vcName: vcName || name,
      subject,
      sentAt: sentAt || new Date().toISOString(),
      messageId: messageId || `alygn-${Date.now()}`
    };
    
    if (existingIndex >= 0) {
      // Update existing
      this.sentEmails[key][existingIndex] = entry;
      console.log(`Updated existing sent record for ${email}${partnerName ? ` (${partnerName})` : ''}`);
    } else {
      // Add new
      this.sentEmails[key].push(entry);
      console.log(`Recorded new sent email for ${email}${partnerName ? ` (${partnerName})` : ''}`);
    }
    
    this.sentEmails.lastUpdated = new Date().toISOString();
    this.saveSentLog();
  }

  /**
   * Get sent emails list
   */
  getSent(type: 'vc' | 'municipal'): SentEmailEntry[] {
    const key = type === 'vc' ? 'vcs' : 'municipalities';
    return this.sentEmails[key];
  }

  /**
   * Get count
   */
  getCount(type: 'vc' | 'municipal'): number {
    const key = type === 'vc' ? 'vcs' : 'municipalities';
    return this.sentEmails[key].length;
  }

  /**
   * Get full stats
   */
  getStats(): { vcs: number; municipalities: number; total: number; lastUpdated: string | null } {
    return {
      vcs: this.getCount('vc'),
      municipalities: this.getCount('municipal'),
      total: this.getCount('vc') + this.getCount('municipal'),
      lastUpdated: this.sentEmails.lastUpdated
    };
  }

  /**
   * Get last sent entry for an email
   */
  getSentEntry(email: string, partnerName?: string, type: 'vc' | 'municipal' = 'vc'): SentEmailEntry | null {
    const key = type === 'vc' ? 'vcs' : 'municipalities';
    
    if (!email) return null;
    
    if (type === 'vc' && partnerName) {
      return this.sentEmails[key].find(
        entry => entry.email.toLowerCase() === email.toLowerCase() &&
                 entry.partnerName === partnerName
      ) || null;
    }
    
    return this.sentEmails[key].find(
      entry => entry.email.toLowerCase() === email.toLowerCase()
    ) || null;
  }

  /**
   * Record a bounce for an existing sent email entry.
   * Updates the entry's status to 'bounced' and records the bounce reason.
   * If no matching entry is found, logs a warning.
   */
  recordBounce(email: string, bounceReason?: string, partnerName?: string, type: 'vc' | 'municipal' = 'vc'): boolean {
    const key = type === 'vc' ? 'vcs' : 'municipalities';

    if (!email) {
      console.warn('Cannot record bounce: no email provided');
      return false;
    }

    let existingIndex = -1;
    if (type === 'vc' && partnerName) {
      existingIndex = this.sentEmails[key].findIndex(
        entry => entry.email.toLowerCase() === email.toLowerCase() &&
                 entry.partnerName === partnerName
      );
    } else {
      existingIndex = this.sentEmails[key].findIndex(
        entry => entry.email.toLowerCase() === email.toLowerCase()
      );
    }

    if (existingIndex === -1) {
      console.warn(`Cannot record bounce: no sent record found for ${email}`);
      return false;
    }

    const entry = this.sentEmails[key][existingIndex];
    entry.status = 'bounced';
    entry.bounceReason = bounceReason ?? undefined;
    entry.bouncedAt = new Date().toISOString();
    this.sentEmails[key][existingIndex] = entry;
    this.sentEmails.lastUpdated = new Date().toISOString();
    this.saveSentLog();
    console.log(`Recorded bounce for ${email}${partnerName ? ` (${partnerName})` : ''}: ${bounceReason ?? 'no reason'}`);
    return true;
  }

  /**
   * Update the status of an existing sent email entry.
   */
  updateStatus(email: string, status: SentEmailEntry['status'], partnerName?: string, type: 'vc' | 'municipal' = 'vc'): boolean {
    const key = type === 'vc' ? 'vcs' : 'municipalities';

    if (!email) return false;

    let existingIndex = -1;
    if (type === 'vc' && partnerName) {
      existingIndex = this.sentEmails[key].findIndex(
        entry => entry.email.toLowerCase() === email.toLowerCase() &&
                 entry.partnerName === partnerName
      );
    } else {
      existingIndex = this.sentEmails[key].findIndex(
        entry => entry.email.toLowerCase() === email.toLowerCase()
      );
    }

    if (existingIndex === -1) return false;

    this.sentEmails[key][existingIndex].status = status;
    this.sentEmails.lastUpdated = new Date().toISOString();
    this.saveSentLog();
    return true;
  }

  /**
   * Check if specific partner was already emailed at a VC
   */
  wasPartnerEmailed(email: string, partnerName: string): boolean {
    if (!email || !partnerName) return false;
    
    return this.sentEmails.vcs.some(entry => 
      entry.email.toLowerCase() === email.toLowerCase() &&
      entry.partnerName === partnerName
    );
  }

  /**
   * Get partners already emailed at a specific VC
   */
  getEmailedPartners(email: string): string[] {
    if (!email) return [];
    
    return this.sentEmails.vcs
      .filter(entry => entry.email.toLowerCase() === email.toLowerCase())
      .map(entry => entry.partnerName)
      .filter((p): p is string => p !== null);
  }

  /**
   * Clear all sent records (use with caution)
   */
  clearAll(): void {
    this.sentEmails = { vcs: [], municipalities: [], lastUpdated: null };
    this.saveSentLog();
  }
}

export default SentEmailTracker;
