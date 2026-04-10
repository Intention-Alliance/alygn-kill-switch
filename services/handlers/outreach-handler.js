/**
 * Outreach Action Handlers
 * 
 * Handles classified intents:
 * - handleReply: Update Notion conversation log
 * - handleNewThread: Create new outreach thread
 * - handleUrgent: Alert Tania via Signal/WhatsApp
 * - handleSpam: Mark and ignore
 * 
 * @module services/handlers/outreach-handler
 */

const EventEmitter = require('events');
const { Client: NotionClient } = require('@notionhq/client');
const fs = require('fs').promises;
const path = require('path');

/**
 * Outreach Handler
 */
class OutreachHandler extends EventEmitter {
  /**
   * @param {Object} config - Configuration
   * @param {Object} config.notion - Notion config
   * @param {string} config.notion.apiKey - Notion API key
   * @param {string} config.notion.conversation_db_id - Conversation database ID
   * @param {Object} config.urgent_contacts - Urgent contact info
   * @param {Object} signalAdapter - Signal adapter instance
   * @param {Object} discordAdapter - Discord adapter instance
   */
  constructor(config = {}, signalAdapter = null, discordAdapter = null) {
    super();
    
    this.config = {
      notion: {
        apiKey: config.notion?.apiKey || process.env.NOTION_API_KEY,
        conversation_db_id: config.notion?.conversation_db_id
      },
      urgent_contacts: config.urgent_contacts || {},
      ...config
    };
    
    this.signalAdapter = signalAdapter;
    this.discordAdapter = discordAdapter;
    
    // Initialize Notion client
    this.notion = null;
    if (this.config.notion.apiKey) {
      this.notion = new NotionClient({
        auth: this.config.notion.apiKey
      });
    }
    
    // Local fallback storage
    this.localLogs = [];
    this.localLogFile = path.join(process.cwd(), 'state', 'outreach-logs.json');
    
    // Stats
    this.stats = {
      handled: 0,
      byAction: {
        reply: 0,
        new_thread: 0,
        urgent: 0,
        spam: 0,
        unknown: 0
      }
    };
  }

  /**
   * Handle a classified message
   * @param {Object} classified - Classified message from intent classifier
   * @returns {Promise<Object>} Handler result
   */
  async handle(classified) {
    const { intent, action } = classified.classification;
    
    this.stats.handled++;
    this.stats.byAction[intent] = (this.stats.byAction[intent] || 0) + 1;
    
    let result;
    
    switch (intent) {
      case 'reply':
        result = await this.handleReply(classified);
        break;
      case 'new_thread':
        result = await this.handleNewThread(classified);
        break;
      case 'urgent':
        result = await this.handleUrgent(classified);
        break;
      case 'spam':
        result = await this.handleSpam(classified);
        break;
      default:
        result = await this.handleUnknown(classified);
    }
    
    this.emit('handled', { classified, result });
    return result;
  }

  /**
   * Handle reply - Update Notion conversation log
   * @param {Object} classified - Classified message
   * @returns {Promise<Object>}
   */
  async handleReply(classified) {
    const { original } = classified;
    const { data, source } = original;
    
    console.log(`[OutreachHandler] Handling reply from ${data.from?.username || data.from?.address || 'unknown'}`);
    
    const logEntry = {
      type: 'reply',
      timestamp: new Date().toISOString(),
      source,
      from: data.from,
      subject: data.subject || '',
      preview: this._getPreview(data.body?.text),
      threadId: data.replyTo || data.id,
      context: data.context || null
    };
    
    // Try Notion first
    if (this.notion && this.config.notion.conversation_db_id) {
      try {
        const page = await this._createNotionPage(logEntry);
        logEntry.notionId = page.id;
        logEntry.notionUrl = page.url;
        console.log(`[OutreachHandler] Reply logged to Notion: ${page.url}`);
      } catch (error) {
        console.warn('[OutreachHandler] Notion failed, using local log:', error.message);
        await this._logLocally(logEntry);
      }
    } else {
      await this._logLocally(logEntry);
    }
    
    this.stats.byAction.reply++;
    
    return {
      success: true,
      action: 'reply_logged',
      logEntry
    };
  }

