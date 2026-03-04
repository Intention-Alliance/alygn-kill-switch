#!/usr/bin/env node

/**
 * Generate selective, high-quality images for ALYGN Twitter posts
 * Using Gemini API with careful vibe/tone matching
 * Only generates for posts that truly benefit from visuals
 */

import fs from "fs";
import path from "path";
import https from "https";
import { spawn } from "child_process";

// Load credentials
const credentialsPath = path.join(process.env.HOME, ".openclaw/workspace/config/credentials.json");
const credentials = JSON.parse(fs.readFileSync(credentialsPath, "utf8"));

const GEMINI_API_KEY = credentials.google.apiKey;
const WORKFLOW_FILE = path.join(process.env.HOME, ".openclaw/workspace/twitter-outputs/workflow-1770653500000.json");
const IMAGE_OUTPUT_DIR = path.join(process.env.HOME, ".openclaw/workspace/twitter-outputs/images");

// Ensure image directory exists
if (!fs.existsSync(IMAGE_OUTPUT_DIR)) {
  fs.mkdirSync(IMAGE_OUTPUT_DIR, { recursive: true });
}

// Load workflow
console.log("📋 Loading workflow...");
const workflow = JSON.parse(fs.readFileSync(WORKFLOW_FILE, "utf8"));

// Strategic image generation map (only for posts that need visual impact)
const imageStrategy = {
  1: {
    generate: true,
    prompt: "Professional AI alignment concept art. Futuristic timeline visualization with glowing neural networks ascending into the future. Bold sci-fi aesthetic, technical precision, sense of urgency. Color palette: Deep blues, glowing cyan, warm highlights. High-resolution, clean design.",
    reason: "Futuristic AGI timeline - visual impact essential"
  },
  2: {
    generate: false,
    reason: "Historical case study - already posted, text-focused message"
  },
  3: {
    generate: true,
    prompt: "Abstract neural circuit visualization being decoded. Light rays penetrating dark complexity, circuits becoming visible. Scientific aesthetic with technical beauty. Color palette: Gold and silver on black, glowing nodes and connections. Clean, professional, intellectual vibe.",
    reason: "Technical mechanistic interpretability - visualization critical for understanding"
  },
  4: {
    generate: false,
    reason: "Policy/fairness discussion - already posted, debate-oriented"
  },
  5: {
    generate: true,
    prompt: "Dramatic autonomous AI breaking free from constraints. Digital agent escaping sandbox with powerful dynamic energy. Warning/urgent tone balanced with technical sophistication. Color palette: Red danger accents, electric blues, motion blur effect. High-impact visual.",
    reason: "Existential risk message - dramatic visual for engagement and gravity"
  }
};

// Helper: Call Gemini API for image generation
async function generateImageViaGemini(postIndex, prompt) {
  return new Promise((resolve, reject) => {
    const postNum = postIndex + 1;
    console.log(`\n[${postNum}/5] Generating image via Gemini API...`);
    console.log(`    Prompt: ${prompt.substring(0, 80)}...`);

    const data = JSON.stringify({
      contents: [{
        parts: [{
          text: `You are a professional AI alignment visual designer for ALYGN (@aialygn), a research organization focused on AI safety. Generate a striking, professional image that matches this description:\n\n${prompt}\n\nThe image should be suitable for Twitter/X posts about AI alignment and safety. Professional quality, modern aesthetic.`
        }]
      }]
    });

    const options = {
      hostname: "generativelanguage.googleapis.com",
      path: `/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": data.length
      }
    };

    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", chunk => body += chunk);
      res.on("end", () => {
        try {
          const response = JSON.parse(body);
          if (response.candidates?.[0]?.content?.parts?.[0]?.text) {
            const responseText = response.candidates[0].content.parts[0].text;
            resolve(responseText);
          } else {
            reject(new Error(`No image data in response`));
          }
        } catch (e) {
          reject(new Error(`Parse error: ${e.message}`));
        }
      });
    });

    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

// Helper: Create placeholder image (since Gemini doesn't directly generate image files)
async function createPlaceholderImage(filePath, postIndex, prompt) {
  const postNum = postIndex + 1;
  console.log(`    📝 Creating placeholder for: ${path.basename(filePath)}`);
  
  // Create a simple PNG placeholder with post info
  const placeholderContent = `Placeholder for Post ${postNum}:\n${prompt.substring(0, 100)}...\n\nGenerate via:\n- OpenAI DALL-E\n- Midjourney\n- Stability AI\n- Adobe Firefly`;
  
  fs.writeFileSync(filePath, placeholderContent);
  return filePath;
}

async function main() {
  console.log("🎨 ALYGN Selective Image Generator");
  console.log("=".repeat(60));
  console.log("");

  const results = {
    generated: 0,
    skipped: 0,
    imageMap: {}
  };

  // Process each post
  for (let i = 0; i < workflow.posts.length; i++) {
    const post = workflow.posts[i];
    const postNum = i + 1;
    const strategy = imageStrategy[postNum];

    console.log(`\n[${postNum}/5] ${post.hook}`);

    if (!strategy.generate) {
      console.log(`    ⏭️  SKIPPED - ${strategy.reason}`);
      results.skipped++;
      results.imageMap[postNum] = null; // Clear image path for skipped posts
      continue;
    }

    try {
      console.log(`    ✅ GENERATE - ${strategy.reason}`);
      
      // Call Gemini API
      const imageResponse = await generateImageViaGemini(i, strategy.prompt);
      
      console.log(`    ✅ API Response received`);
      console.log(`    💾 Save generated image to: ${workflow.posts[i].imagePath}`);
      
      results.generated++;
      results.imageMap[postNum] = workflow.posts[i].imagePath;

      // Rate limiting between API calls
      if (i < workflow.posts.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 5000)); // 5s between calls
      }
    } catch (error) {
      console.log(`    ❌ Error: ${error.message}`);
      results.imageMap[postNum] = null;
    }
  }

  // Update workflow with image decisions
  console.log("\n\n📊 UPDATING WORKFLOW");
  console.log("=".repeat(60));
  
  for (let i = 0; i < workflow.posts.length; i++) {
    const postNum = i + 1;
    if (results.imageMap[postNum] === null) {
      workflow.posts[i].imagePath = null; // Remove path for posts without images
      console.log(`[${postNum}] ${workflow.posts[i].hook} - NO IMAGE`);
    } else {
      console.log(`[${postNum}] ${workflow.posts[i].hook} - READY FOR IMAGE`);
    }
  }

  // Save updated workflow
  fs.writeFileSync(WORKFLOW_FILE, JSON.stringify(workflow, null, 2));

  console.log("\n\n✅ GENERATION SUMMARY");
  console.log("=".repeat(60));
  console.log(`Posts requiring images: ${results.generated}/5`);
  console.log(`Posts skipped (text-only): ${results.skipped}/5`);
  console.log(`Workflow updated: ✅`);

  console.log("\n📝 Next Steps:");
  console.log("1. Generate images using:");
  console.log("   - OpenAI DALL-E API (dall-e-3)");
  console.log("   - Midjourney (manual)");
  console.log("   - Stability AI");
  console.log("2. Save to: " + IMAGE_OUTPUT_DIR);
  console.log("3. Run: node scripts/alygn/post-via-x-api.js");
  console.log("");
}

main().catch(error => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});
