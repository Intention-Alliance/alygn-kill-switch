#!/usr/bin/env node
/**
 * Quick test for email validation before send
 * Usage: node check-before-send.js <type> <email>
 * Example: node check-before-send.js vc test@example.com
 */

import { ZeroBounceValidator } from './lib/email/validators/ZeroBounceValidator.js';
import { RegexMXValidator } from './lib/email/validators/RegexMXValidator.js';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

function log(title, message, color = 'reset') {
  console.log(`${colors.bold}[${title}]${colors.reset} ${colors[color]}${message}${colors.reset}`);
}

async function checkEmail(type, email) {
  console.log('');
  console.log(`${colors.bold}${'='.repeat(60)}${colors.reset}`);
  console.log(`${colors.cyan}${colors.bold}  Email Validation Check${colors.reset}`);
  console.log(`${colors.bold}${'='.repeat(60)}${colors.reset}`);
  console.log(`  Entity Type: ${type}`);
  console.log(`  Email: ${email}`);
  console.log(`${colors.bold}${'='.repeat(60)}${colors.reset}`);
  console.log('');
  
  // Step 1: Regex + MX validation (Discovery phase)
  log('STEP 1', 'Regex + MX Validation (Discovery)', 'cyan');
  console.log('');
  
  const mxValidator = new RegexMXValidator();
  const mxResult = await mxValidator.validate(email);
  
  console.log(`  Result: ${mxResult.result}`);
  console.log(`  Confidence: ${(mxResult.confidence * 100).toFixed(0)}%`);
  console.log(`  Details:`, mxResult.details);
  
  if (mxResult.result === 'invalid') {
    log('BLOCKED', `Email failed MX validation: ${mxResult.details?.reason}`, 'red');
    return false;
  }
  
  log('PASS', '✓ Email passed MX validation', 'green');
  console.log('');
  
  // Step 2: ZeroBounce validation (Pre-send phase)
  log('STEP 2', 'ZeroBounce Validation (Pre-send)', 'cyan');
  console.log('');
  
  if (!process.env.ZEROBOUNCE_API_KEY) {
    log('SKIP', 'ZEROBOUNCE_API_KEY not set - skipping API validation', 'yellow');
    console.log('  Set ZEROBOUNCE_API_KEY environment variable to enable');
    return true;
  }
  
  const zbValidator = new ZeroBounceValidator({ 
    apiKey: process.env.ZEROBOUNCE_API_KEY 
  });
  
  try {
    const zbResult = await zbValidator.validate(email);
    
    console.log(`  Result: ${zbResult.result}`);
    console.log(`  Confidence: ${(zbResult.confidence * 100).toFixed(0)}%`);
    console.log(`  Status: ${zbResult.details?.rawStatus || 'N/A'}`);
    console.log(`  Details:`, zbResult.details);
    
    if (zbResult.result === 'invalid') {
      log('BLOCKED', `Email failed ZeroBounce validation: ${zbResult.details?.rawStatus}`, 'red');
      return false;
    }
    
    log('PASS', '✓ Email passed ZeroBounce validation', 'green');
    
  } catch (error) {
    log('ERROR', `ZeroBounce API error: ${error.message}`, 'red');
    return false;
  }
  
  console.log('');
  console.log(`${colors.bold}${'='.repeat(60)}${colors.reset}`);
  log('RESULT', '✓ Email validation passed - Ready to send', 'green');
  console.log(`${colors.bold}${'='.repeat(60)}${colors.reset}`);
  console.log('');
  
  return true;
}

// Main
const type = process.argv[2] || 'vc';
const email = process.argv[3];

if (!email) {
  console.log('Usage: node check-before-send.js <type> <email>');
  console.log('Example: node check-before-send.js vc test@example.com');
  process.exit(1);
}

checkEmail(type, email).then(success => {
  process.exit(success ? 0 : 1);
}).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