  /**
   * Handle new thread - Create new outreach thread
   * @param {Object} classified - Classified message
   * @returns {Promise<Object>}
   */
  async handleNewThread(classified) {
    const { original } = classified;
    const { data, source } = original;
    
    console.log(`[OutreachHandler] New thread from ${data.from?.username || data.from?.address || 'unknown'}`);
    
    const threadEntry = {
      type: 'new_thread',
      timestamp: new Date().toISOString(),
      source,
      from: data.from,
      subject: data.subject || 'New Inquiry',
      preview: this._getPreview(data.body?.text),
      status: 'new',
      priority: 'normal',
      assignedTo: null
    };
    
    // Try Notion first
    if (this.notion && this.config.notion.conversation_db_id) {
      try {
        const page = await this._createNotionPage(threadEntry, {
          status: 'New',
          priority: 'Normal'
        });
        threadEntry.notionId = page.id;
        threadEntry.notionUrl = page.url;
        console.log(`[OutreachHandler] New thread created in Notion: ${page.url}`);
      } catch (error) {
        console.warn('[OutreachHandler] Notion failed, using local log:', error.message);
        await this._logLocally(threadEntry);
      }
    } else {
      await this._logLocally(threadEntry);
    }
    
    this.stats.byAction.new_thread++;
    
    return {
      success: true,
      action: 'thread_created',
      threadEntry
    };
  }

  /**
   * Handle urgent - Alert Tania via Signal/WhatsApp
   * @param {Object} classified - Classified message
   * @returns {Promise<Object>}
   */
  async handleUrgent(classified) {
    const { original, classification } = classified;
    const { data, source } = original;
    
    console.log(`[OutreachHandler] URGENT message detected: ${classification.reason}`);
    
    // Get Tania's contact info
    const taniaContact = this.config.urgent_contacts?.tania;
    
    if (!taniaContact) {
      console.warn('[OutreachHandler] No urgent contact configured');
      await this._logLocally({
        type: 'urgent',
        timestamp: new Date().toISOString(),
        source,
        from: data.from,
        subject: data.subject || '',
        preview: this._getPreview(data.body?.text),
        alertSent: false,
        reason: 'No contact configured'
      });
      
      return {
        success: false,
        action: 'urgent_no_contact',
        reason: 'No urgent contact configured'
      };
    }
    
    // Build alert message
    const alertMessage = this._buildUrgentAlert(original, classification);
    
    let alertSent = false;
    let alertMethod = null;
    
    // Try Signal first
    if (this.signalAdapter && taniaContact.signal) {
      try {
        const sent = await this.signalAdapter.sendMessage(taniaContact.signal, alertMessage);
        if (sent) {
          alertSent = true;
          alertMethod = 'signal';
          console.log('[OutreachHandler] Urgent alert sent via Signal');
        }
      } catch (error) {
        console.warn('[OutreachHandler] Signal alert failed:', error.message);
      }
    }
    
    // Try Discord as fallback
    if (!alertSent && this.discordAdapter && taniaContact.discord_channel) {
      try {
        const sent = await this.discordAdapter.sendMessage(
          taniaContact.discord_channel,
          `🚨 **URGENT MESSAGE**\n\n${alertMessage}`
        );
        if (sent) {
          alertSent = true;
          alertMethod = 'discord';
          console.log('[OutreachHandler] Urgent alert sent via Discord');
        }
      } catch (error) {
        console.warn('[OutreachHandler] Discord alert failed:', error.message);
      }
    }
    
    // Log the urgent message
    await this._logLocally({
      type: 'urgent',
      timestamp: new Date().toISOString(),
      source,
      from: data.from,
      subject: data.subject || '',
      preview: this._getPreview(data.body?.text),
      alertSent,
      alertMethod,
      classification: classification.reason
    });
    
    this.stats.byAction.urgent++;
    
    return {
      success: alertSent,
      action: 'urgent_alert',
      alertSent,
      alertMethod,
      message: alertMessage
    };
  }

