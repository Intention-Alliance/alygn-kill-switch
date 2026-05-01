#!/usr/bin/env node
/**
 * Daily Post Counter for Alygn X-Growth
 * 
 * Tracks posts across all cron runs within a single day.
 * Resets at midnight (America/Costa_Rica).
 * Enforces max_per_cron and max_per_day limits.
 * 
 * Usage:
 *   node daily-counter.js --increment          # Add 1 post to today's count
 *   node daily-counter.js --increment=3        # Add 3 posts to today's count
 *   node daily-counter.js --check              # Check if we can post (returns remaining)
 *   node daily-counter.js --status             # Show current status
 *   node daily-counter.js --reset              # Force reset (admin)
 * 
 * Counter file: /home/andlersrv/.openclaw/workspace/reports/alygn/x-daily-counter.json
 */

import fs from 'fs';
import path from 'path';

const COUNTER_PATH = path.join(
  process.env.HOME,
  '.openclaw/workspace/reports/alygn/x-daily-counter.json'
);

const CONFIG = {
  max_per_cron: 3,
  max_per_day: 8,
  timezone: 'America/Costa_Rica'
};

function getTodayCST() {
  return new Date().toLocaleDateString('en-CA', { timeZone: CONFIG.timezone });
}

function needsReset(counter) {
  const today = getTodayCST();
  return counter.date !== today;
}

function loadCounter() {
  let counter;
  try {
    counter = JSON.parse(fs.readFileSync(COUNTER_PATH, 'utf8'));
  } catch {
    counter = {
      date: getTodayCST(),
      posts_today: 0,
      posts_log: [],
      last_reset: null,
      config: CONFIG
    };
  }
  
  if (needsReset(counter)) {
    const today = getTodayCST();
    counter = {
      date: today,
      posts_today: 0,
      posts_log: [],
      last_reset: new Date().toISOString(),
      config: CONFIG
    };
    fs.writeFileSync(COUNTER_PATH, JSON.stringify(counter, null, 2));
    console.log(`🔄 Counter reset for new day: ${today}`);
  }
  
  return counter;
}

function saveCounter(counter) {
  fs.writeFileSync(COUNTER_PATH, JSON.stringify(counter, null, 2));
}

function increment(count = 1) {
  const counter = loadCounter();
  const remaining = CONFIG.max_per_day - counter.posts_today;
  
  if (remaining <= 0) {
    console.log(`🚫 Daily limit reached: ${counter.posts_today}/${CONFIG.max_per_day}`);
    return { success: false, reason: 'daily_limit', remaining: 0 };
  }
  
  const actualIncrement = Math.min(count, remaining);
  counter.posts_today += actualIncrement;
  counter.posts_log.push({
    timestamp: new Date().toISOString(),
    count: actualIncrement,
    new_total: counter.posts_today
  });
  saveCounter(counter);
  
  console.log(`📊 Posts today: ${counter.posts_today}/${CONFIG.max_per_day} (+${actualIncrement})`);
  return { 
    success: true, 
    posts_today: counter.posts_today, 
    remaining: CONFIG.max_per_day - counter.posts_today 
  };
}

function check() {
  const counter = loadCounter();
  const remaining = CONFIG.max_per_day - counter.posts_today;
  const canPost = remaining > 0;
  const maxThisCron = Math.min(CONFIG.max_per_cron, remaining);
  
  const result = {
    can_post: canPost,
    posts_today: counter.posts_today,
    max_per_day: CONFIG.max_per_day,
    remaining,
    max_this_cron: maxThisCron,
    max_per_cron: CONFIG.max_per_cron
  };
  
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function status() {
  const counter = loadCounter();
  console.log(`\n📊 DAILY POST COUNTER`);
  console.log(`====================`);
  console.log(`Date: ${counter.date}`);
  console.log(`Posts today: ${counter.posts_today}/${CONFIG.max_per_day}`);
  console.log(`Remaining: ${CONFIG.max_per_day - counter.posts_today}`);
  console.log(`Max per cron: ${CONFIG.max_per_cron}`);
  console.log(`Last reset: ${counter.last_reset || 'never'}`);
  
  if (counter.posts_log.length > 0) {
    console.log(`\nPost log:`);
    for (const entry of counter.posts_log) {
      console.log(`  ${entry.timestamp}: +${entry.count} (total: ${entry.new_total})`);
    }
  }
}

// CLI
const args = process.argv.slice(2);
let action = null;
let actionValue = null;

for (const arg of args) {
  if (arg.startsWith('--increment')) {
    action = 'increment';
    if (arg.includes('=')) {
      actionValue = parseInt(arg.split('=')[1], 10);
    } else {
      actionValue = 1;
    }
  } else if (arg === '--check') {
    action = 'check';
  } else if (arg === '--status') {
    action = 'status';
  } else if (arg === '--reset') {
    action = 'reset';
  }
}

switch (action) {
  case 'increment':
    increment(actionValue);
    break;
  case 'check':
    check();
    break;
  case 'status':
    status();
    break;
  case 'reset': {
    const counter = {
      date: getTodayCST(),
      posts_today: 0,
      posts_log: [],
      last_reset: new Date().toISOString(),
      config: CONFIG
    };
    saveCounter(counter);
    console.log('🔄 Counter manually reset');
    break;
  }
  default:
    console.log('Usage: node daily-counter.js --increment[=N] | --check | --status | --reset');
}

export { loadCounter, increment, check, CONFIG };