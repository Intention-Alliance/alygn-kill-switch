/**
 * Format Validator - Validates content format per project config
 * Checks signature, hashtags, length, voice consistency
 * 
 * Usage:
 *   node format-validator.js /path/to/workflow.json --project=myproject
 */

import fs from "fs";
import path from "path";

import { loadProject } from "./load-project.js";

/**
 * Validates workflow content against project rules
 * @param {Object} workflow - Workflow JSON with posts, replies, quotes
 * @param {Object} config - Project configuration
 * @returns {Object} Validation result
 */
function validateWorkflow(workflow, config) {
  const results = {
    valid: true,
    errors: [],
    warnings: [],
    stats: {
      totalPosts: 0,
      totalReplies: 0,
      totalQuotes: 0,
      passedValidation: 0,
      failedValidation: 0
    }
  };
  
  const signature = config.twitter?.signature || `more at ${config.twitter?.handle}`;
  const approvedHashtags = config.twitter?.hashtags || [];
  const maxHashtags = 3;
  const maxLength = 280;
  
  // Validate posts
  if (workflow.posts) {
    results.stats.totalPosts = workflow.posts.length;
    workflow.posts.forEach((post, index) => {
      const postResult = validateContent(post.content, signature, approvedHashtags, maxHashtags, maxLength);
      
      if (!postResult.valid) {
        results.valid = false;
        results.errors.push(`Post #${index + 1}: ${postResult.errors.join(', ')}`);
        results.stats.failedValidation++;
      } else {
        results.stats.passedValidation++;
        if (postResult.warnings.length > 0) {
          results.warnings.push(`Post #${index + 1}: ${postResult.warnings.join(', ')}`);
        }
      }
    });
  }
  
  // Validate replies
  if (workflow.replies) {
    results.stats.totalReplies = workflow.replies.length;
    workflow.replies.forEach((reply, index) => {
      const replyResult = validateContent(reply.content, signature, approvedHashtags, maxHashtags, maxLength);
      
      if (!replyResult.valid) {
        results.valid = false;
        results.errors.push(`Reply #${index + 1}: ${replyResult.errors.join(', ')}`);
        results.stats.failedValidation++;
      } else {
        results.stats.passedValidation++;
      }
      
      // Validate target URL
      if (!reply.targetUrl) {
        results.valid = false;
        results.errors.push(`Reply #${index + 1}: Missing targetUrl`);
      }
    });
  }
  
  // Validate quotes
  if (workflow.quotes) {
    results.stats.totalQuotes = workflow.quotes.length;
    workflow.quotes.forEach((quote, index) => {
      const quoteResult = validateContent(quote.content, signature, approvedHashtags, maxHashtags, maxLength);
      
      if (!quoteResult.valid) {
        results.valid = false;
        results.errors.push(`Quote #${index + 1}: ${quoteResult.errors.join(', ')}`);
        results.stats.failedValidation++;
      } else {
        results.stats.passedValidation++;
      }
      
      // Validate target URL
      if (!quote.targetUrl) {
        results.valid = false;
        results.errors.push(`Quote #${index + 1}: Missing targetUrl`);
      }
    });
  }
  
  return results;
}

/**
 * Validates individual content string
 */
