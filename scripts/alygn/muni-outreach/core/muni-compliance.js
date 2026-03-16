/**
 * Municipal Compliance Checker - Rules Engine + Perplexity Validation
 * 
 * Hybrid script: Deterministic rules + Perplexity sub-agent for tone/compliance validation.
 * 
 * Tools:
 * - Perplexity Sonar Pro: Compliance research & tone validation (via OpenRouter)
 * - Fallback: web_search (Brave API)
 * - Firecrawl: Verify Alygn positioning (fallback: web_fetch)
 * 
 * Usage:
 *   node muni-compliance.js --region=cr --wave=1 --input=/tmp/muni-cr-personalized.json
 */

import fs from "fs";
import path from "path";
import coordinator from "../utils/sub-agent-coordinator.js";

// Load utilities
import checkpoint from "./checkpoint.js";

// Current date for context
const currentDate = new Date().toLocaleDateString('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric'
});

/**
 * Main compliance check function
 */
async function checkCompliance(options) {
  const {
    region,
    wave,
    input,
    dryRun = false
  } = options;
  
  console.log(`⚖️  Municipal Compliance Checker - ${region} Wave ${wave}`);
  console.log(`   Input: ${input}`);
  console.log(`   Dry run: ${dryRun ? '✅ YES (no changes)' : '❌ NO (will update)'}`);
  console.log(`   Date: ${currentDate}`);
  
  // Load personalized emails
  let emails;
  try {
    const data = JSON.parse(fs.readFileSync(input, 'utf8'));
    emails = data.emails || data.municipalities || data;
    console.log(`   Emails to check: ${emails.length}`);
  } catch (error) {
    console.error('❌ Failed to load input file:', error.message);
    return { checked: 0, results: [] };
  }
  
  const results = [];
  
  for (const email of emails) {
    try {
      console.log(`\n📧 Checking: ${email.municipality || email.name}`);
      
      // Step 1: Deterministic rules check
      const rulesCheck = performRulesCheck(email);
      console.log(`   Rules check: ${rulesCheck.pass ? '✅ PASS' : '❌ FAIL'}`);
      
      if (!rulesCheck.pass) {
        console.log(`   Issues: ${rulesCheck.issues.join(', ')}`);
        results.push({
          municipality: email.municipality || email.name,
          rulesPass: false,
          issues: rulesCheck.issues,
          tonePass: false,
          overallPass: false,
          reason: 'Rules check failed'
        });
        continue;
      }
      
      // Step 2: LLM tone validation with Perplexity + web research
      console.log('   🤖 Spawning compliance checker agent with Perplexity...');
      
      const toneCheck = await coordinator.spawnAndPoll(
        `compliance-checker:${region}:${wave}`,
        `Validate email tone and compliance for ${email.municipality || email.name} in ${region} Wave ${wave}. TODAY: ${currentDate}`,
        {
          email: {
            subject: email.subject,
            body: email.body
          },
          municipality: email.municipality || email.name,
          region,
          wave,
          currentDate,
          currentYear: 2026
        },
        60 // timeout seconds
      );
      
      console.log(`   ✅ Agent validation complete`);
      
      // Step 3: Combine results
      const overallPass = rulesCheck.pass && toneCheck.tonePass;
      
      console.log(`   Tone check: ${toneCheck.tonePass ? '✅ PASS' : '❌ FAIL'}`);
      console.log(`   Overall: ${overallPass ? '✅ APPROVED' : '❌ NEEDS REVISION'}`);
      
      results.push({
        municipality: email.municipality || email.name,
        rulesPass: rulesCheck.pass,
        tonePass: toneCheck.tonePass,
        overallPass,
        issues: [...(rulesCheck.issues || []), ...(toneCheck.issues || [])],
        suggestions: toneCheck.suggestions || [],
        webVerification: toneCheck.webVerification
      });
      
      // Save checkpoint
      checkpoint.autoSave(region, wave, {
        step: 'compliance',
        lastMunicipality: email.municipality || email.name,
        checkedCount: results.length,
        passedCount: results.filter(r => r.overallPass).length
      });
      
    } catch (error) {
      console.error(`   ❌ Error checking ${email.municipality || email.name}:`, error.message);
      results.push({
        municipality: email.municipality || email.name,
        rulesPass: false,
        tonePass: false,
        overallPass: false,
        error: error.message
      });
    }
  }
  
  console.log(`\n✅ Compliance check complete: ${results.length} emails`);
  
  const passedCount = results.filter(r => r.overallPass).length;
  console.log(`   Approved: ${passedCount}/${results.length}`);
  console.log(`   Needs revision: ${results.length - passedCount}`);
  
  // Save results (always save, even in dry-run)
  const outputFile = input.replace('.json', '-compliance.json');
  fs.writeFileSync(outputFile, JSON.stringify({
    checkedAt: new Date().toISOString(),
    region,
    wave,
    dryRun,
    total: results.length,
    passed: passedCount,
    failed: results.length - passedCount,
    results
  }, null, 2));
  
  console.log(`💾 Results saved to: ${outputFile}${dryRun ? ' (dry-run)' : ''}`);
  
  return { checked: results.length, results, outputFile };
}

