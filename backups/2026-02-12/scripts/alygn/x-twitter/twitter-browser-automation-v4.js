#!/usr/bin/env node
/**
 * ALYGN Twitter Automation Orchestration v4
 * Full browser-based Twitter automation with AI-driven selection
 * 
 * Usage:
 *   node twitter-browser-automation-v4.js                    # Default: prompts 1 + 13
 *   node twitter-browser-automation-v4.js --posts 1,3        # Multiple post prompts
 *   node twitter-browser-automation-v4.js --posts 3          # Niche posts only
 *   node twitter-browser-automation-v4.js --replies 13       # Custom reply prompt
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const CONFIG = {
  WORKSPACE: path.join(process.env.HOME, ".openclaw/workspace"),
  OUTPUT_DIR: path.join(process.env.HOME, ".openclaw/workspace/twitter-outputs"),
  SCRIPTS_DIR: path.join(process.env.HOME, ".openclaw/workspace/scripts/alygn/x-twitter"),
  PRODUCTION_HANDLE: "@aialygn",
  POSTS_TO_PUBLISH: 5,
  REPLIES_TO_POST: 5,
  MAX_THREAD_LENGTH: 5
};

// Parse command line args
function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    postPrompts: [1],      // Default: prompt 1 (thread ideas)
    replyPrompt: 13        // Default: prompt 13 (strategic replies)
  };
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--posts" && args[i + 1]) {
      config.postPrompts = args[i + 1].split(",").map(n => parseInt(n.trim(), 10)).filter(n => !isNaN(n));
      i++;
    } else if (args[i] === "--replies" && args[i + 1]) {
      config.replyPrompt = parseInt(args[i + 1], 10);
      i++;
    }
  }
  
  return config;
}

async function main() {
  const runConfig = parseArgs();
  
  console.log("🚀 ALYGN Twitter Automation v4 - Starting");
  console.log(`⏰ Execution time: ${new Date().toISOString()}`);
  console.log(`📋 Post prompts: ${runConfig.postPrompts.join(", ")}`);
  console.log(`💬 Reply prompt: ${runConfig.replyPrompt}`);

  try {
    // Step 1: Generate posts from all specified prompts
    console.log("\n📝 Step 1: Generating post ideas...");
    const allPosts = [];
    
    for (const promptNum of runConfig.postPrompts) {
      console.log(`   Running prompt #${promptNum}...`);
      execSync(`bun ${path.join(CONFIG.SCRIPTS_DIR, "twitter-automation-v2.js")} exec ${promptNum}`, 
        { cwd: CONFIG.WORKSPACE, stdio: "inherit" });
      
      // Load and parse this prompt's output
      const postsFile = getLatestFile(CONFIG.OUTPUT_DIR, `prompt-${promptNum}-`);
      if (postsFile) {
        const content = fs.readFileSync(postsFile, "utf-8");
        const posts = parseMarkdownPosts(content);
        posts.forEach(p => p.sourcePrompt = promptNum);
        allPosts.push(...posts);
        console.log(`   ✅ Got ${posts.length} posts from prompt #${promptNum}`);
      }
    }

    // Step 2: Generate replies
    console.log("\n💬 Step 2: Generating reply ideas...");
    execSync(`bun ${path.join(CONFIG.SCRIPTS_DIR, "twitter-automation-v2.js")} exec ${runConfig.replyPrompt}`, 
      { cwd: CONFIG.WORKSPACE, stdio: "inherit" });

    // Step 3: Load reply content
    console.log("\n📂 Step 3: Loading generated content...");
    const repliesFile = getLatestFile(CONFIG.OUTPUT_DIR, `prompt-${runConfig.replyPrompt}-`);

    if (!repliesFile) throw new Error("Reply file not found");

    const repliesContent = fs.readFileSync(repliesFile, "utf-8");
    const { replies, targets } = parseRepliesAndTargets(repliesContent);

    console.log(`✅ Total: ${allPosts.length} posts, ${replies.length} replies, ${targets.length} targets`);

    if (allPosts.length === 0) {
      console.log("⚠️ Warning: No posts parsed from any prompt.");
    }

    // Step 4: Select best content (mix from all prompts if multiple)
    const selection = {
      posts: selectBestPosts(allPosts, CONFIG.POSTS_TO_PUBLISH),
      replies: replies.slice(0, CONFIG.REPLIES_TO_POST).map((r, i) => ({
        ...r,
        targetHandle: targets[i]?.handle || null,
        targetUrl: targets[i]?.url || null
      })).filter(r => r.targetHandle)
    };

    // Step 5: Build workflow
    const workflow = {
      timestamp: new Date().toISOString(),
      config: {
        postPrompts: runConfig.postPrompts,
        replyPrompt: runConfig.replyPrompt
      },
      posts: selection.posts.map((p, i) => ({
        id: i + 1,
        title: p.title,
        hook: p.hook,
        points: p.points,
        isThread: p.points.length > 1,
        sourcePrompt: p.sourcePrompt,
        mention: CONFIG.PRODUCTION_HANDLE,
        fullText: `${p.hook}\n\nMore at ${CONFIG.PRODUCTION_HANDLE}`
      })),
      replies: selection.replies.map((r, i) => ({
        id: i + 1,
        targetHandle: r.targetHandle,
        targetUrl: r.targetUrl,
        // Fix common typo in Grok output
        content: r.content.replace(/@aialyygn/gi, CONFIG.PRODUCTION_HANDLE),
        mention: CONFIG.PRODUCTION_HANDLE
      })),
      profiles: targets.map(t => t.handle).slice(0, 5)
    };

    // Save workflow
    const workflowFile = path.join(CONFIG.OUTPUT_DIR, `workflow-${Date.now()}.json`);
    fs.writeFileSync(workflowFile, JSON.stringify(workflow, null, 2));

    console.log("\n📊 Summary:");
    console.log(`   Posts: ${workflow.posts.length} (from prompts: ${[...new Set(workflow.posts.map(p => p.sourcePrompt))].join(", ")})`);
    console.log(`   Replies: ${workflow.replies.length}`);
    console.log(`   Profiles: ${workflow.profiles.length}`);
    console.log(`   Workflow: ${workflowFile}`);

    workflow.posts.forEach((p, i) => console.log(`   ${i+1}. [P${p.sourcePrompt}] ${p.title.substring(0, 45)}...`));

    return { success: true, workflowFile };
  } catch (error) {
    console.error("❌ Error:", error.message);
    throw error;
  }
}

/**
 * Select best posts, mixing from different prompts if available
 */