function validateContent(content, signature, approvedHashtags, maxHashtags, maxLength) {
  const result = {
    valid: true,
    errors: [],
    warnings: []
  };
  
  if (!content || typeof content !== 'string') {
    result.valid = false;
    result.errors.push('Content is empty or invalid');
    return result;
  }
  
  // Check length
  if (content.length > maxLength) {
    result.valid = false;
    result.errors.push(`Exceeds ${maxLength} characters (${content.length})`);
  } else if (content.length > maxLength * 0.9) {
    result.warnings.push(`Near character limit (${content.length}/${maxLength})`);
  }
  
  // Check signature
  if (!content.includes(signature)) {
    result.valid = false;
    result.errors.push(`Missing signature "${signature}"`);
  }
  
  // Check signature position (should be at end)
  const trimmedContent = content.trim();
  if (!trimmedContent.endsWith(signature)) {
    result.warnings.push('Signature should be at the end');
  }
  
  // Check hashtags
  const hashtags = content.match(/#[A-Za-z0-9_]+/g) || [];
  
  if (hashtags.length === 0) {
    result.warnings.push('No hashtags found');
  } else if (hashtags.length > maxHashtags) {
    result.valid = false;
    result.errors.push(`Too many hashtags (${hashtags.length}, max ${maxHashtags})`);
  }
  
  // Check if hashtags are from approved list (if configured)
  if (approvedHashtags.length > 0) {
    const unapprovedHashtags = hashtags.filter(tag => !approvedHashtags.includes(tag));
    if (unapprovedHashtags.length > 0) {
      result.warnings.push(`Unapproved hashtags: ${unapprovedHashtags.join(', ')}`);
    }
  }
  
  return result;
}

/**
 * Auto-fixes common issues in workflow
 */
function autoFixWorkflow(workflow, config) {
  const signature = config.twitter?.signature || `more at ${config.twitter?.handle}`;
  const hashtags = config.twitter?.hashtags || ['#Tech'];
  
  let fixCount = 0;
  
  // Fix posts
  if (workflow.posts) {
    workflow.posts = workflow.posts.map(post => {
      let content = post.content;
      
      // Add signature if missing
      if (!content.includes(signature)) {
        content = `${content}\n\n${hashtags.slice(0, 2).join(' ')}\n\n${signature}`;
        fixCount++;
      }
      
      return { ...post, content };
    });
  }
  
  // Fix replies
  if (workflow.replies) {
    workflow.replies = workflow.replies.map(reply => {
      let content = reply.content;
      
      // Add signature if missing
      if (!content.includes(signature)) {
        content = `${content}\n\n${hashtags[0]}\n\n${signature}`;
        fixCount++;
      }
      
      return { ...reply, content };
    });
  }
  
  // Fix quotes
  if (workflow.quotes) {
    workflow.quotes = workflow.quotes.map(quote => {
      let content = quote.content;
      
      // Add signature if missing
      if (!content.includes(signature)) {
        content = `${content}\n\n${hashtags[0]}\n\n${signature}`;
        fixCount++;
      }
      
      return { ...quote, content };
    });
  }
  
  console.log(`🔧 Auto-fixed ${fixCount} items`);
  
  return workflow;
}

// CLI usage
if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  const args = process.argv.slice(2);
  
  const workflowArg = args.find(a => !a.startsWith('--'));
  const projectArg = args.find(a => a.startsWith('--project='));
  const fixArg = args.includes('--fix');
  const outputArg = args.find(a => a.startsWith('--output='));
  
  if (!workflowArg) {
    console.error('Usage: node format-validator.js <workflow.json> --project=name [--fix] [--output=fixed.json]');
    process.exit(1);
  }
  
  const workflowFile = workflowArg;
  const projectName = projectArg ? projectArg.split('=')[1] : null;
  
  try {
    const workflow = JSON.parse(fs.readFileSync(workflowFile, 'utf8'));
    
    let config = {};
    if (projectName) {
      config = loadProject(projectName);
    } else {
      // Use default config
      config = {
        twitter: {
          handle: '@project',
          signature: 'more at @project',
          hashtags: ['#Tech', '#Innovation']
        }
      };
    }
    
    let validatedWorkflow = workflow;
    
    if (fixArg) {
      console.log('🔧 Auto-fixing issues...');
      validatedWorkflow = autoFixWorkflow(workflow, config);
    }
    
    const results = validateWorkflow(validatedWorkflow, config);
    
    console.log('\n📊 Validation Results:');
    console.log(`   Status: ${results.valid ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`   Posts: ${results.stats.totalPosts}`);
    console.log(`   Replies: ${results.stats.totalReplies}`);
    console.log(`   Quotes: ${results.stats.totalQuotes}`);
    console.log(`   Passed: ${results.stats.passedValidation}`);
    console.log(`   Failed: ${results.stats.failedValidation}`);
    
    if (results.errors.length > 0) {
      console.log('\n❌ Errors:');
      results.errors.forEach(err => console.log(`   - ${err}`));
    }
    
    if (results.warnings.length > 0) {
      console.log('\n⚠️  Warnings:');
      results.warnings.forEach(warn => console.log(`   - ${warn}`));
    }
    
    if (fixArg && outputArg) {
      const outputFile = outputArg.split('=')[1];
      fs.writeFileSync(outputFile, JSON.stringify(validatedWorkflow, null, 2));
      console.log(`\n💾 Fixed workflow saved to ${outputFile}`);
    }
    
    process.exit(results.valid ? 0 : 1);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

export {
  validateWorkflow,
  validateContent,
  autoFixWorkflow
};
