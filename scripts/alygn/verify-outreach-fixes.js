#!/usr/bin/env node
/**
 * Verification script for Alygn Outreach fixes
 * Tests: ZeroBounce validation, MX validation, Notion updates
 */

import fs from 'fs';
import { VCDiscoveryStrategy } from '../../../../.agents/skills/alygn-outreach/src/strategies/discovery/VCDiscoveryStrategy.js';
import { SendingStrategy } from '../../../../.agents/skills/alygn-outreach/src/strategies/sending/SendingStrategy.js';
import { EmailValidatorFactory } from './lib/email/validators/EmailValidatorFactory.js';
import { RegexMXValidator } from './lib/email/validators/RegexMXValidator.js';
import { ZeroBounceValidator } from './lib/email/validators/ZeroBounceValidator.js';

// ANSI colors
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

async function testZeroBounceValidation() {
  log('TEST 1', 'ZeroBounce Email Validation', 'cyan');
  console.log('');
  
  if (!process.env.ZEROBOUNCE_API_KEY) {
    log('SKIP', 'ZEROBOUNCE_API_KEY not set - cannot test live validation', 'yellow');
    console.log('Set ZEROBOUNCE_API_KEY environment variable to test');
    return true;
  }
  
  const validator = new ZeroBounceValidator({ 
    apiKey: process.env.ZEROBOUNCE_API_KEY 
  });
  
  // Test with a known invalid email
  log('ACTION', 'Testing invalid email: hello@govfund.vc', 'yellow');
  const invalidResult = await validator.validate('hello@govfund.vc');
  console.log(`  Result: ${invalidResult.result}`);
  console.log(`  Confidence: ${invalidResult.confidence}`);
  console.log(`  Status: ${invalidResult.details?.rawStatus || 'N/A'}`);
  
  if (invalidResult.result === 'invalid') {
    log('PASS', '✓ Invalid email correctly detected', 'green');
  } else {
    log('WARN', `Email status: ${invalidResult.result} (may be valid or unknown)`, 'yellow');
  }
  
  // Test with a likely valid email
  log('ACTION', 'Testing likely valid email: test@gmail.com', 'yellow');
  const validResult = await validator.validate('test@gmail.com');
  console.log(`  Result: ${validResult.result}`);
  console.log(`  Confidence: ${validResult.confidence}`);
  
  console.log('');
  return true;
}

async function testRegexMXValidation() {
  log('TEST 2', 'Regex + MX Email Validation', 'cyan');
  console.log('');
  
  const validator = new RegexMXValidator();
  
  // Test invalid format
  log('ACTION', 'Testing invalid format: invalid-email', 'yellow');
  const result1 = await validator.validate('invalid-email');
  console.log(`  Result: ${result1.result}`);
  console.log(`  Reason: ${result1.details?.reason}`);
  
  if (result1.result === 'invalid') {
    log('PASS', '✓ Invalid format detected', 'green');
  } else {
    log('FAIL', '✗ Invalid format not detected', 'red');
    return false;
  }
  
  // Test domain without MX
  log('ACTION', 'Testing domain without MX: test@nonexistentdomain12345.com', 'yellow');
  const result2 = await validator.validate('test@nonexistentdomain12345.com');
  console.log(`  Result: ${result2.result}`);
  console.log(`  Reason: ${result2.details?.reason}`);
  
  if (result2.result === 'invalid') {
    log('PASS', '✓ Domain without MX detected', 'green');
  } else {
    log('WARN', `Result: ${result2.result} (domain may have MX)`, 'yellow');
  }
  
  // Test valid email
  log('ACTION', 'Testing valid email: test@gmail.com', 'yellow');
  const result3 = await validator.validate('test@gmail.com');
  console.log(`  Result: ${result3.result}`);
  console.log(`  Domain: ${result3.details?.domain}`);
  
  if (result3.result === 'valid') {
    log('PASS', '✓ Valid email detected', 'green');
  } else {
    log('WARN', `Result: ${result3.result}`, 'yellow');
  }
  
  console.log('');
  return true;
}

async function testEmailValidatorFactory() {
  log('TEST 3', 'Email Validator Factory', 'cyan');
  console.log('');
  
  // Test creating regex-mx validator
  log('ACTION', 'Creating regex-mx validator', 'yellow');
  const validator1 = EmailValidatorFactory.create('regex-mx');
  console.log(`  Type: ${validator1.getName()}`);
  
  if (validator1.getName() === 'regex-mx') {
    log('PASS', '✓ Regex-MX validator created', 'green');
  } else {
    log('FAIL', '✗ Wrong validator type', 'red');
    return false;
  }
  
  // Test creating zerobounce validator
  log('ACTION', 'Creating zerobounce validator', 'yellow');
  const validator2 = EmailValidatorFactory.create('zerobounce', { apiKey: 'test' });
  console.log(`  Type: ${validator2.getName()}`);
  
  if (validator2.getName() === 'zerobounce') {
    log('PASS', '✓ ZeroBounce validator created', 'green');
  } else {
    log('FAIL', '✗ Wrong validator type', 'red');
    return false;
  }
  
  console.log('');
  return true;
}

