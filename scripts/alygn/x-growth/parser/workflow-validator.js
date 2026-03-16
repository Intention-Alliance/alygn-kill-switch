/**
 * Workflow Validator - Validates Twitter workflow JSON before posting
 * Ensures content meets format requirements and safety checks
 */

import fs from 'fs';
import path from 'path';

/**
 * Validates workflow JSON structure
 * @param {Object} workflow - Workflow object with posts, replies, quotes
 * @returns {Object} Validation result with issues array
 */
function validateWorkflow(workflow) {
  const issues = [];
  const warnings = [];
  
  // Check required fields
  if (!workflow || typeof workflow !== 'object') {
    issues.push('Workflow must be a valid object');
    return { valid: false, issues, warnings };
  }
  
  // Validate posts array if exists
  if (workflow.posts) {
    if (!Array.isArray(workflow.posts)) {
      issues.push('posts must be an array');
    } else {
      workflow.posts.forEach((post, index) => {
        const postIssues = validatePost(post, index);
        issues.push(...postIssues);
      });
    }
  }
  
  // Validate replies array if exists
  if (workflow.replies) {
    if (!Array.isArray(workflow.replies)) {
      issues.push('replies must be an array');
    } else {
      workflow.replies.forEach((reply, index) => {
        const replyIssues = validateReply(reply, index);
        issues.push(...replyIssues);
      });
    }
  }
  
  // Validate quotes array if exists
  if (workflow.quotes) {
    if (!Array.isArray(workflow.quotes)) {
      issues.push('quotes must be an array');
    } else {
      workflow.quotes.forEach((quote, index) => {
        const quoteIssues = validateQuote(quote, index);
        issues.push(...quoteIssues);
      });
    }
  }
  
  // Validate follows array if exists
  if (workflow.follows) {
    if (!Array.isArray(workflow.follows)) {
      issues.push('follows must be an array');
    } else {
      workflow.follows.forEach((follow, index) => {
        const followIssues = validateFollow(follow, index);
        issues.push(...followIssues);
      });
    }
  }
  
  return {
    valid: issues.length === 0,
    issues,
    warnings,
    summary: {
      posts: workflow.posts?.length || 0,
      replies: workflow.replies?.length || 0,
      quotes: workflow.quotes?.length || 0,
      follows: workflow.follows?.length || 0
    }
  };
}

/**
 * Validates individual post
 */
function validatePost(post, index) {
  const issues = [];
  
  if (!post.content || typeof post.content !== 'string') {
    issues.push(`Post #${index + 1}: content is required and must be a string`);
    return issues;
  }
  
  // Check length (Twitter limit: 280 chars)
  if (post.content.length > 280) {
    issues.push(`Post #${index + 1}: content exceeds 280 characters (${post.content.length} chars)`);
  }
  
  // Check for mandatory signature
  if (!post.content.includes('more at @aialygn')) {
    issues.push(`Post #${index + 1}: missing mandatory signature "more at @aialygn"`);
  }
  
  // Check for hashtags
  const hashtagMatch = post.content.match(/#[A-Za-z0-9_]+/g);
  if (!hashtagMatch || hashtagMatch.length === 0) {
    issues.push(`Post #${index + 1}: missing hashtags (required: 1-3 from approved list)`);
  } else if (hashtagMatch.length > 3) {
    issues.push(`Post #${index + 1}: too many hashtags (${hashtagMatch.length}, max 3)`);
  }
  
  // Validate media path if provided
  if (post.mediaPath) {
    if (!fs.existsSync(post.mediaPath)) {
      issues.push(`Post #${index + 1}: media file not found at ${post.mediaPath}`);
    }
  }
  
  return issues;
}

/**
 * Validates individual reply
 */
function validateReply(reply, index) {
  const issues = [];
  
  if (!reply.content || typeof reply.content !== 'string') {
    issues.push(`Reply #${index + 1}: content is required`);
    return issues;
  }
  
  if (!reply.targetUrl || typeof reply.targetUrl !== 'string') {
    issues.push(`Reply #${index + 1}: targetUrl is required`);
    return issues;
  }
  
  // Validate URL format
  const urlPattern = /^https:\/\/(twitter|x)\.com\/[a-zA-Z0-9_]+\/status\/\d+$/;
  if (!urlPattern.test(reply.targetUrl)) {
    issues.push(`Reply #${index + 1}: invalid targetUrl format`);
  }
  
  // Check length
  if (reply.content.length > 280) {
    issues.push(`Reply #${index + 1}: content exceeds 280 characters`);
  }
  
  return issues;
}

/**
 * Validates individual quote tweet
 */
function validateQuote(quote, index) {
  const issues = [];
  
  if (!quote.content || typeof quote.content !== 'string') {
    issues.push(`Quote #${index + 1}: content is required`);
    return issues;
  }
  
  if (!quote.targetUrl || typeof quote.targetUrl !== 'string') {
    issues.push(`Quote #${index + 1}: targetUrl is required`);
    return issues;
  }
  
  // Check length
  if (quote.content.length > 280) {
    issues.push(`Quote #${index + 1}: content exceeds 280 characters`);
  }
  
  return issues;
}

/**
 * Validates follow action
 */
function validateFollow(follow, index) {
  const issues = [];
  
  if (!follow.username || typeof follow.username !== 'string') {
    issues.push(`Follow #${index + 1}: username is required`);
    return issues;
  }
  
  // Validate username format (no @ symbol)
  if (follow.username.startsWith('@')) {
    issues.push(`Follow #${index + 1}: username should not include @ symbol`);
  }
  
  return issues;
}

/**
 * Loads and validates workflow from file
 */
function loadAndValidate(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const workflow = JSON.parse(content);
    const validation = validateWorkflow(workflow);
    
    return {
      success: true,
      workflow,
      validation,
      filePath
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      filePath
    };
  }
}

// CLI usage
if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Usage: node workflow-validator.js <path-to-workflow.json>');
    process.exit(1);
  }
  
  const filePath = args[0];
  const result = loadAndValidate(filePath);
  
  if (result.success) {
    console.log('✅ Workflow loaded successfully');
    console.log(`Summary: ${JSON.stringify(result.validation.summary, null, 2)}`);
    
    if (result.validation.valid) {
      console.log('✅ Validation passed - no issues found');
      if (result.validation.warnings.length > 0) {
        console.log('⚠️ Warnings:');
        result.validation.warnings.forEach(w => console.log(`  - ${w}`));
      }
      process.exit(0);
    } else {
      console.log('❌ Validation failed:');
      result.validation.issues.forEach(issue => console.log(`  - ${issue}`));
      process.exit(1);
    }
  } else {
    console.log('❌ Failed to load workflow:');
    console.log(`  ${result.error}`);
    process.exit(1);
  }
}

export {
  validateWorkflow,
  validatePost,
  validateReply,
  validateQuote,
  validateFollow,
  loadAndValidate
};
