/**
 * E2E Test Helpers
 * Utilities for testing VC and Municipal outreach pipelines
 */

import fs from 'fs';
import path from 'path';

// Test configuration
const TEST_CONFIG = {
  timeout: 30000, // 30 seconds default timeout
  fixturesDir: path.join(__dirname, '../fixtures'),
  reportsDir: path.join(process.env.HOME || '', '.openclaw/workspace/reports/alygn'),
  stateFiles: {
    vc: {
      discovered: 'vc-discover',
      validated: 'vc-validate',
      researched: 'vc-research',
      personalized: 'vc-personalize',
      sent: 'vc-sent'
    },
    municipal: {
      discovered: 'muni-discover',
      validated: 'muni-validate',
      researched: 'muni-research',
      personalized: 'muni-personalize',
      sent: 'muni-sent'
    }
  }
};

/**
 * Load mock data from fixtures
 */
export function loadMockData(type) {
  const filename = type === 'vc' ? 'mock-vc-data.json' : 'mock-muni-data.json';
  const filepath = path.join(TEST_CONFIG.fixturesDir, filename);
  
  if (!fs.existsSync(filepath)) {
    throw new Error(`Mock data file not found: ${filepath}`);
  }
  
  const content = fs.readFileSync(filepath, 'utf8');
  return JSON.parse(content);
}

/**
 * Create a mock entity for testing
 */
export function createMockEntity(type, overrides = {}) {
  const baseEntity = {
    id: `test-${type}-${Date.now()}`,
    type,
    name: `Test ${type.toUpperCase()} Entity`,
    email: `test@example.com`,
    website: 'https://example.com',
    phone: '+1-555-0100',
    location: {
      city: 'Test City',
      state: 'TS',
      country: 'Test Country',
      region: 'Test Region'
    },
    status: 'discovered',
    priority: 'medium',
    discoveredAt: new Date().toISOString(),
    lastUpdatedAt: new Date().toISOString(),
    outreachCount: 0,
    researchNotes: null,
    personalizationContext: null,
    typeData: {},
    emailValidation: null,
    sentEmailId: null,
    sentAt: null,
    draftStatus: 'Not drafted'
  };
  
  return { ...baseEntity, ...overrides };
}

/**
 * Create mock VC entity
 */
export function createMockVC(overrides = {}) {
  return createMockEntity('vc', {
    name: 'Test VC Fund',
    email: 'partner@testvc.com',
    typeData: {
      firmType: 'vc',
      stageFocus: ['seed', 'series-a'],
      sectorFocus: ['AI', 'enterprise'],
      checkSizeMin: 500000,
      checkSizeMax: 5000000,
      aum: 100000000,
      partners: [
        {
          name: 'Test Partner',
          title: 'Managing Partner',
          email: 'partner@testvc.com',
          focus: 'AI investments'
        }
      ],
      relevanceScore: 0.85
    },
    ...overrides
  });
}

/**
 * Create mock Municipal entity
 */
export function createMockMunicipal(overrides = {}) {
  return createMockEntity('municipal', {
    name: 'Municipalidad de Test',
    email: 'alcalde@test.go.cr',
    location: {
      city: 'Test City',
      state: null,
      country: 'Costa Rica',
      region: 'Test Province'
    },
    typeData: {
      governmentType: 'city',
      population: 100000,
      budget: 50000000,
      province: 'Test Province',
      departments: [
        { name: 'Tecnología', focus: ['digital transformation'] }
      ],
      keyContacts: [
        {
          name: 'Test Mayor',
          title: 'Mayor',
          email: 'alcalde@test.go.cr',
          isDecisionMaker: true
        }
      ],
      initiatives: [
        { name: 'Smart City Initiative', description: 'Digital transformation', status: 'active' }
      ],
      painPoints: ['Complejidad de la transformación digital'],
      trAigaRelevant: true,
      decisionMakers: [
        { name: 'Test Mayor', title: 'Mayor', influence: 'high' }
      ]
    },
    ...overrides
  });
}

/**
 * Wait for condition with timeout
 */
export async function waitFor(condition, timeout = TEST_CONFIG.timeout) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  throw new Error(`Timeout waiting for condition after ${timeout}ms`);
}

/**
 * Mock SentEmailTracker for testing
 */
