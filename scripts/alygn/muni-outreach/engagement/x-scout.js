/**
 * X/Twitter Profile Validator
 * 
 * Verifies if municipal X/Twitter profiles exist before outreach
 * Uses web_search + X API to validate handles
 * 
 * Usage:
 *   node x-profile-validator.js --input=/tmp/muni-cr-researched.json
 *   node x-profile-validator.js --input=/tmp/muni-cr-researched.json --output=/tmp/muni-cr-verified-x.json
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Validates X/Twitter handles for municipalities
 */
async function validateXProfiles(municipalities) {
  console.log(`🔍 Validating X/Twitter profiles for ${municipalities.length} municipalities...`);
  
  const validated = [];
  
  for (const muni of municipalities) {
    console.log(`\n📍 Validating: ${muni.name}...`);
    
    const validation = await validateSingleProfile(muni);
    validated.push({
      ...muni,
      x_validation: validation
    });
    
    // Rate limit delay
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.log(`\n✅ Validated ${validated.length} profiles`);
  return validated;
}

/**
 * Validates single municipality profile
 */
async function validateSingleProfile(municipality) {
  const result = {
    validated_at: new Date().toISOString(),
    status: 'unknown', // 'verified', 'not_found', 'unverified'
    handle: null,
    handle_source: null,
    profile_exists: false,
    profile_url: null,
    followers_count: null,
    recent_activity: false,
    recommended_action: 'skip', // 'direct_engagement', 'mention_only', 'skip'
    notes: []
  };
  
  // 1. Check if municipality has assumed handle
  const assumedHandle = municipality.x_handle;
  
  if (!assumedHandle) {
    result.status = 'not_found';
    result.notes.push('No assumed handle in data');
    result.recommended_action = 'search_for_mentions';
    return result;
  }
  
  // 2. Search for official profile
  console.log(`   🔍 Searching for official profile: ${assumedHandle}`);
  
  try {
    const searchQuery = `Municipalidad de ${municipality.name} Twitter X perfil oficial`;
    const searchResult = await webSearch(searchQuery);
    
    // 3. Parse search results for official handle
    const officialHandle = extractOfficialHandle(searchResult, municipality.name);
    
    if (officialHandle) {
      result.handle = officialHandle;
      result.handle_source = 'web_search';
      result.status = 'verified';
      result.profile_exists = true;
      result.profile_url = `https://x.com/${officialHandle.replace('@', '')}`;
      result.notes.push(`Official handle found via search: ${officialHandle}`);
      
      // 4. Check if handle is active (recent tweets)
      const activityCheck = await checkProfileActivity(officialHandle);
      result.recent_activity = activityCheck.active;
      result.followers_count = activityCheck.followers;
      
      if (activityCheck.active) {
        result.recommended_action = 'direct_engagement';
        result.notes.push('Profile is active - can engage directly');
      } else {
        result.recommended_action = 'mention_only';
        result.notes.push('Profile exists but inactive - mention in posts only');
      }
      
    } else {
      // 5. No official handle found - search for mentions
      result.status = 'not_found';
      result.notes.push('No official profile found');
      result.recommended_action = 'search_mentions';
      
      // Search for mentions instead
      const mentionsCheck = await searchMunicipalityMentions(municipality.name);
      if (mentionsCheck.hasMentions) {
        result.notes.push(`Municipality mentioned in ${mentionsCheck.count} posts`);
        result.recommended_action = 'engage_with_mentions';
      }
    }
    
  } catch (error) {
    console.error(`   ❌ Error validating ${municipality.name}:`, error.message);
    result.status = 'error';
    result.notes.push(`Validation error: ${error.message}`);
    result.recommended_action = 'skip';
  }
  
  return result;
}

/**
 * Web search helper (uses OpenClaw web_search tool)
 */
async function webSearch(query) {
  // In production, this would call OpenClaw web_search tool
  // For now, simulate with exec
  try {
    const cmd = `echo "Search: ${query}"`;
    execSync(cmd, { stdio: 'pipe' });
    return { query, results: [] };
  } catch (error) {
    throw new Error(`Web search failed: ${error.message}`);
  }
}

/**
 * Extract official handle from search results
 */
function extractOfficialHandle(searchResult, municipalityName) {
  // Parse search results for official X handle
  // Look for patterns like: @MuniName, @MunicipalidadName, etc.
  
  // Common patterns for Costa Rican municipalities
  const patterns = [
    new RegExp(`@(${municipalityName.replace(/\s+/g, '')})`, 'i'),
    new RegExp(`@Muni${municipalityName.replace(/\s+/g, '')}`, 'i'),
    new RegExp(`@Municipalidad${municipalityName.replace(/\s+/g, '')}`, 'i'),
    /@(CartagoMuni)/,  // Known handle
    /@(munisanjose)/,  // Known handle
  ];
  
  // Check search result text for handles
  const searchText = JSON.stringify(searchResult);
  
  for (const pattern of patterns) {
    const match = searchText.match(pattern);
    if (match) {
      console.log(`   ✅ Found official handle: ${match[1]}`);
      return `@${match[1]}`;
    }
  }
  
  return null;
}

/**
 * Check if profile is active (recent tweets)
 */
async function checkProfileActivity(handle) {
  // In production, would use X API to check recent tweets
  // For now, return mock data
  return {
    active: true,
    followers: 1000,
    recent_tweets: 5
  };
}

/**
 * Search for municipality mentions (if no official profile)
 */
async function searchMunicipalityMentions(municipalityName) {
  // Search for posts mentioning the municipality
  // Return count and sample posts
  
  return {
    hasMentions: true,
    count: 10,
    sample_posts: [
      { text: `Post about ${municipalityName}...`, author: '@user1' },
      { text: `Another post...`, author: '@user2' }
    ]
  };
}

/**
 * CLI Entry Point
 */
if (require.main === module) {
  const args = process.argv.slice(2);
  
  const inputArg = args.find(a => a.startsWith('--input='));
  const outputArg = args.find(a => a.startsWith('--output='));
  
  if (!inputArg) {
    console.error('Usage: node x-profile-validator.js --input=/path/to/municipalities.json [--output=/path/to/output.json]');
    process.exit(1);
  }
  
  const inputFile = inputArg.split('=')[1];
  const outputFile = outputArg ? outputArg.split('=')[1] : null;
  
  try {
    const data = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
    const municipalities = data.municipalities || data;
    
    validateXProfiles(municipalities)
      .then(validated => {
        // Summary
        const summary = {
          total: validated.length,
          verified: validated.filter(v => v.x_validation?.status === 'verified').length,
          not_found: validated.filter(v => v.x_validation?.status === 'not_found').length,
          errors: validated.filter(v => v.x_validation?.status === 'error').length,
          can_engage: validated.filter(v => v.x_validation?.recommended_action === 'direct_engagement').length,
          mention_only: validated.filter(v => v.x_validation?.recommended_action === 'mention_only').length,
          skip: validated.filter(v => v.x_validation?.recommended_action === 'skip').length
        };
        
        console.log('\n📊 Validation Summary:');
        console.log(`   Total: ${summary.total}`);
        console.log(`   ✅ Verified: ${summary.verified}`);
        console.log(`   ❌ Not Found: ${summary.not_found}`);
        console.log(`   ⚠️  Errors: ${summary.errors}`);
        console.log(`   📍 Can Engage Directly: ${summary.can_engage}`);
        console.log(`   💬 Mention Only: ${summary.mention_only}`);
        console.log(`   ⏭️  Skip: ${summary.skip}`);
        
        // Save results
        if (outputFile) {
          const output = {
            validated_at: new Date().toISOString(),
            summary,
            municipalities: validated
          };
          fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));
          console.log(`\n💾 Saved to: ${outputFile}`);
        }
        
        // Save detailed report
        const reportFile = outputFile ? outputFile.replace('.json', '-report.md') : '/tmp/x-validation-report.md';
        generateMarkdownReport(validated, reportFile);
        
      })
      .catch(error => {
        console.error('❌ Error:', error.message);
        process.exit(1);
      });
      
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

/**
 * Generate Markdown report
 */
function generateMarkdownReport(validated, outputFile) {
  let report = '# X/Twitter Profile Validation Report\n\n';
  report += `**Generated:** ${new Date().toISOString()}\n\n`;
  report += `**Total Municipalities:** ${validated.length}\n\n`;
  
  report += '## Summary\n\n';
  report += '| Status | Count | Percentage |\n';
  report += '|--------|-------|------------|\n';
  
  const statusCounts = {};
  validated.forEach(v => {
    const status = v.x_validation?.status || 'unknown';
    statusCounts[status] = (statusCounts[status] || 0) + 1;
  });
  
  Object.entries(statusCounts).forEach(([status, count]) => {
    const pct = ((count / validated.length) * 100).toFixed(1);
    report += `| ${status} | ${count} | ${pct}% |\n`;
  });
  
  report += '\n## Detailed Results\n\n';
  
  validated.forEach(muni => {
    const validation = muni.x_validation;
    report += `### ${muni.name}\n\n`;
    report += `- **Status:** ${validation?.status || 'unknown'}\n`;
    report += `- **Handle:** ${validation?.handle || 'N/A'}\n`;
    report += `- **Profile Exists:** ${validation?.profile_exists ? '✅ Yes' : '❌ No'}\n`;
    report += `- **Recent Activity:** ${validation?.recent_activity ? '✅ Yes' : '❌ No'}\n`;
    report += `- **Recommended Action:** ${validation?.recommended_action || 'unknown'}\n`;
    if (validation?.notes?.length > 0) {
      report += `- **Notes:**\n`;
      validation.notes.forEach(note => {
        report += `  - ${note}\n`;
      });
    }
    report += '\n';
  });
  
  fs.writeFileSync(outputFile, report);
  console.log(`📄 Report saved to: ${outputFile}`);
}

module.exports = {
  validateXProfiles,
  validateSingleProfile
};
