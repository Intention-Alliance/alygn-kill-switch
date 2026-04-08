/**
 * Wobblus Orchestrator - Leader Election
 * Prevents duplicate work when multiple sessions run
 */

const LOCK_FILE = '/tmp/wobblus-leader.lock';
const HEARTBEAT_INTERVAL = 30000;
const LOCK_TTL = 60000;

const fs = require('fs');
const os = require('os');

let isLeader = false;
let heartbeatTimer = null;

function isLockFresh() {
  try {
    if (!fs.existsSync(LOCK_FILE)) return false;
    const content = fs.readFileSync(LOCK_FILE, 'utf8').trim();
    const { timestamp } = JSON.parse(content);
    return (Date.now() - timestamp) <= LOCK_TTL;
  } catch { return false; }
}

function acquireLeadership() {
  if (isLockFresh()) {
    isLeader = false;
    console.log('[Wobblus] Follower mode active.');
    return false;
  }
  
  isLeader = true;
  fs.writeFileSync(LOCK_FILE, JSON.stringify({
    timestamp: Date.now(),
    pid: process.pid,
    hostname: os.hostname()
  }, null, 2));
  
  console.log('[Wobblus] Leader mode active.');
  startHeartbeat();
  return true;
}

function heartbeat() {
  if (!isLeader) return;
  try {
    fs.writeFileSync(LOCK_FILE, JSON.stringify({
      timestamp: Date.now(),
      pid: process.pid,
      hostname: os.hostname()
    }, null, 2));
  } catch (err) {
    console.error('[Wobblus] Heartbeat failed:', err.message);
  }
}

function startHeartbeat() {
  if (heartbeatTimer) return;
  heartbeatTimer = setInterval(heartbeat, HEARTBEAT_INTERVAL);
}

function releaseLeadership() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (isLeader) {
    try { fs.unlinkSync(LOCK_FILE); } catch {}
    isLeader = false;
    console.log('[Wobblus] Leadership released.');
  }
}

function isCurrentLeader() {
  return isLeader;
}

// Auto-acquire on module load
acquireLeadership();

// Cleanup on exit
process.on('exit', releaseLeadership);
process.on('SIGINT', () => { releaseLeadership(); process.exit(0); });
process.on('SIGTERM', () => { releaseLeadership(); process.exit(0); });

module.exports = {
  acquireLeadership,
  releaseLeadership,
  isCurrentLeader
};