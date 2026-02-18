#!/usr/bin/env node
/**
 * ALYGN Daily Jacobo Summary
 * 
 * Runs once daily at 6 PM CST
 * Checks WhatsApp messages with Jacobo (+50663877142) and reports summary
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const JACOBO_PHONE = '+50663877142';
const CONTACT_TRACKING_DIR = path.join(process.env.HOME, '.openclaw', 'workspace', 'contact-tracking');
const JACOBO_FILE = path.join(CONTACT_TRACKING_DIR, 'jacobo.json');
const ALERT_THRESHOLD_HOURS = 48; // Alert if no contact in 48h (2 days)

// Ensure tracking directory exists
if (!fs.existsSync(CONTACT_TRACKING_DIR)) {
  fs.mkdirSync(CONTACT_TRACKING_DIR, { recursive: true });
}

function readTracking() {
  if (!fs.existsSync(JACOBO_FILE)) {
    return { lastContact: null, notes: [], autoTracked: [] };
  }
  
  try {
    return JSON.parse(fs.readFileSync(JACOBO_FILE, 'utf-8'));
  } catch (error) {
    console.error('Error reading tracking file:', error.message);
    return { lastContact: null, notes: [], autoTracked: [] };
  }
}

function saveTracking(data) {
  fs.writeFileSync(JACOBO_FILE, JSON.stringify(data, null, 2));
}

function searchWhatsAppMessages() {
  // Search session logs for WhatsApp messages with Jacobo's number
  const logsDir = path.join(process.env.HOME, '.openclaw', 'logs', 'sessions');
  
  if (!fs.existsSync(logsDir)) {
    return [];
  }
  
  const messages = [];
  const files = fs.readdirSync(logsDir).filter(f => f.endsWith('.jsonl')).sort().reverse();
  
  // Check last 7 days of logs
  for (const file of files.slice(0, 7)) {
    const logPath = path.join(logsDir, file);
    const content = fs.readFileSync(logPath, 'utf-8');
    const lines = content.trim().split('\n').filter(l => l.trim());
    
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        
        // Check if message is from/to Jacobo's number
        if (entry.role === 'user' && entry.content) {
          const content = entry.content.toLowerCase();
          if (content.includes(JACOBO_PHONE) || content.includes('jacobo')) {
            messages.push({
              timestamp: entry.timestamp || file.replace('.jsonl', ''),
              content: entry.content.substring(0, 200)
            });
          }
        }
      } catch (e) {
        // Skip invalid JSON lines
      }
    }
  }
  
  return messages;
}

function generateDailySummary() {
  const tracking = readTracking();
  const recentMessages = searchWhatsAppMessages();
  
  const now = new Date();
  const summary = {
    date: now.toISOString().split('T')[0],
    time: now.toLocaleString('en-US', { timeZone: 'America/Costa_Rica' }),
    lastContact: tracking.lastContact,
    recentMessages: recentMessages.length,
    alert: false,
    message: ''
  };
  
  // Update last contact if we found recent messages
  if (recentMessages.length > 0) {
    const latestMessage = recentMessages[0];
    tracking.lastContact = latestMessage.timestamp;
    tracking.autoTracked = tracking.autoTracked || [];
    tracking.autoTracked.push({
      timestamp: now.toISOString(),
      messagesFound: recentMessages.length
    });
    saveTracking(tracking);
    
    summary.lastContact = latestMessage.timestamp;
    summary.message = `✅ Found ${recentMessages.length} WhatsApp message(s) with Jacobo today`;
    console.log(summary.message);
  } else if (!tracking.lastContact) {
    summary.message = `📋 No Jacobo contact history found yet. Tracking initialized.`;
    console.log(summary.message);
  } else {
    // Check if alert needed
    const lastContactTime = new Date(tracking.lastContact);
    const hoursSinceContact = (now - lastContactTime) / (1000 * 60 * 60);
    
    if (hoursSinceContact >= ALERT_THRESHOLD_HOURS) {
      summary.alert = true;
      summary.message = `⚠️ No Jacobo contact in ${hoursSinceContact.toFixed(1)} hours (${(hoursSinceContact / 24).toFixed(1)} days)`;
      console.log(summary.message);
      console.log(`   Last contact: ${lastContactTime.toLocaleString('en-US', { timeZone: 'America/Costa_Rica' })}`);
      console.log(`   Jacobo phone: ${JACOBO_PHONE}`);
    } else {
      summary.message = `✅ Jacobo contact within threshold (${hoursSinceContact.toFixed(1)}h ago)`;
      console.log(summary.message);
    }
  }
  
  return summary;
}

// Main execution
try {
  console.log('📊 Daily Jacobo Contact Summary\n');
  const summary = generateDailySummary();
  
  if (summary.alert) {
    console.log('\n💡 Tip: Check WhatsApp or reach out to Jacobo');
  }
  
  process.exit(0);
} catch (error) {
  console.error('❌ Jacobo summary failed:', error.message);
  process.exit(1);
}