/**
 * Perform deterministic rules check
 */
function performRulesCheck(email) {
  const issues = [];
  
  // Rule 1: Word count (30-85 words, flexible)
  const wordCount = email.body.split(' ').length;
  // Flexible: warn if outside range but don't fail unless extreme
  if (wordCount < 25) {
    issues.push(`Word count ${wordCount} is too short (min 25, recommended 30-85)`);
  }
  if (wordCount > 100) {
    issues.push(`Word count ${wordCount} exceeds recommended max (recommended 30-85, max 100)`);
  }
  
  // Rule 2: Has opt-out/unsubscribe
  const hasOptOut = email.body.toLowerCase().includes('unsubscribe') ||
                   email.body.toLowerCase().includes('opt-out');
  if (!hasOptOut) {
    issues.push('Missing unsubscribe/opt-out link');
  }
  
  // Rule 3: Has Alygn signature
  const hasSignature = email.body.toLowerCase().includes('alygn');
  if (!hasSignature) {
    issues.push('Missing Alygn signature');
  }
  
  // Rule 4: No guarantees/promises
  const hasClaims = email.body.toLowerCase().includes('guarantee') ||
                   email.body.toLowerCase().includes('promise') ||
                   email.body.toLowerCase().includes('we will ensure');
  if (hasClaims) {
    issues.push('Contains guarantees/promises (not allowed)');
  }
  
  // Rule 5: No authority/regulation claims
  const hasAuthorityClaims = email.body.toLowerCase().includes('regulate') ||
                            email.body.toLowerCase().includes('enforce') ||
                            email.body.toLowerCase().includes('compliance requirement');
  if (hasAuthorityClaims) {
    issues.push('Contains authority/regulation claims (not allowed)');
  }
  
  // Rule 6: AI transparency (P.S. disclosure)
  const hasAiDisclosure = email.body.toLowerCase().includes('ai') &&
                         email.body.toLowerCase().includes('assisted') ||
                         email.body.toLowerCase().includes('reviewed by humans');
  if (!hasAiDisclosure) {
    issues.push('Missing AI transparency disclosure in P.S.');
  }
  
  return {
    pass: issues.length === 0,
    issues,
    wordCount
  };
}

// CLI
if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  const args = process.argv.slice(2);
  
  const parseArg = (name) => {
    const arg = args.find(a => a.startsWith(`--${name}=`));
    return arg ? arg.split('=')[1] : null;
  };
  
  const region = parseArg('region') || 'cr';
  const wave = parseInt(parseArg('wave') || '1');
  const inputArg = args.find(a => a.startsWith('--input='));
  const dryRun = args.includes('--dry-run');
  
  if (!inputArg) {
    console.error('Usage: node muni-compliance.js --region=cr --wave=1 --input=/path/to/emails.json [--dry-run]');
    process.exit(1);
  }
  
  const input = inputArg.split('=')[1];
  
  checkCompliance({ region, wave, input, dryRun })
    .then(({ checked, results, outputFile }) => {
      console.log('\n📊 Detailed results saved to:', outputFile);
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Fatal error:', error.message);
      process.exit(1);
    });
}

export { checkCompliance, performRulesCheck };
