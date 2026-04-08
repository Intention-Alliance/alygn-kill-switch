import { loadMockData, createMockMunicipal, MockSupabaseClient, MockSentEmailTracker, assert, assertEqual } from '../utils/test-helpers.js';

// Mock data cache
let mockMuniData = null;

/**
 * Setup mocks for testing
 */
function setupMocks() {
  // Load mock data from fixtures
  const fixtureData = loadMockData('municipal');
  mockMuniData = fixtureData.entities || [];
  
  // Create mock clients
  global.mockSupabase = new MockSupabaseClient();
  global.mockEmailTracker = new MockSentEmailTracker();
  
  console.log('✅ Mocks setup complete');
}

/**
 * Teardown after tests
 */
function teardown() {
  mockMuniData = null;
  global.mockSupabase = null;
  global.mockEmailTracker = null;
  
  console.log('✅ Teardown complete');
}

/**
 * Simulate discovery phase - loads cantones from Costa Rica
 */
async function simulateDiscovery() {
  console.log('  📍 Phase 1: Discovery - Loading cantones...');
  
  // Verify mock data contains Costa Rica municipalities
  const crMunicipalities = mockMuniData.filter(m => 
    m.location?.country === 'Costa Rica'
  );
  
  assert(crMunicipalities.length > 0, 'Should have Costa Rica municipalities');
  console.log(`     Found ${crMunicipalities.length} CR municipalities`);
  
  // Verify provinces (cantones) are present
  const provinces = [...new Set(crMunicipalities.map(m => m.location?.region))];
  assert(provinces.length >= 4, 'Should have at least 4 provinces');
  console.log(`     Provinces: ${provinces.join(', ')}`);
  
  return crMunicipalities;
}

/**
 * Simulate warmup phase - validates and warms up email addresses
 */
async function simulateWarmup(entities) {
  console.log('  🔥 Phase 2: Warmup - Validating emails...');
  
  const validated = [];
  
  for (const entity of entities) {
    // Check email exists
    assert(entity.email, `Entity ${entity.name} should have an email`);
    
    // Check email format (basic validation)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    assert(emailRegex.test(entity.email), `Email ${entity.email} should be valid format`);
    
    // Simulate warmup (mark as validated)
    entity.emailValidation = { status: 'valid', warmed: true };
    validated.push(entity);
    
    console.log(`     ✅ ${entity.name}: ${entity.email}`);
  }
  
  assertEqual(validated.length, entities.length, 'All entities should be validated');
  
  return validated;
}

/**
 * Simulate draft phase - creates personalized outreach content
 */
async function simulateDraft(entities) {
  console.log('  ✍️  Phase 3: Draft - Creating personalized content...');
  
  const drafted = [];
  
  for (const entity of entities) {
    // Verify entity has required data for personalization
    assert(entity.typeData, `Entity ${entity.name} should have typeData`);
    assert(entity.typeData.keyContacts, `Entity ${entity.name} should have keyContacts`);
    
    // Create personalization context
    const personalization = {
      entityId: entity.id,
      entityName: entity.name,
      mayorName: entity.typeData.keyContacts[0]?.name || 'Alcalde/Alcaldesa',
      province: entity.location?.region,
      painPoints: entity.typeData.painPoints || [],
      initiatives: entity.typeData.initiatives || [],
      subject: `Gobernanza de IA - ${entity.name}`,
      body: `<!DOCTYPE html>
<html>
<body>
  <p>Estimado/a ${entity.typeData.keyContacts[0]?.name || 'Alcalde/Alcaldesa'},</p>
  <p>Me dirijo a usted en nombre de Alygn, una organización dedicada a la gobernanza responsable de la inteligencia artificial.</p>
  <p>En ${entity.name}, entendemos los desafíos de ${entity.typeData.painPoints?.[0] || 'la transformación digital'}.</p>
</body>
</html>`
    };
    
    entity.personalizationContext = personalization;
    entity.batchStatus = 'Drafted';
    drafted.push(entity);
    
    console.log(`     📝 Drafted: ${entity.name} (${personalization.mayorName})`);
  }
  
  assertEqual(drafted.length, entities.length, 'All entities should be drafted');
  
  return drafted;
}