  /**
   * Handle spam - Mark and ignore
   * @param {Object} classified - Classified message
   * @returns {Promise<Object>}
   */
  async handleSpam(classified) {
    const { original } = classified;
    const { data, source } = original;
    
    console.log(`[OutreachHandler] SPAM detected from ${data.from?.username || data.from?.address || 'unknown'}`);
    
    const spamEntry = {
      type: 'spam',
      timestamp: new Date().toISOString(),
      source,
      from: data.from,
      subject: data.subject || '',
      preview: this._getPreview(data.body?.text),
      action: 'ignored',
      reason: classified.classification.reason
    };
    
    // Log spam for review (don't notify)
    await this._logLocally(spamEntry);
    
    this.stats.byAction.spam++;
    
    return {
      success: true,
      action: 'spam_ignored',
      spamEntry
    };
  }

  /**
   * Handle unknown intent
   * @param {Object} classified - Classified message
   * @returns {Promise<Object>}
   */
  async handleUnknown(classified) {
    const { original } = classified;
    const { data, source } = original;
    
    console.log(`[OutreachHandler] Unknown intent from ${data.from?.username || data.from?.address || 'unknown'}`);
    
    const unknownEntry = {
      type: 'unknown',
      timestamp: new Date().toISOString(),
      source,
      from: data.from,
      subject: data.subject || '',
      preview: this._getPreview(data.body?.text),
      action: 'logged_for_review',
      scores: classified.scores
    };
    
    await this._logLocally(unknownEntry);
    
    this.stats.byAction.unknown++;
    
    return {
      success: true,
      action: 'unknown_logged',
      unknownEntry
    };
  }

  /**
   * Create a Notion page for the conversation
   * @private
   * @param {Object} entry - Log entry
   * @param {Object} properties - Additional properties
   * @returns {Promise<Object>}
   */
  async _createNotionPage(entry, properties = {}) {
    if (!this.notion) {
      throw new Error('Notion client not initialized');
    }
    
    const page = await this.notion.pages.create({
      parent: { database_id: this.config.notion.conversation_db_id },
      properties: {
        Name: {
          title: [
            {
              text: {
                content: entry.subject || entry.type
              }
            }
          ]
        },
        Date: {
          date: {
            start: entry.timestamp
          }
        },
        Source: {
          select: {
            name: entry.source
          }
        },
        Status: properties.status ? {
          select: {
            name: properties.status
          }
        } : undefined,
        Priority: properties.priority ? {
          select: {
            name: properties.priority
          }
        } : undefined
      },
      children: [
        {
          paragraph: {
            rich_text: [
              {
                text: {
                  content: `From: ${entry.from?.name || entry.from?.username || entry.from?.address || 'Unknown'}`
                }
              }
            ]
          }
        },
        {
          paragraph: {
            rich_text: [
              {
                text: {
                  content: entry.preview || 'No content'
                }
              }
            ]
          }
        }
      ]
    });
    
    return page;
  }

  /**
   * Log entry locally (fail-open fallback)
   * @private
   * @param {Object} entry - Log entry
   */
  async _logLocally(entry) {
    this.localLogs.push(entry);
    
    try {
      await fs.mkdir(path.dirname(this.localLogFile), { recursive: true });
      await fs.writeFile(
        this.localLogFile,
        JSON.stringify(this.localLogs, null, 2),
        'utf8'
      );
    } catch (error) {
      console.warn('[OutreachHandler] Failed to write local log:', error.message);
    }
  }

  /**
   * Get text preview (first 200 chars)
   * @private
   * @param {string} text - Full text
   * @returns {string}
   */
  _getPreview(text) {
    if (!text) return '';
    const clean = text.replace(/<[^>]*>/g, ' ').trim();
    return clean.length > 200 ? clean.substring(0, 200) + '...' : clean;
  }

  /**
   * Build urgent alert message
   * @private
   * @param {Object} original - Original message
   * @param {Object} classification - Classification result
   * @returns {string}
   */
  _buildUrgentAlert(original, classification) {
    const { data, source } = original;
    
    return `🚨 URGENT MESSAGE DETECTED

Source: ${source}
From: ${data.from?.name || data.from?.username || data.from?.address || 'Unknown'}
Subject: ${data.subject || 'No subject'}

Reason: ${classification.reason}

Preview: ${this._getPreview(data.body?.text)}

Please review immediately.`;
  }

  /**
   * Get handler statistics
   * @returns {Object}
   */
  getStats() {
    return { ...this.stats };
  }
}

module.exports = { OutreachHandler };