function selectBestPosts(posts, count) {
  if (posts.length <= count) return posts;
  
  // Group by source prompt
  const byPrompt = {};
  posts.forEach(p => {
    const key = p.sourcePrompt || 1;
    if (!byPrompt[key]) byPrompt[key] = [];
    byPrompt[key].push(p);
  });
  
  const prompts = Object.keys(byPrompt);
  const selected = [];
  let round = 0;
  
  // Round-robin selection to ensure variety
  while (selected.length < count) {
    const promptKey = prompts[round % prompts.length];
    const promptPosts = byPrompt[promptKey];
    
    if (promptPosts && promptPosts.length > 0) {
      selected.push(promptPosts.shift());
    }
    
    round++;
    // Safety: if all prompts exhausted
    if (Object.values(byPrompt).every(arr => arr.length === 0)) break;
  }
  
  return selected;
}

function getLatestFile(dir, pattern) {
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir)
    .filter(f => f.includes(pattern) && f.endsWith(".md"))
    .map(f => ({ path: path.join(dir, f), time: fs.statSync(path.join(dir, f)).mtime.getTime() }))
    .sort((a, b) => b.time - a.time);
  return files[0]?.path || null;
}

/**
 * Parse posts - handles multiple formats:
 * Format A: ### 1. **Title** + - Hook: "text"
 * Format B: ### 1. "Hook text" (hook IS the title)
 */