export class MockSentEmailTracker {
  constructor() {
    this.sentEmails = {
      vcs: [],
      municipalities: []
    };
  }
  
  wasAlreadySent(email, partnerName, type = 'vc') {
    const key = type === 'vc' ? 'vcs' : 'municipalities';
    
    if (!email) return false;
    
    if (type === 'vc' && partnerName) {
      return this.sentEmails[key].some(entry =>
        entry.email.toLowerCase() === email.toLowerCase() &&
        entry.partnerName === partnerName
      );
    }
    
    return this.sentEmails[key].some(entry =>
      entry.email.toLowerCase() === email.toLowerCase()
    );
  }
  
  recordSent(params) {
    const { email, name, partnerName, vcName, type, subject, sentAt, messageId } = params;
    const key = type === 'vc' ? 'vcs' : 'municipalities';
    
    const entry = {
      email,
      name,
      partnerName: partnerName || null,
      vcName: vcName || name,
      subject,
      sentAt: sentAt || new Date().toISOString(),
      messageId: messageId || `test-${Date.now()}`
    };
    
    // Check if already exists
    const existingIndex = this.sentEmails[key].findIndex(e =>
      e.email.toLowerCase() === email.toLowerCase()
    );
    
    if (existingIndex >= 0) {
      this.sentEmails[key][existingIndex] = entry;
    } else {
      this.sentEmails[key].push(entry);
    }
  }
  
  getSent(type) {
    const key = type === 'vc' ? 'vcs' : 'municipalities';
    return this.sentEmails[key];
  }
  
  clearAll() {
    this.sentEmails = { vcs: [], municipalities: [] };
  }
}

/**
 * Mock Supabase client for testing
 */
export class MockSupabaseClient {
  constructor() {
    this.tables = {
      municipalities: [],
      vcs: [],
      outreach_emails: [],
      political_figures: []
    };
    this.lastInsert = null;
    this.lastUpdate = null;
  }
  
  from(table) {
    return {
      select: (columns) => ({
        eq: (column, value) => ({
          maybeSingle: async () => {
            const data = this.tables[table]?.find(row => row[column] === value);
            return { data, error: null };
          },
          single: async () => {
            const data = this.tables[table]?.find(row => row[column] === value);
            if (!data) {
              return { data: null, error: { message: 'Not found' } };
            }
            return { data, error: null };
          }
        }),
        not: (column, operator, value) => ({
          maybeSingle: async () => {
            // Filter out null values
            const data = this.tables[table]?.find(row => row[column] != null);
            return { data, error: null };
          }
        })
      }),
      insert: (data) => ({
        select: () => ({
          single: async () => {
            this.lastInsert = { table, data };
            return { data: { id: `test-${Date.now()}`, ...data }, error: null };
          }
        })
      }),
      update: (data) => ({
        eq: (column, value) => ({
          select: () => ({
            single: async () => {
              this.lastUpdate = { table, data, column, value };
              return { data: { ...data }, error: null };
            }
          })
        })
      })
    };
  }
  
  reset() {
    this.tables = {
      municipalities: [],
      vcs: [],
      outreach_emails: [],
      political_figures: []
    };
    this.lastInsert = null;
    this.lastUpdate = null;
  }
}

/**
 * Create temporary state file for testing
 */
export function createTempStateFile(type, phase, data) {
  const subFolder = TEST_CONFIG.stateFiles[type][phase];
  const dir = path.join(TEST_CONFIG.reportsDir, subFolder);
  
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  const timestamp = new Date().toISOString().split('T')[0];
  const filename = `alygn-${type}-${phase}-${timestamp}.json`;
  const filepath = path.join(dir, filename);
  
  fs.writeFileSync(filepath, JSON.stringify({
    timestamp: new Date().toISOString(),
    type,
    phase,
    data
  }, null, 2));
  
  return filepath;
}

/**
 * Clean up test state files
 */
