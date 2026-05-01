
/**
 * Phase 3 Step 0: Verify Research Data in Notion
 * 
 * CRITICAL VERIFICATION STEP
 * Ensures that research data was actually persisted to Notion
 * before proceeding with email drafting.
 * 
 * Problem Found (Feb 14, 2026):
 * - HTTP 200 responses were treated as success
 * - But Notion data wasn't actually updated
 * - Example: "Accel" had no email or research data despite API calls
 * 
 * This script verifies end-to-end data integrity.
 */

import fs from "fs";
import path from "path";
import { getClient, queryDatabase } from "../../../shared/notion-client.js";

// Note: require() for non-JS files not supported in ES modules
// Using environment variable or placeholder
const notion = getClient();
const DB_ID = '305334874af681ef983df57c7f70de33'; // ALYGN VC Outreach Tracker
const REQUIRED_FIELDS = ['Name', 'Email', 'Summary', 'Pain Points'];

/**
 * Fetch all VCs from Notion
 */
async function fetchAllVCs() {
  try {
    const response = await queryDatabase(notion, DB_ID, { page_size: 100 });
    
    return response.results;
  } catch (error) {
    console.error('❌ Failed to fetch VCs from Notion:', error.message);
    throw error;
  }
}

/**
 * Verify a single VC's data completeness
 */
function verifyVCData(vc) {
  const verification = {
    name: vc.properties.Name?.title?.[0]?.text?.content || null,
    email: vc.properties.Email?.email || null,
    summary_length: vc.properties.Summary?.rich_text?.length || 0,
    pain_points_length: vc.properties['Pain Points']?.rich_text?.length || 0,
    last_edited: vc.last_edited_time,
    status: null,
    issues: []
  };
  
  // Check for missing data
  if (!verification.name) {
    verification.issues.push('Missing name');
  }
  if (!verification.email) {
    verification.issues.push('Missing email');
  }
  if (verification.summary_length === 0) {
    verification.issues.push('Missing summary/research');
  }
  if (verification.pain_points_length === 0) {
    verification.issues.push('Missing pain points');
  }
  
  // Determine status
  if (verification.issues.length === 0) {
    verification.status = 'complete';
  } else if (verification.issues.length <= 2) {
    verification.status = 'partial';
  } else {
    verification.status = 'incomplete';
  }
  
  return verification;
}

/**
 * Generate verification report
 */
async function generateReport() {
  console.log('\n📊 Verifying VC Research Data in Notion...\n');
  
  const vcs = await fetchAllVCs();
  const report = {
    timestamp: new Date().toISOString(),
    total_vcs: vcs.length,
    by_status: {
      complete: [],
      partial: [],
      incomplete: []
    },
    summary: {
      complete_count: 0,
      partial_count: 0,
      incomplete_count: 0,
      missing_emails: [],
      missing_research: []
    }
  };
  
  // Verify each VC
  for (const vc of vcs) {
    const verification = verifyVCData(vc);
    const status = verification.status;
    
    report.by_status[status].push({
      name: verification.name,
      email: verification.email,
      issues: verification.issues,
      last_edited: verification.last_edited
    });
    
    report.summary[`${status}_count`]++;
    
    if (!verification.email) {
      report.summary.missing_emails.push(verification.name);
    }
    if (verification.summary_length === 0) {
      report.summary.missing_research.push(verification.name);
    }
    
    // Visual indicator
    const icon = status === 'complete' ? '✅' : status === 'partial' ? '⚠️' : '❌';
    console.log(`${icon} ${verification.name || 'UNNAMED'}`);
    if (verification.issues.length > 0) {
      verification.issues.forEach(issue => console.log(`   - ${issue}`));
    }
  }
  
  // Save report
  const reportPath = path.join(__dirname, 'data', `verification-report-${Date.now()}.json`);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  
  console.log('\n📈 Summary:');
  console.log(`   ✅ Complete: ${report.summary.complete_count}/${report.total_vcs}`);
  console.log(`   ⚠️  Partial: ${report.summary.partial_count}/${report.total_vcs}`);
  console.log(`   ❌ Incomplete: ${report.summary.incomplete_count}/${report.total_vcs}`);
  
  if (report.summary.missing_research.length > 0) {
    console.log(`\n🔍 VCs Missing Research Data (${report.summary.missing_research.length}):`);
    report.summary.missing_research.forEach(name => console.log(`   - ${name}`));
  }
  
  if (report.summary.missing_emails.length > 0) {
    console.log(`\n📧 VCs Missing Email Addresses (${report.summary.missing_emails.length}):`);
    report.summary.missing_emails.forEach(name => console.log(`   - ${name}`));
  }
  
  console.log(`\n💾 Report saved to: ${reportPath}\n`);
  
  return report;
}

/**
 * Determine readiness for Phase 3
 */
function checkReadiness(report) {
  const threshold = 0.8; // 80% must have research data
  const readyCount = report.summary.complete_count + report.summary.partial_count;
  const readyRate = readyCount / report.total_vcs;
  
  console.log(`\n🚀 Phase 3 Readiness Check:`);
  console.log(`   Ready VCs: ${readyCount}/${report.total_vcs} (${(readyRate * 100).toFixed(1)}%)`);
  console.log(`   Threshold: ${(threshold * 100).toFixed(0)}%`);
  
  if (readyRate >= threshold) {
    console.log(`   ✅ READY for Phase 3 (Email Drafting)\n`);
    return true;
  } else {
    console.log(`   ❌ NOT READY - Need more research data\n`);
    return false;
  }
}

/**
 * Main execution
 */
async function main() {
  try {
    const report = await generateReport();
    const isReady = checkReadiness(report);
    
    // Exit code indicates readiness
    process.exit(isReady ? 0 : 1);
  } catch (error) {
    console.error('\n❌ Verification failed:', error.message);
    process.exit(1);
  }
}

main();