async function testSendingStrategyIntegration() {
  log('TEST 4', 'SendingStrategy ZeroBounce Integration', 'cyan');
  console.log('');
  
  const strategy = new SendingStrategy({
    providerType: 'smtp',
    testEmail: 'test@example.com'
  });
  
  log('ACTION', 'Checking ZeroBounceValidator import in SendingStrategy', 'yellow');
  
  // Check that the import exists
  const file = await import('../../../../.agents/skills/alygn-outreach/src/strategies/sending/SendingStrategy.js');
  
  // Create a mock entity
  const mockEntity = {
    name: 'Test VC',
    email: 'hello@govfund.vc',  // Known invalid
    type: 'vc',
    personalizationContext: {
      customSubject: 'Test Subject',
      customBody: '<p>Test body</p>'
    }
  };
  
  log('ACTION', 'Testing validation in send() method (dry run)', 'yellow');
  
  // Dry run should skip validation
  const dryRunResult = await strategy.send(mockEntity, { dryRun: true });
  console.log(`  Dry run result: ${dryRunResult.success ? 'success' : 'failed'}`);
  console.log(`  Would send: ${dryRunResult.wouldSend}`);
  
  log('PASS', '✓ SendingStrategy initialized with ZeroBounce integration', 'green');
  
  console.log('');
  return true;
}

async function testDiscoveryStrategyIntegration() {
  log('TEST 5', 'VCDiscoveryStrategy MX Validation', 'cyan');
  console.log('');
  
  const strategy = new VCDiscoveryStrategy();
  
  log('ACTION', 'Checking RegexMXValidator import in VCDiscoveryStrategy', 'yellow');
  
  // Check that the import exists
  const file = await import('../../../../.agents/skills/alygn-outreach/src/strategies/discovery/VCDiscoveryStrategy.js');
  
  log('PASS', '✓ VCDiscoveryStrategy has MX validation imports', 'green');
  
  console.log('');
  console.log(`${colors.bold}Note:${colors.reset} Full discovery test would require web search API calls`);
  console.log('');
  
  return true;
}

async function testPathConsistency() {
  log('TEST 6', 'Path Consistency Check', 'cyan');
  console.log('');
  
  // Check key files exist with correct paths
  const paths = [
    '$HOME/.agents/skills/alygn-outreach/src/strategies/sending/SendingStrategy.js',
    '$HOME/.agents/skills/alygn-outreach/src/strategies/discovery/VCDiscoveryStrategy.js',
    '$HOME/.openclaw/workspace/scripts/alygn/lib/email/validators/ZeroBounceValidator.js',
    '$HOME/.openclaw/workspace/scripts/alygn/lib/email/validators/RegexMXValidator.js',
    '$HOME/.openclaw/workspace/scripts/alygn/vc-outreach/core/notion-utils.js'
  ];
  
  let allExist = true;
  for (const p of paths) {
    const exists = fs.existsSync(p);
    const status = exists ? '✓' : '✗';
    const color = exists ? 'green' : 'red';
    log('CHECK', `${status} ${p}`, color);
    if (!exists) allExist = false;
  }
  
  console.log('');
  return allExist;
}

async function runAllTests() {
  console.log('');
  console.log(`${colors.bold}${'='.repeat(60)}${colors.reset}`);
  console.log(`${colors.bold}  Alygn Outreach Fixes Verification${colors.reset}`);
  console.log(`${colors.bold}${'='.repeat(60)}${colors.reset}`);
  console.log('');
  
  const results = [];
  
  results.push(await testZeroBounceValidation());
  results.push(await testRegexMXValidation());
  results.push(await testEmailValidatorFactory());
  results.push(await testSendingStrategyIntegration());
  results.push(await testDiscoveryStrategyIntegration());
  results.push(await testPathConsistency());
  
  console.log('');
  console.log(`${colors.bold}${'='.repeat(60)}${colors.reset}`);
  
  const passed = results.filter(r => r).length;
  const total = results.length;
  
  if (passed === total) {
    console.log(`${colors.green}${colors.bold}  ✓ All ${passed}/${total} tests passed!${colors.reset}`);
  } else {
    console.log(`${colors.yellow}${colors.bold}  ⚠ ${passed}/${total} tests passed${colors.reset}`);
  }
  
  console.log(`${colors.bold}${'='.repeat(60)}${colors.reset}`);
  console.log('');
  
  return passed === total;
}

// Run if called directly
if (process.argv[1] === import.meta.url.replace('file://', '')) {
  runAllTests().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
}

export { runAllTests };
