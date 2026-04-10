/**
 * Email IMAP Adapter for Outreach Listener
 * 
 * Listens for new emails from VC/municipal contacts via IMAP
 * Emits standardized messages to the WebSocket Pool
 * 
 * @module services/adapters/email-imap
 */

const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const EventEmitter = require('events');
const fs = require('fs').promises;
const path = require('path');

/**
 * Email IMAP Adapter
 * Connects to Gmail IMAP and listens for new emails
 */
class EmailImapAdapter extends EventEmitter {
  /**
   * @param {Object} config - Configuration object
   * @param {string} config.username - Gmail username
   * @param {string} config.password - Gmail app password
   * @param {string} config.imap_server - IMAP server (default: imap.gmail.com)
   * @param {number} config.imap_port - IMAP port (default: 993)
   * @param {boolean} config.secure - Use SSL (default: true)
   * @param {number} config.check_interval - Check interval in seconds (default: 30)
   * @param {string[]} config.target_domains - Domains to monitor
   * @param {string[]} config.folders - IMAP folders to monitor
   */
  constructor(config = {}) {
    super();
    
    this.config = {
      username: config.username || process.env.EMAIL_USER,
      password: config.password || process.env.EMAIL_PASS,
      imap_server: config.imap_server || 'imap.gmail.com',
      imap_port: config.imap_port || 993,
      secure: config.secure !== false,
      check_interval: config.check_interval || 30,
      target_domains: config.target_domains || [],
      folders: config.folders || ['INBOX'],
      ...config
    };
    
    this.client = null;
    this.isConnected = false;
    this.checkTimer = null;
    this.seenMessageIds = new Set(); // Local tracking for fail-open
    this.stateFile = path.join(process.cwd(), 'state', 'email-seen-ids.json');
    
    // Load seen message IDs from disk
    this._loadSeenIds();
    
    // Bind methods
    this.connect = this.connect.bind(this);
    this.disconnect = this.disconnect.bind(this);
    this.checkNewEmails = this.checkNewEmails.bind(this);
  }

  /**
   * Load seen message IDs from disk (fail-open persistence)
   * @private
   */
  async _loadSeenIds() {
    try {
      const data = await fs.readFile(this.stateFile, 'utf8');
      const ids = JSON.parse(data);
      this.seenMessageIds = new Set(ids);
      console.log(`[EmailAdapter] Loaded ${ids.length} seen message IDs from disk`);
    } catch (error) {
      // File doesn't exist yet, start fresh
      this.seenMessageIds = new Set();
    }
  }

  /**
   * Save seen message IDs to disk
   * @private
   */
  async _saveSeenIds() {
    try {
      await fs.mkdir(path.dirname(this.stateFile), { recursive: true });
      await fs.writeFile(
        this.stateFile, 
        JSON.stringify(Array.from(this.seenMessageIds)), 
        'utf8'
      );
    } catch (error) {
      console.warn('[EmailAdapter] Failed to save seen IDs:', error.message);
    }
  }

  /**
   * Connect to IMAP server
   * @returns {Promise<boolean>}
   */
  async connect() {
    if (this.isConnected) {
      console.log('[EmailAdapter] Already connected');
      return true;
    }

    if (!this.config.username || !this.config.password) {
      console.error('[EmailAdapter] Missing credentials');
      return false;
    }

    try {
      this.client = new ImapFlow({
        host: this.config.imap_server,
        port: this.config.imap_port,
        secure: this.config.secure,
        auth: {
          user: this.config.username,
          pass: this.config.password
        },
        logger: false // Disable verbose logging
      });

      // Set up event handlers
      this.client.on('error', (error) => {
        console.error('[EmailAdapter] IMAP error:', error.message);
        this.emit('error', error);
        this._scheduleReconnect();
      });

      await this.client.connect();
      this.isConnected = true;
      console.log(`[EmailAdapter] Connected to ${this.config.imap_server}`);
      
      this.emit('connected');
      
      // Start checking for new emails
      this._startEmailCheckLoop();
      
      return true;
    } catch (error) {
      console.error('[EmailAdapter] Connection failed:', error.message);
      this.emit('error', error);
      this._scheduleReconnect();
      return false;
    }
  }

  /**
   * Disconnect from IMAP server
   * @returns {Promise<void>}
   */
  async disconnect() {
    this._stopEmailCheckLoop();
    
    if (this.client) {
      try {
        await this.client.logout();
        console.log('[EmailAdapter] Disconnected from IMAP');
      } catch (error) {
        console.warn('[EmailAdapter] Error during disconnect:', error.message);
      }
      this.client = null;
    }
    
    this.isConnected = false;
    this.emit('disconnected');
    
    // Save seen IDs before exit
    await this._saveSeenIds();
  }

