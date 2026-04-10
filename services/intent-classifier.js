/**
 * Intent Classifier for Outreach Messages
 * 
 * Analyzes incoming messages and determines intent:
 * - reply: Response to previous outreach
 * - new_thread: New conversation/con inquiry
 * - urgent: Time-sensitive or high-priority
 * - spam: Unwanted/automated messages
 * 
 * Uses keyword matching + regex (LLM optional for future enhancement)
 * 
 * @module services/intent-classifier
 */

const EventEmitter = require('events');

/**
 * Intent patterns and keywords
 */
const PATTERNS = {
  // Reply indicators
  reply: {
    keywords: [
      're:', 'reply', 'response', 'thank', 'thanks', 'appreciate',
      'interested', 'following up', 'get back', 'let me know',
      'sounds good', 'agree', 'disagree', 'question', 'clarify'
    ],
    regex: [
      /^re:/i,
      /^on .+ wrote:/i,
      /^>-+/i, // Quoted text
      /thanks? (you|for)/i,
      /appreciate/i,
      /follow(ing)?\s*up/i,
      /get\s*back\s*(to\s*you|to\s*me)/i,
      /let\s*me\s*know/i,
      /sounds?\s*good/i
    ]
  },

  // New thread indicators
  new_thread: {
    keywords: [
      'introduction', 'intro', 'pitch', 'deck', 'startup',
      'investment', 'funding', 'series', 'seed', 'round',
      'meeting', 'call', 'demo', 'presentation', 'opportunity'
    ],
    regex: [
      /^introduction/i,
      /^pitch:/i,
      /would\s*like\s*to\s*(meet|schedule|discuss)/i,
      /are\s*you\s*accepting/i,
      /looking\s*for\s*(investment|funding)/i,
      /check\s*out/i,
      /take\s*a\s*look/i
    ]
  },

  // Urgent indicators
  urgent: {
    keywords: [
      'urgent', 'asap', 'emergency', 'critical', 'immediate',
      'deadline', 'today', 'tomorrow', 'hours', 'rush',
      'priority', 'important', 'time-sensitive', 'expiring'
    ],
    regex: [
      /urgent/i,
      /\basap\b/i,
      /emergency/i,
      /critical/i,
      /immediate\s*(response|attention|action)/i,
      /deadline/i,
      /by\s*(today|tomorrow|eod)/i,
      /within\s*\d+\s*(hours?|days?)/i,
      /time\s*-?\s*sensitive/i,
      /expir(ing|es)/i,
      /!!!+/ // Multiple exclamation marks
    ]
  },

  // Spam indicators
  spam: {
    keywords: [
      'crypto', 'bitcoin', 'forex', 'mlm', 'network marketing',
      'work from home', 'make money', 'guaranteed', 'no risk',
      'click here', 'unsubscribe', 'opt-out', 'promotion',
      'congratulations', 'winner', 'selected', 'lottery'
    ],
    regex: [
      /crypto|bitcoin|ethereum|dogecoin/i,
      /forex\s*trading/i,
      /mlm|multi[- ]*level\s*marketing/i,
      /work\s*from\s*home.*\$/i,
      /make\s*\$?\d+.*(day|week|month)/i,
      /guaranteed\s*(returns?|profit|income)/i,
      /no\s*risk/i,
      /click\s*here\s*to/i,
      /unsubscribe|opt[- ]?out/i,
      /congratulations.*winner/i,
      /you.*selected/i,
      /viagra|cialis|pharmacy/i,
      /nigerian\s*prince/i,
      /inheritance.*million/i,
      /^subject:.*\$\$\$/i
    ]
  }
};

/**
 * Intent weights for scoring
 */
const WEIGHTS = {
  reply: 1.0,
  new_thread: 1.0,
  urgent: 1.5,
  spam: 1.2
};

/**
 * Thresholds for classification
 */
const THRESHOLDS = {
  confident: 2.0,
  moderate: 1.0,
  low: 0.5
};

/**
 * Intent Classifier
 */
class IntentClassifier extends EventEmitter {
  /**
   * @param {Object} options - Configuration
   * @param {boolean} options.useLLM - Use LLM for classification (future)
   * @param {number} options.confidenceThreshold - Minimum confidence to classify
   */
  constructor(options = {}) {
    super();
    
    this.options = {
      useLLM: false, // Reserved for future LLM integration
      confidenceThreshold: THRESHOLDS.moderate,
      ...options
    };
    
    this.stats = {
      classified: 0,
      byIntent: {
        reply: 0,
        new_thread: 0,
        urgent: 0,
        spam: 0,
        unknown: 0
      }
    };
  }

