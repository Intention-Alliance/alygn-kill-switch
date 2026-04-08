/**
 * E2E Test Runner
 * Executes all test suites and generates summary report
 */

import { runVCTests } from './suites/vc-outreach.test.js';
import { runMuniTests } from './suites/muni-outreach.test.js';
import { runCrossFlowTests } from './suites/cross-flow.test.js';

async function runAllTests() {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 Alygn Outreach E2E Test Suite');
  console.log('='.repeat(60) + '\n');
  
  const startTime = Date.now();
  const results = [];
  
  try {
    // Run VC Tests
    const vcResult = await runVCTests();
    results.push(vcResult);
    
    // Run Municipal Tests
    const muniResult = await runMuniTests();
    results.push(muniResult);
    
    // Run Cross-Flow Tests
    const crossResult = await runCrossFlowTests();
    results.push(crossResult);
    
  } catch (err) {
    console.error('\n❌ Test suite failed:', err.message);
    process.exit(1);
  }
  
  // Generate Summary
  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);
  
  const totalPassed = results.reduce((sum, r) => sum + r.passed, 0);
  const totalTests = results.reduce((sum, r) => sum + r.total, 0);
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 Test Summary');
  console.log('='.repeat(60));
  
  results.forEach(r => {
    const status = r.passed === r.total ? '✅' : '⚠️';
    console.log(`${status} ${r.suite}: ${r.passed}/${r.total} passed`);
  });
  
  console.log('-'.repeat(60));
  console.log(`Total: ${totalPassed}/${totalTests} tests passed`);
  console.log(`Duration: ${duration}s`);
  console.log('='.repeat(60));
  
  if (totalPassed === totalTests) {
    console.log('\n🎉 All tests passed!\n');
    process.exit(0);
  } else {
    console.log(`\n⚠️ ${totalTests - totalPassed} test(s) failed\n`);
    process.exit(1);
  }
}

// Run tests
runAllTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
