/**
 * SentEmailTracker
 * Tracks sent emails to prevent duplicates
 * 
 * Updated: Mar 19, 2026 - Unified code paths with absolute paths
 */
import fs from 'fs';
import path from 'path';

// ABSOLUTE PATHS using $HOME
const WORKSPACE_ROOT = path.resolve(process.env.HOME, '.openclaw/workspace');

// Use absolute path for sent log file
const SENT_LOG_FILE = path.resolve(WORKSPACE_ROOT, 'scripts/alygn/lib/sent-emails.json');

export class SentEmailTracker {
  constructor() {
    this.sentEmails = this.loadSentLog();
  }

  loadSentLog() {
    try {
      if (fs.existsSync(SENT_LOG_FILE)) {
        return JSON.parse(fs.readFileSync(SENT_LOG_FILE, 'utf8'));
      }
    } catch (e) {
      console.error('Error loading sent log:', e.message);
    }
    return { vcs: [], municipalities: [], lastUpdated: null };
  }

  saveSentLog() {
    try {
      fs.writeFileSync(SENT_LOG_FILE, JSON.stringify(this.sentEmails, null, 2));
    } catch (e) {
      console.error('Error saving sent log:', e.message);
    }
  }

  /**
   * Check if email was already sent
   * @param {string} email - Email address
   * @param {string} partnerName - Partner name (optional, for VC-level tracking)
   * @param {string} type - 'vc' or 'municipal'
   * @returns {boolean}
   */
  wasAlreadySent(email, partnerName, type) {
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
   * @param {Object} params
   * @param {string} params.email
   * @param {string} params.name - VC or municipality name
   * @param {string} params.partnerName - Partner name (for VC-level tracking)
   * @param {string} params.vcName - VC firm name (for partner-level tracking)
   * @param {string} params.type - 'vc' or 'municipal'
   * @param {string} params.subject
   * @param {string} params.sentAt
   * @param {string} params.messageId
   */
  recordSent(params) {
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
    
    const entry = {
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
   * @param {string} type - 'vc' or 'municipal'
   * @returns {Array}
   */
  getSent(type) {
    const key = type === 'vc' ? 'vcs' : 'municipalities';
    return this.sentEmails[key];
  }

  /**
   * Get count
   * @param {string} type - 'vc' or 'municipal'
   * @returns {number}
   */
  getCount(type) {
    const key = type === 'vc' ? 'vcs' : 'municipalities';
    return this.sentEmails[key].length;
  }

  /**
   * Get full stats
   * @returns {Object}
   */
  getStats() {
    return {
      vcs: this.getCount('vc'),
      municipalities: this.getCount('municipal'),
      total: this.getCount('vc') + this.getCount('municipal'),
      lastUpdated: this.sentEmails.lastUpdated
    };
  }

  /**
   * Get last sent entry for an email
   * @param {string} email
   * @param {string} partnerName
   * @param {string} type
   * @returns {Object|null}
   */
  getSentEntry(email, partnerName, type) {
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
   * Check if specific partner was already emailed at a VC
   * @param {string} email
   * @param {string} partnerName
   * @returns {boolean}
   */
  wasPartnerEmailed(email, partnerName) {
    if (!email || !partnerName) return false;
    
    return this.sentEmails.vcs.some(entry => 
      entry.email.toLowerCase() === email.toLowerCase() &&
      entry.partnerName === partnerName
    );
  }

  /**
   * Get partners already emailed at a specific VC
   * @param {string} email
   * @returns {Array}
   */
  getEmailedPartners(email) {
    if (!email) return [];
    
    return this.sentEmails.vcs
      .filter(entry => entry.email.toLowerCase() === email.toLowerCase())
      .map(entry => entry.partnerName)
      .filter(Boolean);
  }

  /**
   * Clear all sent records (use with caution)
   */
  clearAll() {
    this.sentEmails = { vcs: [], municipalities: [], lastUpdated: null };
    this.saveSentLog();
  }
}

export default SentEmailTracker;