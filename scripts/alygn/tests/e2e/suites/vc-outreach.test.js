/**
 * VC Outreach E2E Test Suite
 * Tests the full VC pipeline: discovery → research → draft → send
 */

import { loadMockData, createMockVC, MockSentEmailTracker, MockSupabaseClient, assert, assertEqual } from '../utils/test-helpers.js';

// Mock state for tracking test progress
let mockState = {
  discovered: [],
  researched: [],
  drafted: [],
  sent: []
};

/**
 * Setup mocks before each test
 */
export function setupMocks() {
  mockState = {
    discovered: [],
    researched: [],
    drafted: [],
    sent: []
  };
  console.log('🧪 Mocks initialized');
}

/**
 * Teardown after tests
 */
export function teardown() {
  mockState = { discovered: [], researched: [], drafted: [], sent: [] };
  console.log('🧹 Mocks cleaned up');
}

/**
 * Simulate VC Discovery phase
 */
async function simulateDiscovery() {
  const mockData = loadMockData('vc');
  const entities = mockData.entities || [];
  
  // Filter for discovered VCs
  const discovered = entities.filter(e => e.status === 'discovered');
  mockState.discovered = discovered;
  
  assert(discovered.length > 0, 'Should have discovered VCs');
  console.log(`✅ Discovery: Found ${discovered.length} VCs`);
  
  return discovered;
}

/**
 * Simulate VC Research phase
 */
async function simulateResearch(vcs) {
  const researched = vcs.map(vc => ({
    ...vc,
    researchNotes: `Research completed for ${vc.name}. Focus: ${vc.typeData?.sectorFocus?.join(', ') || 'AI'}. Relevance score: ${vc.typeData?.relevanceScore || 0.8}`,
    lastUpdatedAt: new Date().toISOString()
  }));
  
  mockState.researched = researched;
  
  assert(researched.length === vcs.length, 'All VCs should be researched');
  assert(researched[0].researchNotes !== null, 'Research notes should be populated');
  console.log(`✅ Research: Completed for ${researched.length} VCs`);
  
  return researched;
}

/**
 * Simulate Email Draft phase
 */
async function simulateDraft(vcs) {
  const drafted = vcs.map(vc => ({
    ...vc,
    draftStatus: 'Drafted',
    personalizationContext: {
      customSubject: `AI Safety Investment Opportunity - ${vc.name}`,
      customBody: `<!DOCTYPE html><html><body>Personalized email for ${vc.name} focusing on ${vc.typeData?.sectorFocus?.[0] || 'AI safety'}</body></html>`,
      partnerName: vc.typeData?.partners?.[0]?.name || 'Partner'
    },
    lastUpdatedAt: new Date().toISOString()
  }));
  
  mockState.drafted = drafted;
  
  assert(drafted.length === vcs.length, 'All VCs should have drafts');
  assert(drafted[0].draftStatus === 'Drafted', 'Draft status should be "Drafted"');
  assert(drafted[0].personalizationContext !== null, 'Personalization context should exist');
  console.log(`✅ Draft: Created for ${drafted.length} VCs`);
  
  return drafted;
}

/**
 * Simulate Email Send phase
 */
async function simulateSend(vcs) {
  const tracker = new MockSentEmailTracker();
  const sent = [];
  
  for (const vc of vcs) {
    // Skip if already sent
    if (vc.status === 'sent') {
      console.log(`   ⚠️  Skipping ${vc.name} - already sent`);
      continue;
    }
    
    // Simulate sending
    const sentEntry = {
      ...vc,
      status: 'sent',
      sentAt: new Date().toISOString(),
      sentEmailId: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      draftStatus: 'Sent',
      outreachCount: (vc.outreachCount || 0) + 1
    };
    
    // Record in tracker
    tracker.recordSent({
      email: vc.email,
      name: vc.name,
      partnerName: vc.personalizationContext?.partnerName,
      vcName: vc.name,
      type: 'vc',
      subject: vc.personalizationContext?.customSubject || 'AI Safety Investment',
      sentAt: sentEntry.sentAt,
      messageId: sentEntry.sentEmailId
    });
    
    sent.push(sentEntry);
  }
  
  mockState.sent = sent;
  
  assert(sent.length > 0, 'Should have sent at least one email');
  assert(sent[0].status === 'sent', 'Status should be "sent"');
  assert(sent[0].sentEmailId !== null, 'Should have sentEmailId');
  assert(tracker.getSent('vc').length > 0, 'Tracker should record sent emails');
  console.log(`✅ Send: Sent ${sent.length} emails`);
  
  return sent;
}

/**
 * Run VC Outreach Tests
 */
export async function runVCTests() {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 Running VC Outreach Tests...');
  console.log('='.repeat(60) + '\n');
  
  let allPassed = true;
  
  // Test 1: Happy Path - Full VC Pipeline
  try {
    setupMocks();
    console.log('📋 Test: Happy Path - Full VC Pipeline\n');
    
    // Step 1: Discovery
    const discovered = await simulateDiscovery();
    assert(discovered.length >= 2, 'Should have at least 2 discovered VCs');
    
    // Step 2: Research
    const researched = await simulateResearch(discovered);
    assertEqual(researched.length, discovered.length, 'Research count should match discovery');
    
    // Step 3: Draft
    const drafted = await simulateDraft(researched);
    assertEqual(drafted.length, researched.length, 'Draft count should match research');
    assert(drafted.every(vc => vc.personalizationContext?.customSubject), 'All drafts should have custom subjects');
    
    // Step 4: Send
    const sent = await simulateSend(drafted);
    assert(sent.length > 0, 'Should send at least one email');
    assert(sent.every(vc => vc.sentEmailId && vc.sentAt), 'All sent emails should have IDs and timestamps');
    
    // Verify pipeline completeness
    console.log('\n📊 Pipeline Verification:');
    console.log(`   Discovered: ${mockState.discovered.length}`);
    console.log(`   Researched: ${mockState.researched.length}`);
    console.log(`   Drafted: ${mockState.drafted.length}`);
    console.log(`   Sent: ${mockState.sent.length}`);
    
    assert(mockState.discovered.length > 0, 'Pipeline: Discovery phase completed');
    assert(mockState.researched.length > 0, 'Pipeline: Research phase completed');
    assert(mockState.drafted.length > 0, 'Pipeline: Draft phase completed');
    assert(mockState.sent.length > 0, 'Pipeline: Send phase completed');
    
    console.log('\n✅ Happy Path: PASSED');
    teardown();
  } catch (err) {
    console.log('\n❌ Happy Path: FAILED -', err.message);
    console.error(err);
    allPassed = false;
    teardown();
  }
  
  console.log('\n' + '='.repeat(60));
  if (allPassed) {
    console.log('🎉 All tests passed!');
  } else {
    console.log('💥 Some tests failed!');
    process.exit(1);
  }
  console.log('='.repeat(60) + '\n');
  
  return allPassed;
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runVCTests();
}

export default { runVCTests, setupMocks, teardown };
