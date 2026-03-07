/**
 * Rate Limiter - X/Twitter API Rate Limiting
 * 
 * Enforces rate limits for X/Twitter engagement to prevent suspension.
 * Tracks actions per day, enforces delays, and auto-pauses on rate limit responses.
 * 
 * Usage:
 *   const rateLimiter = require('../utils/rate-limiter');
 *   await rateLimiter.waitForCapacity('follow');
 *   await rateLimiter.recordAction('follow');
 */

const fs = require('fs');
const path = require('path');

// Rate limit configuration (conservative)
const RATE_LIMITS = {
  follows: { daily: 15, delay: [30000, 120000] },      // 30-120s
  likes: { daily: 20, delay: [30000, 120000] },         // 30-120s
  replies: { daily: 10, delay: [60000, 180000] },       // 60-180s
  quotes: { daily: 5, delay: [120000, 300000] },        // 120-300s
  retweets: { daily: 10, delay: [60000, 120000] }       // 60-120s
};

// State file location
const STATE_FILE = path.join(__dirname, '../../.tmp/rate-limiter-state.json');

// In-memory state
let state = {
  date: new Date().toISOString().split('T')[0],
  actions: {
    follows: 0,
    likes: 0,
    replies: 0,
    quotes: 0,
    retweets: 0
  },
  lastAction: {
    follows: 0,
    likes: 0,
    replies: 0,
    quotes: 0,
    retweets: 0
  },
  paused: false,
  pausedUntil: null,
  pauseReason: null
};

// Load state from file
function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const saved = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      const today = new Date().toISOString().split('T')[0];
      
      // Reset if new day
      if (saved.date !== today) {
        console.log('📅 New day detected, resetting rate limit counters');
        state = {
          date: today,
          actions: { follows: 0, likes: 0, replies: 0, quotes: 0, retweets: 0 },
          lastAction: { follows: 0, likes: 0, replies: 0, quotes: 0, retweets: 0 },
          paused: false,
          pausedUntil: null,
          pauseReason: null
        };
      } else {
        state = saved;
      }
    }
  } catch (error) {
    console.error('⚠️  Failed to load rate limiter state:', error.message);
  }
}

// Save state to file
function saveState() {
  try {
    const dir = path.dirname(STATE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (error) {
    console.error('⚠️  Failed to save rate limiter state:', error.message);
  }
}

// Check if paused
function isPaused() {
  if (!state.paused) return false;
  
  if (state.pausedUntil && Date.now() > state.pausedUntil) {
    console.log('⏰ Pause period expired, resuming operations');
    state.paused = false;
    state.pausedUntil = null;
    state.pauseReason = null;
    saveState();
    return false;
  }
  
  return true;
}

// Pause operations
function pause(durationHours, reason) {
  state.paused = true;
  state.pausedUntil = Date.now() + (durationHours * 60 * 60 * 1000);
  state.pauseReason = reason;
  saveState();
  console.log(`⏸️  Rate limiter paused for ${durationHours}h: ${reason}`);
}

// Wait for capacity
async function waitForCapacity(actionType) {
  loadState();
  
  // Check if paused
  if (isPaused()) {
    const waitMs = state.pausedUntil - Date.now();
    console.log(`⏸️  Rate limiter paused (${state.pauseReason}). Wait ${Math.round(waitMs/60000)}min`);
    throw new Error(`Rate limiter paused: ${state.pauseReason}`);
  }
  
  // Check daily limit
  const limit = RATE_LIMITS[actionType];
  if (!limit) {
    throw new Error(`Unknown action type: ${actionType}`);
  }
  
  if (state.actions[actionType] >= limit.daily) {
    console.log(`🚫 Daily limit reached for ${actionType}: ${state.actions[actionType]}/${limit.daily}`);
    throw new Error(`Daily limit reached for ${actionType}`);
  }
  
  // Check delay since last action
  const lastAction = state.lastAction[actionType];
  if (lastAction > 0) {
    const elapsed = Date.now() - lastAction;
    const minDelay = limit.delay[0];
    const maxDelay = limit.delay[1];
    const randomDelay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
    
    if (elapsed < randomDelay) {
      const waitMs = randomDelay - elapsed;
      console.log(`⏱️  Waiting ${Math.round(waitMs/1000)}s before next ${actionType} (rate limit)`);
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }
  }
  
  return true;
}

// Record action
async function recordAction(actionType) {
  loadState();
  
  state.actions[actionType]++;
  state.lastAction[actionType] = Date.now();
  
  console.log(`✅ Recorded ${actionType}: ${state.actions[actionType]}/${RATE_LIMITS[actionType].daily}`);
  
  saveState();
}

// Handle rate limit response (429)
function handleRateLimitResponse() {
  console.log('🚨 X API rate limit (429) detected. Pausing for 24h.');
  pause(24, 'X API 429 rate limit response');
}

// Handle suspension warning
function handleSuspensionWarning() {
  console.log('🚨 X API suspension warning detected. Pausing for 24h.');
  pause(24, 'X API suspension warning');
}

// Get current status
function getStatus() {
  loadState();
  
  return {
    date: state.date,
    actions: state.actions,
    limits: RATE_LIMITS,
    paused: state.paused,
    pausedUntil: state.pausedUntil,
    pauseReason: state.pauseReason,
    utilization: {
      follows: Math.round(100 * state.actions.follows / RATE_LIMITS.follows.daily),
      likes: Math.round(100 * state.actions.likes / RATE_LIMITS.likes.daily),
      replies: Math.round(100 * state.actions.replies / RATE_LIMITS.replies.daily),
      quotes: Math.round(100 * state.actions.quotes / RATE_LIMITS.quotes.daily),
      retweets: Math.round(100 * state.actions.retweets / RATE_LIMITS.retweets.daily)
    }
  };
}

// Reset counters (for testing)
function resetCounters() {
  state.actions = { follows: 0, likes: 0, replies: 0, quotes: 0, retweets: 0 };
  state.lastAction = { follows: 0, likes: 0, replies: 0, quotes: 0, retweets: 0 };
  state.paused = false;
  state.pausedUntil = null;
  state.pauseReason = null;
  saveState();
  console.log('🔄 Rate limiter counters reset');
}

// Initialize
loadState();

module.exports = {
  waitForCapacity,
  recordAction,
  handleRateLimitResponse,
  handleSuspensionWarning,
  getStatus,
  resetCounters,
  isPaused,
  pause,
  RATE_LIMITS
};