function parseMarkdownPosts(content) {
  const posts = [];
  
  // Split by numbered sections: ### 1. or ### 10.
  const sections = content.split(/###\s+(\d+)\.\s+/);
  
  // sections[0] is header, then pairs of [number, content]
  for (let i = 1; i < sections.length; i += 2) {
    const sectionContent = sections[i + 1];
    if (!sectionContent) continue;
    
    const lines = sectionContent.split("\n");
    if (!lines.length) continue;
    
    // First line is either: **Title** or "Hook text"
    const firstLine = lines[0].trim();
    let title = "", hook = "";
    
    // Format B: "Hook text" (quotes indicate hook-as-title)
    const quoteMatch = firstLine.match(/^[""](.+?)[""].*$/);
    if (quoteMatch) {
      hook = quoteMatch[1];
      title = hook;
    } else {
      // Format A: **Title**
      const boldMatch = firstLine.match(/\*\*(.+?)\*\*/);
      title = boldMatch ? boldMatch[1] : firstLine.replace(/\*\*/g, "").trim();
      
      // Look for Hook: "text" in following lines
      const hookLine = lines.find(l => /hook:/i.test(l));
      if (hookLine) {
        const m = hookLine.match(/[""]([^""]+)[""]/);
        hook = m ? m[1] : title;
      } else {
        hook = title;
      }
    }
    
    // Collect points (lines starting with - or number.)
    const points = [];
    for (const line of lines.slice(1)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (/^hook:/i.test(trimmed)) continue;
      
      // Match: - text, 1. text, etc.
      const pointMatch = trimmed.match(/^[-•]\s+(.+)$/) || trimmed.match(/^\d+\.\s+(.+)$/);
      if (pointMatch) {
        const text = pointMatch[1].trim();
        // Skip poll/question indicators
        if (text.length > 5 && !/^(poll|q|your take):/i.test(text)) {
          points.push(text);
        }
      }
    }
    
    if (title || hook) {
      posts.push({
        title,
        hook: hook || title,
        points: points.slice(0, CONFIG.MAX_THREAD_LENGTH),
        isThread: points.length > 1
      });
    }
  }
  
  return posts;
}

/**
 * Parse replies and targets from prompt #13
 * Format: 1. **To @handle's post** (link): "reply text"
 */
function parseRepliesAndTargets(content) {
  const replies = [], targets = [];
  
  // Pattern 1: **To @handle...** ... "reply text"
  const pattern1 = /\d+\.\s+\*\*To @(\w+)[^*]*\*\*[^""]*[""]([^""]+)[""]/g;
  let m;
  
  while ((m = pattern1.exec(content)) !== null) {
    targets.push({ handle: `@${m[1]}`, url: null });
    replies.push({ content: m[2].trim() });
  }
  
  // If no matches, try alternative patterns
  if (replies.length === 0) {
    // Try: To @handle ... [content without quotes]
    const pattern2 = /\d+\.\s+\*\*To @(\w+)[^*]*\*\*[:\s]*\n?\s*(.+?)(?=\n\n|\d+\.\s+\*\*To|$)/gs;
    while ((m = pattern2.exec(content)) !== null) {
      const text = m[2].replace(/[""][^""]*[""]/, match => match.slice(1, -1)).trim();
      if (text.length > 20) {
        targets.push({ handle: `@${m[1]}`, url: null });
        replies.push({ content: text });
      }
    }
  }
  
  // Extract URLs if present
  const urlPattern = /https:\/\/x\.com\/(\w+)\/status\/(\d+)/g;
  let idx = 0;
  while ((m = urlPattern.exec(content)) !== null && idx < targets.length) {
    if (!targets[idx].url) {
      targets[idx].url = m[0];
    }
    idx++;
  }
  
  return { replies, targets };
}

if (require.main === module) {
  main().then(r => { console.log("🎉 Done!", JSON.stringify(r)); process.exit(0); })
    .catch(e => { console.error("💥", e.message); process.exit(1); });
}

module.exports = { main, parseMarkdownPosts, parseRepliesAndTargets };
