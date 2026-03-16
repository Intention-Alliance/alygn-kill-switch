/**
 * Shared Credentials Loader
 * Centralizes all credential access across automation scripts
 * 
 * Usage:
 *   import { loadCredentials, getNotionKey, getGrokKey } from "../shared/load-credentials.js";
 *   const creds = loadCredentials();
 *   const notionKey = getNotionKey();
 */

import fs from 'fs';
import path from 'path';

const CREDENTIALS_PATH = path.join(
  process.env.HOME,
  '.openclaw',
  'workspace',
  'config',
  'credentials.json'
);

let cachedCredentials = null;

/**
 * Load credentials from centralized config
 * @returns {Object} Credentials object
 */
function loadCredentials() {
  if (cachedCredentials) return cachedCredentials;
  
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error(`Credentials file not found: ${CREDENTIALS_PATH}`);
  }
  
  try {
    const raw = fs.readFileSync(CREDENTIALS_PATH, 'utf8');
    cachedCredentials = JSON.parse(raw);
    return cachedCredentials;
  } catch (error) {
    throw new Error(`Failed to load credentials: ${error.message}`);
  }
}

/**
 * Get specific credential with validation
 */
function getCredential(path, required = true) {
  const creds = loadCredentials();
  const keys = path.split('.');
  let value = creds;
  
  for (const key of keys) {
    value = value?.[key];
  }
  
  if (required && (!value || value === 'PENDING')) {
    throw new Error(`Credential not configured: ${path}`);
  }
  
  return value;
}

// Convenience getters
const getNotionKey = () => getCredential('notion.apiKey');
const getNotionPage = (name) => getCredential(`notion.pages.${name}`);
const getNotionDatabase = (name) => getCredential(`notion.databases.${name}`);
const getGrokKey = () => getCredential('grok.apiKey');
const getGrokModel = () => getCredential('grok.model', false) || 'grok-4-latest';
const getTwitterHandle = () => getCredential('twitter.handle', false);
const getEmailAddress = () => getCredential('email.address', false);
const getElevenLabsKey = () => getCredential('elevenlabs.apiKey', false);
const getWobblusVoice = () => getCredential('elevenlabs.voice.wobblus', false);
const getJacoboPhone = () => getCredential('contacts.jacobo.phone', false);
const getDeliveryPhone = () => getCredential('delivery.whatsapp', false);

/**
 * Check if credential is configured
 */
function hasCredential(path) {
  try {
    const value = getCredential(path, false);
    return value && value !== 'PENDING';
  } catch {
    return false;
  }
}

/**
 * List missing credentials
 */
function getMissingCredentials() {
  const required = [
    'notion.apiKey',
    'grok.apiKey'
  ];
  
  const optional = [
    'twitter.apiKey',
    'email.smtp.password',
    'elevenlabs.apiKey'
  ];
  
  const missing = {
    required: required.filter(p => !hasCredential(p)),
    optional: optional.filter(p => !hasCredential(p))
  };
  
  return missing;
}

export {
    getCredential, getDeliveryPhone, getElevenLabsKey, getEmailAddress, getGrokKey,
    getGrokModel, getJacoboPhone, getMissingCredentials, getNotionDatabase, getNotionKey,
    getNotionPage, getTwitterHandle, getWobblusVoice, hasCredential, loadCredentials
};

// CLI usage
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const cmd = process.argv[2];
  
  if (cmd === 'check') {
    const missing = getMissingCredentials();
    console.log('🔑 Credentials Status\n');
    
    if (missing.required.length > 0) {
      console.log('❌ Missing Required:');
      missing.required.forEach(p => console.log(`   - ${p}`));
      console.log('');
    } else {
      console.log('✅ All required credentials configured\n');
    }
    
    if (missing.optional.length > 0) {
      console.log('⚠️  Missing Optional:');
      missing.optional.forEach(p => console.log(`   - ${p}`));
      console.log('');
    }
    
    process.exit(missing.required.length > 0 ? 1 : 0);
    
  } else if (cmd === 'get') {
    const path = process.argv[3];
    if (!path) {
      console.error('Usage: node load-credentials.js get <path>');
      process.exit(1);
    }
    
    try {
      const value = getCredential(path, false);
      console.log(value || 'NOT_SET');
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
    
  } else {
    console.log('Shared Credentials Loader\n');
    console.log('Usage:');
    console.log('  node load-credentials.js check          # Check credential status');
    console.log('  node load-credentials.js get <path>     # Get specific credential');
    console.log('\nExamples:');
    console.log('  node load-credentials.js check');
    console.log('  node load-credentials.js get notion.apiKey');
    console.log('  node load-credentials.js get contacts.jacobo.phone');
  }
}
