#!/usr/bin/env node
/**
 * Test script for Outreach Listener
 * Verifies all modules load correctly and adapters initialize
 */

const path = require('path');

console.log('═══════════════════════════════════════════════════════');
console.log('🧪 Outreach Listener - Module Test');
console.log('═══════════════════════════════════════════════════════\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (error) {
    console.error(`❌ ${name}: ${error.message}`);
    failed++;
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (error) {
    console.error(`❌ ${name}: ${error.message}`);
    failed++;
  }
}

// Test 1: Load main service
test('Load outreach-listener.js', () => {
  const { OutreachListener, createOutreachListener } = require('./outreach-listener');
  if (!OutreachListener) throw new Error('OutreachListener not exported');
  if (!createOutreachListener) throw new Error('createOutreachListener not exported');
});

// Test 2: Load adapters
test('Load email-imap.js', () => {
  const { EmailImapAdapter } = require('./adapters/email-imap');
  if (!EmailImapAdapter) throw new Error('EmailImapAdapter not exported');
});

test('Load signal-adapter.js', () => {
  const { SignalAdapter } = require('./adapters/signal-adapter');
  if (!SignalAdapter) throw new Error('SignalAdapter not exported');
});

test('Load discord-adapter.js', () => {
  const { DiscordAdapter } = require('./adapters/discord-adapter');
  if (!DiscordAdapter) throw new Error('DiscordAdapter not exported');
});

// Test 3: Load classifier and handler
test('Load intent-classifier.js', () => {
  const { IntentClassifier, PATTERNS, THRESHOLDS } = require('./intent-classifier');
  if (!IntentClassifier) throw new Error('IntentClassifier not exported');
  if (!PATTERNS) throw new Error('PATTERNS not exported');
});

test('Load outreach-handler.js', () => {
  const { OutreachHandler } = require('./handlers/outreach-handler');
  if (!OutreachHandler) throw new Error('OutreachHandler not exported');
});

// Test 4: Load WebSocket Pool framework
test('Load WebSocket Pool framework', () => {
  const { createWebSocketPool } = require('../core/websocket-pool');
  const { createWebSocketLifecycle } = require('../middleware/websocket-lifecycle');
  if (!createWebSocketPool) throw new Error('createWebSocketPool not exported');
  if (!createWebSocketLifecycle) throw new Error('createWebSocketLifecycle not exported');
});

// Test 5: Load configuration
test('Load config/outreach-listener.json', () => {
  const config = require('../config/outreach-listener.json');
  if (!config.channels) throw new Error('channels not configured');
  if (!config.websocket_pool) throw new Error('websocket_pool not configured');
});

// Test 6: Create instances
test('Create OutreachListener instance', () => {
  const { createOutreachListener } = require('./outreach-listener');
  const listener = createOutreachListener({ channels: [] });
  if (!listener) throw new Error('Failed to create listener');
  if (!listener.start) throw new Error('Missing start method');
  if (!listener.stop) throw new Error('Missing stop method');
});

test('Create IntentClassifier instance', () => {
  const { IntentClassifier } = require('./intent-classifier');
  const classifier = new IntentClassifier();
  if (!classifier.classify) throw new Error('Missing classify method');
});

test('Create OutreachHandler instance', () => {
  const { OutreachHandler } = require('./handlers/outreach-handler');
  const handler = new OutreachHandler();
  if (!handler.handle) throw new Error('Missing handle method');
});

// Test 7: Test intent classification
asyncTest('Classify test messages', async () => {
  const { IntentClassifier } = require('./intent-classifier');
  const classifier = new IntentClassifier();
  
  // Test reply detection
  const replyMsg = {
    source: 'email',
    data: {
      subject: 'Re: Meeting',
      body: { text: 'Thanks for the info, let me know if you need anything else.' }
    }
  };
  const replyResult = classifier.classify(replyMsg);
  if (replyResult.classification.intent !== 'reply') {
    throw new Error(`Expected 'reply', got '${replyResult.classification.intent}'`);
  }
  
  // Test urgent detection
  const urgentMsg = {
    source: 'signal',
    data: {
      subject: '',
      body: { text: 'URGENT: Need response ASAP!!!' }
    }
  };
  const urgentResult = classifier.classify(urgentMsg);
  if (urgentResult.classification.intent !== 'urgent') {
    throw new Error(`Expected 'urgent', got '${urgentResult.classification.intent}'`);
  }
  
  // Test spam detection
  const spamMsg = {
    source: 'email',
    data: {
      subject: 'Congratulations! You won!',
      body: { text: 'Click here to claim your crypto prize. Guaranteed returns!' }
    }
  };
  const spamResult = classifier.classify(spamMsg);
  if (spamResult.classification.intent !== 'spam') {
    throw new Error(`Expected 'spam', got '${spamResult.classification.intent}'`);
  }
  
  console.log('   └─ Reply classification: ✅');
  console.log('   └─ Urgent classification: ✅');
  console.log('   └─ Spam classification: ✅');
});

// Test 8: WebSocket Pool integration
test('Create WebSocket Pool instance', () => {
  const { createWebSocketPool } = require('../core/websocket-pool');
  const pool = createWebSocketPool({
    serverId: 'test-server',
    heartbeatInterval: 5000
  });
  if (!pool) throw new Error('Failed to create pool');
  if (pool.serverId !== 'test-server') throw new Error('serverId mismatch');
  pool.close(); // Clean up
});

// Summary
console.log('\n═══════════════════════════════════════════════════════');
console.log(`📊 Results: ${passed} passed, ${failed} failed`);
console.log('═══════════════════════════════════════════════════════\n');

if (failed > 0) {
  console.log('❌ Some tests failed. Check errors above.\n');
  process.exit(1);
} else {
  console.log('✅ All tests passed! Outreach Listener is ready.\n');
  console.log('To start the service:');
  console.log('  node services/outreach-listener.js\n');
  process.exit(0);
}