  /**
   * Start the email check loop
   * @private
   */
  _startEmailCheckLoop() {
    // Check immediately
    this.checkNewEmails();
    
    // Then check periodically
    this.checkTimer = setInterval(
      this.checkNewEmails, 
      this.config.check_interval * 1000
    );
    
    // Don't prevent process exit
    if (this.checkTimer.unref) {
      this.checkTimer.unref();
    }
  }

  /**
   * Stop the email check loop
   * @private
   */
  _stopEmailCheckLoop() {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
  }

  /**
   * Schedule a reconnection attempt
   * @private
   */
  _scheduleReconnect() {
    if (this.isConnected) {
      this.isConnected = false;
      console.log('[EmailAdapter] Scheduling reconnect in 30s...');
      setTimeout(() => {
        this.connect();
      }, 30000);
    }
  }

  /**
   * Check for new emails from target domains
   * @returns {Promise<Array>}
   */
  async checkNewEmails() {
    if (!this.isConnected || !this.client) {
      return [];
    }

    const newEmails = [];

    try {
      for (const folder of this.config.folders) {
        try {
          const lock = await this.client.getMailboxLock(folder);
          
          // Search for recent messages (last 7 days)
          const sinceDate = new Date();
          sinceDate.setDate(sinceDate.getDate() - 7);
          
          const messages = await this.client.search({
            since: sinceDate.toISOString().split('T')[0],
            unseen: true
          });

          for (const uid of messages) {
            try {
              const message = await this.client.fetchOne(uid, {
                source: true,
                envelope: true
              });

              if (!message) continue;

              // Parse the email
              const parsed = await simpleParser(message.source);
              
              // Check if from target domain
              const fromAddress = parsed.from?.value?.[0]?.address || '';
              const isTargetDomain = this._isTargetDomain(fromAddress);
              
              // Generate unique message ID
              const messageId = parsed.messageId || `uid-${uid}`;
              
              // Skip if already seen
              if (this.seenMessageIds.has(messageId)) {
                continue;
              }
              
              // Mark as seen
              this.seenMessageIds.add(messageId);
              
              // Emit to WebSocket Pool
              const emailData = {
                type: 'email',
                data: {
                  id: messageId,
                  from: {
                    address: fromAddress,
                    name: parsed.from?.value?.[0]?.name || ''
                  },
                  to: parsed.to?.value?.map(v => ({ address: v.address, name: v.name })) || [],
                  subject: parsed.subject || '',
                  body: {
                    text: parsed.text || '',
                    html: parsed.html || ''
                  },
                  attachments: parsed.attachments?.map(a => ({
                    filename: a.filename,
                    contentType: a.contentType,
                    size: a.size
                  })) || [],
                  date: parsed.date?.toISOString() || new Date().toISOString(),
                  folder,
                  isTargetDomain,
                  headers: {
                    messageId: parsed.messageId,
                    inReplyTo: parsed.inReplyTo,
                    references: parsed.references
                  }
                },
                timestamp: Date.now(),
                source: 'email'
              };

              this.emit('message', emailData);
              newEmails.push(emailData);
              
              // Save state periodically
              if (this.seenMessageIds.size % 10 === 0) {
                await this._saveSeenIds();
              }
            } catch (fetchError) {
              console.warn(`[EmailAdapter] Error fetching message ${uid}:`, fetchError.message);
            }
          }

          lock.release();
        } catch (folderError) {
          console.warn(`[EmailAdapter] Error accessing folder ${folder}:`, folderError.message);
        }
      }
    } catch (error) {
      console.error('[EmailAdapter] Error checking emails:', error.message);
      this.emit('error', error);
    }

    return newEmails;
  }

  /**
   * Check if email is from target domain
   * @private
   * @param {string} email - Email address
   * @returns {boolean}
   */
  _isTargetDomain(email) {
    if (!email || this.config.target_domains.length === 0) {
      return false;
    }
    
    const domain = email.split('@')[1];
    if (!domain) return false;
    
    return this.config.target_domains.some(target => 
      domain.toLowerCase().includes(target.toLowerCase())
    );
  }

  /**
   * Get adapter status
   * @returns {Object}
   */
  getStatus() {
    return {
      connected: this.isConnected,
      server: this.config.imap_server,
      folders: this.config.folders,
      seenMessages: this.seenMessageIds.size,
      targetDomains: this.config.target_domains
    };
  }
}

module.exports = { EmailImapAdapter };