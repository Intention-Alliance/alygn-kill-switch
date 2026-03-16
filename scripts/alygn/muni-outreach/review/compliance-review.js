/**
 * Compliance Review Script
 * Human review gate before sending emails
 * Posts to Discord for approval, waits for human decision
 * 
 * Usage:
 *   node compliance-review.js --input=/tmp/muni-cr-personalized.json
 */

import fs from "fs";

/**
 * Prepares emails for human review
 * @param {Array} municipalities - Personalized municipalities
 * @returns {Object} Review package
 */
function prepareForReview(municipalities) {
  console.log(`📋 Preparing ${municipalities.length} emails for compliance review...`);
  
  const review = {
    prepared_at: new Date().toISOString(),
    total_count: municipalities.length,
    ready_for_review: [],
    flagged_for_issues: [],
    summary: {
      governance_variant: 0,
      institutional_variant: 0,
      with_mayor_email: 0,
      with_pain_points: 0
    }
  };
  
  municipalities.forEach(muni => {
    if (!muni.outreach || muni.outreach_status === 'error') {
      review.flagged_for_issues.push({
        municipality: muni.name,
        reason: muni.outreach_error || 'Missing outreach content'
      });
      return;
    }
    
    const outreach = muni.outreach;
    
    // Count variants
    if (outreach.variant === 'governance') review.summary.governance_variant++;
    if (outreach.variant === 'institutional') review.summary.institutional_variant++;
    
    // Check required fields
    if (muni.contacts?.mayor_email) review.summary.with_mayor_email++;
    if (muni.pain_points?.length > 0) review.summary.with_pain_points++;
    
    review.ready_for_review.push({
      municipality: muni.name,
      country: muni.country,
      mayor_name: muni.contacts?.mayor_name,
      mayor_email: muni.contacts?.mayor_email,
      variant: outreach.variant,
      subject: outreach.subject,
      body_preview: outreach.body.substring(0, 200) + '...',
      full_body: outreach.body,
      pain_points: muni.pain_points || [],
      ai_signals: muni.ai_governance_signals || [],
      x_handle: muni.x_handle
    });
  });
  
  console.log(`✅ Prepared ${review.ready_for_review.length} for review`);
  console.log(`⚠️  Flagged ${review.flagged_for_issues.length} for issues`);
  
  return review;
}

/**
 * Formats review for Discord
 */
function formatForDiscord(review) {
  const lines = [
    '🏛️ **ALYGN Municipal Outreach - Compliance Review Required**',
    '',
    `**Wave:** 1 (Costa Rica Pilot)`,
    `**Municipalities:** ${review.ready_for_review.length} ready for review`,
    `**Flagged:** ${review.flagged_for_issues.length} with issues`,
    '',
    '**Summary:**',
    `• Governance variant: ${review.summary.governance_variant}`,
    `• Institutional variant: ${review.summary.institutional_variant}`,
    `• With mayor email: ${review.summary.with_mayor_email}`,
    `• With pain points: ${review.summary.with_pain_points}`,
    '',
    '---',
    '',
    '**Sample Emails (first 3):**',
    ''
  ];
  
  review.ready_for_review.slice(0, 3).forEach((item, index) => {
    lines.push(`**${index + 1}. ${item.municipality}** (${item.variant})`);
    lines.push(`Mayor: ${item.mayor_name || 'N/A'} <${item.mayor_email || 'N/A'}>`);
    lines.push(`Subject: ${item.subject}`);
    lines.push(`Preview: ${item.body_preview}`);
    lines.push('');
  });
  
  lines.push('---');
  lines.push('');
  lines.push('**Commands:**');
  lines.push('• `APPROVE_ALL` - Approve all and proceed to sending');
  lines.push('• `APPROVE [number]` - Approve specific municipality (1-3)');
  lines.push('• `EDIT [number]: [changes]` - Request edits');
  lines.push('• `REJECT [number]: [reason]` - Reject specific municipality');
  lines.push('• `HALT` - Stop workflow for manual review');
  
  return lines.join('\n');
}

/**
 * Saves review package
 */
function saveReview(review, outputFile) {
  fs.writeFileSync(outputFile, JSON.stringify(review, null, 2));
  console.log(`💾 Review package saved to ${outputFile}`);
  return review;
}

/**
 * Processes approval decisions (called by Discord command handler)
 */
function processDecision(decision, review) {
  const result = {
    decision,
    processed_at: new Date().toISOString(),
    approved: [],
    rejected: [],
    edits_requested: []
  };
  
  if (decision.command === 'APPROVE_ALL') {
    result.approved = review.ready_for_review.map(item => item.municipality);
    result.status = 'approved';
  } else if (decision.command === 'APPROVE') {
    const index = parseInt(decision.target) - 1;
    if (review.ready_for_review[index]) {
      result.approved.push(review.ready_for_review[index].municipality);
      result.status = 'partially_approved';
    }
  } else if (decision.command === 'EDIT') {
    const index = parseInt(decision.target) - 1;
    if (review.ready_for_review[index]) {
      result.edits_requested.push({
        municipality: review.ready_for_review[index].municipality,
        changes: decision.changes
      });
      result.status = 'edits_requested';
    }
  } else if (decision.command === 'REJECT') {
    const index = parseInt(decision.target) - 1;
    if (review.ready_for_review[index]) {
      result.rejected.push({
        municipality: review.ready_for_review[index].municipality,
        reason: decision.reason
      });
      result.status = 'partially_rejected';
    }
  } else if (decision.command === 'HALT') {
    result.status = 'halted';
  }
  
  return result;
}

// CLI usage
if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  const args = process.argv.slice(2);
  
  const inputArg = args.find(a => a.startsWith('--input='));
  const outputArg = args.find(a => a.startsWith('--output='));
  const discordArg = args.includes('--discord');
  
  if (!inputArg) {
    console.error('Usage: node compliance-review.js --input=/path/to/personalized.json [--output=review.json] [--discord]');
    process.exit(1);
  }
  
  const inputFile = inputArg.split('=')[1];
  const outputFile = outputArg ? outputArg.split('=')[1] : '/tmp/muni-review-package.json';
  
  try {
    const data = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
    const municipalities = data.municipalities || data;
    
    const review = prepareForReview(municipalities);
    saveReview(review, outputFile);
    
    // Format for Discord
    const discordMessage = formatForDiscord(review);
    console.log('\n📱 Discord Message:');
    console.log(discordMessage);
    
    if (discordArg) {
      console.log('\n⚠️  Discord posting not implemented - would send to #annotations');
      console.log('In production: POST to Discord webhook with approval buttons');
    }
    
    console.log(`\n✅ Review package ready: ${outputFile}`);
    console.log('Next: Wait for human approval via Discord commands');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

export {
  prepareForReview,
  formatForDiscord,
  saveReview,
  processDecision
};