  /**
   * Classify a message
   * @param {Object} message - Message data from adapter
   * @returns {Object} Classification result
   */
  classify(message) {
    const { data, source } = message;
    
    // Extract text content
    const text = this._extractText(data);
    const subject = data.subject || '';
    const combined = `${subject} ${text}`.trim();
    
    // Score each intent
    const scores = {
      reply: this._scoreIntent(combined, 'reply'),
      new_thread: this._scoreIntent(combined, 'new_thread'),
      urgent: this._scoreIntent(combined, 'urgent'),
      spam: this._scoreIntent(combined, 'spam')
    };
    
    // Determine primary intent
    const classification = this._determineIntent(scores, combined);
    
    // Update stats
    this.stats.classified++;
    this.stats.byIntent[classification.intent]++;
    
    // Emit classification event
    const result = {
      original: message,
      classification,
      scores,
      timestamp: Date.now()
    };
    
    this.emit('classified', result);
    
    return result;
  }

  /**
   * Extract text from message data
   * @private
   * @param {Object} data - Message data
   * @returns {string}
   */
  _extractText(data) {
    // Try different body formats
    if (data.body?.text) {
      return data.body.text;
    }
    
    if (data.body?.html) {
      // Strip HTML tags (simple approach)
      return data.body.html.replace(/<[^>]*>/g, ' ');
    }
    
    if (typeof data.body === 'string') {
      return data.body;
    }
    
    return '';
  }

  /**
   * Score an intent category
   * @private
   * @param {string} text - Text to analyze
   * @param {string} intent - Intent category
   * @returns {number} Score
   */
  _scoreIntent(text, intent) {
    const patterns = PATTERNS[intent];
    if (!patterns) return 0;
    
    let score = 0;
    const lowerText = text.toLowerCase();
    
    // Keyword matches
    for (const keyword of patterns.keywords) {
      if (lowerText.includes(keyword.toLowerCase())) {
        score += 0.3;
      }
    }
    
    // Regex matches (higher weight)
    for (const regex of patterns.regex) {
      if (regex.test(text)) {
        score += 0.8;
      }
    }
    
    // Apply weight
    return score * WEIGHTS[intent];
  }

  /**
   * Determine primary intent from scores
   * @private
   * @param {Object} scores - Score object
   * @param {string} text - Original text
   * @returns {Object} Classification
   */
  _determineIntent(scores, text) {
    // Check for spam first (overrides other intents)
    if (scores.spam >= THRESHOLDS.low) {
      return {
        intent: 'spam',
        confidence: Math.min(scores.spam / THRESHOLDS.confident, 1.0),
        reason: 'Spam indicators detected',
        action: 'ignore'
      };
    }
    
    // Check for urgent (high priority)
    if (scores.urgent >= THRESHOLDS.moderate) {
      return {
        intent: 'urgent',
        confidence: Math.min(scores.urgent / THRESHOLDS.confident, 1.0),
        reason: 'Urgent keywords detected',
        action: 'alert'
      };
    }
    
    // Check for reply
    if (scores.reply >= THRESHOLDS.moderate) {
      return {
        intent: 'reply',
        confidence: Math.min(scores.reply / THRESHOLDS.confident, 1.0),
        reason: 'Reply indicators detected',
        action: 'log_reply'
      };
    }
    
    // Check for new thread
    if (scores.new_thread >= THRESHOLDS.low) {
      return {
        intent: 'new_thread',
        confidence: Math.min(scores.new_thread / THRESHOLDS.confident, 1.0),
        reason: 'New conversation indicators',
        action: 'create_thread'
      };
    }
    
    // Default: unknown
    return {
      intent: 'unknown',
      confidence: 0,
      reason: 'No clear intent detected',
      action: 'log'
    };
  }

  /**
   * Get classification statistics
   * @returns {Object}
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      classified: 0,
      byIntent: {
        reply: 0,
        new_thread: 0,
        urgent: 0,
        spam: 0,
        unknown: 0
      }
    };
  }
}

module.exports = { IntentClassifier, PATTERNS, THRESHOLDS };