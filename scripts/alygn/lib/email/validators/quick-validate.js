/**
 * Quick email validation script
 * 
 * Updated: Mar 19, 2026 - Unified code paths with absolute paths
 */
import path from 'path';

// ABSOLUTE PATHS using $HOME
const WORKSPACE_ROOT = path.resolve(process.env.HOME, '.openclaw/workspace');
const ALYGN_DIR = path.resolve(WORKSPACE_ROOT, 'scripts/alygn');
const EMAIL_DIR = path.resolve(ALYGN_DIR, 'lib/email');
const VALIDATORS_DIR = path.resolve(EMAIL_DIR, 'validators');

// Dynamic imports
const ZeroBounceValidatorModule = await import(path.join(VALIDATORS_DIR, 'ZeroBounceValidator.js'));
const RegexMXValidatorModule = await import(path.join(VALIDATORS_DIR, 'RegexMXValidator.js'));

const { ZeroBounceValidator } = ZeroBounceValidatorModule;
const { RegexMXValidator } = RegexMXValidatorModule;

async function quickValidate(email) {
  console.log(`🔍 Validating: ${email}\n`);
  
  // Regex/MX validation
  const regexValidator = new RegexMXValidator();
  const regexResult = await regexValidator.validate(email);
  
  console.log('Regex/MX Validation:');
  console.log(`  Result: ${regexResult.result}`);
  console.log(`  Confidence: ${regexResult.confidence}`);
  console.log(`  Details:`, regexResult.details);
  console.log();
  
  // ZeroBounce validation (if API key available)
  const apiKey = process.env.ZEROBOUNCE_API_KEY;
  if (apiKey) {
    const zbValidator = new ZeroBounceValidator({ apiKey });
    const zbResult = await zbValidator.validate(email);
    
    console.log('ZeroBounce Validation:');
    console.log(`  Result: ${zbResult.result}`);
    console.log(`  Confidence: ${zbResult.confidence}`);
    console.log(`  Details:`, zbResult.details);
  } else {
    console.log('⚠️  ZEROBOUNCE_API_KEY not set, skipping ZeroBounce validation');
  }
}

// Run if called directly
if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: node quick-validate.js <email>');
    process.exit(1);
  }
  
  quickValidate(email).catch(console.error);
}

export { quickValidate };