/**
 * Simulate send phase - sends outreach emails
 */
async function simulateSend(entities) {
  console.log('  📤 Phase 4: Send - Sending outreach emails...');
  
  const sent = [];
  
  for (const entity of entities) {
    // Verify draft exists
    assert(entity.personalizationContext, `Entity ${entity.name} should have personalizationContext`);
    assert(entity.emailValidation?.warmed, `Entity ${entity.name} should be warmed up`);
    
    // Simulate sending
    const sentAt = new Date().toISOString();
    const messageId = `test-${Date.now()}-${entity.id}`;
    
    // Record in email tracker
    global.mockEmailTracker.recordSent({
      email: entity.email,
      name: entity.name,
      type: 'municipal',
      subject: entity.personalizationContext.subject,
      sentAt,
      messageId
    });
    
    // Update entity status
    entity.status = 'sent';
    entity.batchStatus = 'Sent';
    entity.sentAt = sentAt;
    entity.sentEmailId = messageId;
    entity.outreachCount = (entity.outreachCount || 0) + 1;
    
    sent.push(entity);
    
    console.log(`     📧 Sent: ${entity.name} → ${entity.email}`);
  }
  
  assertEqual(sent.length, entities.length, 'All entities should be sent');
  
  // Verify email tracker recorded all
  const trackedEmails = global.mockEmailTracker.getSent('municipal');
  assertEqual(trackedEmails.length, entities.length, 'All emails should be tracked');
  
  return sent;
}

/**
 * Run the happy path test for CR municipal pipeline
 */
async function runHappyPathTest() {
  console.log('\n🧪 Test: Happy Path - CR Municipal Pipeline');
  console.log('='.repeat(60));
  
  try {
    // Step 1: Discovery - Load cantones
    const discovered = await simulateDiscovery();
    assert(discovered.length >= 4, 'Should have at least 4 municipalities');
    
    // Step 2: Warmup - Validate emails
    const warmed = await simulateWarmup(discovered);
    assert(warmed.every(e => e.emailValidation?.warmed), 'All entities should be warmed');
    
    // Step 3: Draft - Create personalized content
    const drafted = await simulateDraft(warmed);
    assert(drafted.every(e => e.batchStatus === 'Drafted'), 'All entities should be drafted');
    assert(drafted.every(e => e.personalizationContext), 'All entities should have personalization');
    
    // Step 4: Send - Send outreach emails
    const sent = await simulateSend(drafted);
    assert(sent.every(e => e.status === 'sent'), 'All entities should have status sent');
    assert(sent.every(e => e.batchStatus === 'Sent'), 'All entities should have batchStatus Sent');
    assert(sent.every(e => e.sentEmailId), 'All entities should have sentEmailId');
    
    console.log('='.repeat(60));
    console.log('✅ Happy Path: PASSED');
    console.log(`   Total entities processed: ${sent.length}`);
    console.log(`   Provinces covered: ${[...new Set(sent.map(e => e.location?.region))].join(', ')}`);
    
    return true;
  } catch (err) {
    console.log('='.repeat(60));
    console.log('❌ Happy Path: FAILED');
    throw err;
  }
}

/**
 * Main test runner
 */
export async function runMuniTests() {
  console.log('\n' + '='.repeat(80));
  console.log('🏛️  Running Municipal Outreach Tests...');
  console.log('='.repeat(80));
  
  let passed = 0;
  let failed = 0;
  
  // Test 1: Happy Path
  try {
    setupMocks();
    await runHappyPathTest();
    passed++;
    teardown();
  } catch (err) {
    failed++;
    console.log('❌ Happy Path: FAILED -', err.message);
    teardown();
  }
  
  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(80));
  console.log(`   Total: ${passed + failed}`);
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log('='.repeat(80));
  
  return { passed, failed };
}

// Run tests if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runMuniTests().then(results => {
    process.exit(results.failed > 0 ? 1 : 0);
  });
}

export default { runMuniTests };