export function cleanupTestStateFiles(pattern = 'test-') {
  const patterns = [
    path.join(TEST_CONFIG.reportsDir, 'vc-discover', `alygn-vc-discovered-*.json`),
    path.join(TEST_CONFIG.reportsDir, 'vc-validate', `alygn-vc-validated-*.json`),
    path.join(TEST_CONFIG.reportsDir, 'vc-research', `alygn-vc-researched-*.json`),
    path.join(TEST_CONFIG.reportsDir, 'vc-personalize', `alygn-vc-personalized-*.json`),
    path.join(TEST_CONFIG.reportsDir, 'vc-sent', `alygn-vc-sent-*.json`),
    path.join(TEST_CONFIG.reportsDir, 'muni-discover', `alygn-municipal-discovered-*.json`),
    path.join(TEST_CONFIG.reportsDir, 'muni-validate', `alygn-municipal-validated-*.json`),
    path.join(TEST_CONFIG.reportsDir, 'muni-research', `alygn-municipal-researched-*.json`),
    path.join(TEST_CONFIG.reportsDir, 'muni-personalize', `alygn-municipal-personalized-*.json`),
    path.join(TEST_CONFIG.reportsDir, 'muni-sent', `alygn-municipal-sent-*.json`)
  ];
  
  // Note: This is a simplified cleanup - in production, use glob or rimraf
  patterns.forEach(pattern => {
    try {
      const dir = path.dirname(pattern);
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir);
        files.forEach(file => {
          if (file.includes(pattern) || file.startsWith('test-')) {
            fs.unlinkSync(path.join(dir, file));
          }
        });
      }
    } catch (err) {
      // Ignore cleanup errors
    }
  });
}

/**
 * Assert helper for tests
 */
export function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

/**
 * Assert equal helper
 */
export function assertEqual(actual, expected, message = '') {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message}\nExpected: ${expected}\nActual: ${actual}`);
  }
}

/**
 * Assert deep equal helper
 */
export function assertDeepEqual(actual, expected, message = '') {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Assertion failed: ${message}\nExpected: ${JSON.stringify(expected)}\nActual: ${JSON.stringify(actual)}`);
  }
}

/**
 * Assert throws helper
 */
export async function assertThrows(fn, expectedMessage = null) {
  try {
    await fn();
    throw new Error('Expected function to throw, but it did not');
  } catch (error) {
    if (expectedMessage && !error.message.includes(expectedMessage)) {
      throw new Error(`Expected error message to include "${expectedMessage}", got: "${error.message}"`);
    }
    return true;
  }
}

/**
 * Test result collector
 */
export class TestResultCollector {
  constructor() {
    this.results = [];
    this.startTime = Date.now();
  }
  
  pass(testName, details = {}) {
    this.results.push({
      name: testName,
      status: 'PASS',
      duration: Date.now() - this.startTime,
      ...details
    });
  }
  
  fail(testName, error, details = {}) {
    this.results.push({
      name: testName,
      status: 'FAIL',
      error: error.message,
      duration: Date.now() - this.startTime,
      ...details
    });
  }
  
  skip(testName, reason = '') {
    this.results.push({
      name: testName,
      status: 'SKIP',
      reason,
      duration: 0
    });
  }
  
  getSummary() {
    const passed = this.results.filter(r => r.status === 'PASS').length;
    const failed = this.results.filter(r => r.status === 'FAIL').length;
    const skipped = this.results.filter(r => r.status === 'SKIP').length;
    
    return {
      total: this.results.length,
      passed,
      failed,
      skipped,
      duration: Date.now() - this.startTime,
      success: failed === 0
    };
  }
  
  printSummary() {
    const summary = this.getSummary();
    
    console.log('\n' + '='.repeat(80));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(80));
    console.log(`   Total: ${summary.total}`);
    console.log(`   ✅ Passed: ${summary.passed}`);
    console.log(`   ❌ Failed: ${summary.failed}`);
    console.log(`   ⏭️  Skipped: ${summary.skipped}`);
    console.log(`   ⏱️  Duration: ${summary.duration}ms`);
    console.log('='.repeat(80));
    
    if (summary.failed > 0) {
      console.log('\n❌ FAILED TESTS:');
      this.results
        .filter(r => r.status === 'FAIL')
        .forEach(r => {
          console.log(`   - ${r.name}: ${r.error}`);
        });
    }
    
    return summary;
  }
}

export default {
  TEST_CONFIG,
  loadMockData,
  createMockEntity,
  createMockVC,
  createMockMunicipal,
  waitFor,
  MockSentEmailTracker,
  MockSupabaseClient,
  createTempStateFile,
  cleanupTestStateFiles,
  assert,
  assertEqual,
  assertDeepEqual,
  assertThrows,
  TestResultCollector
};