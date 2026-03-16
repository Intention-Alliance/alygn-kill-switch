/**
 * Simple Logger Utility for VC Outreach
 * 
 * Usage:
 *   import { log, success, error, info, LogLevel } from "../utils/logger.js";
 *   log('Message');
 *   success('Operation complete');
 *   error('Something failed');
 */

const LogLevel = {
  INFO: 'INFO',
  SUCCESS: 'SUCCESS',
  ERROR: 'ERROR',
  WARN: 'WARN'
};

function log(message) {
  console.log(`[${LogLevel.INFO}] ${message}`);
}

function success(message) {
  console.log(`[${LogLevel.SUCCESS}] ✅ ${message}`);
}

function error(message) {
  console.error(`[${LogLevel.ERROR}] ❌ ${message}`);
}

function info(message) {
  console.log(`[${LogLevel.INFO}] ℹ️  ${message}`);
}

function warn(message) {
  console.warn(`[${LogLevel.WARN}] ⚠️  ${message}`);
}

export {
  log,
  success,
  error,
  info,
  warn,
  LogLevel
};