#!/usr/bin/env node

/**
 * Generate images for Twitter posts using Gemini API
 * Updates workflow JSON with imagePath for each post
 */

import fs from "fs";
import path from "path";
import https from "https";

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

// Map posts to image prompts
const imagePrompts = {
  "Superintelligence by 2030": "Futuristic AI superintelligence concept, digital neural networks, glowing connections, sci-fi aesthetic, timeline visualization, dramatic lighting",
  "Microsoft's Tay bot alignment failure": "Corrupted AI bot, red warning signs, misaligned systems, broken ethics, error messages, dark theme",
  "Mechanistic Interpretability": "AI black box visualization, neural circuits being decoded, circuit diagrams, light rays penetrating darkness, scientific aesthetic",
  "COMPAS AI bias": "Scales of justice with red/blue imbalance, bias visualization, fairness metrics, broken equilibrium, legal theme",
  "Agentic AI": "Autonomous AI agent breaking free, sandboxed environment, escape visualization, instrumental convergence, dynamic energy"
};

// Helper: Call Gemini API
async function generateImageViaGemini(prompt) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      contents: [{
        parts: [{
          text: `Generate a professional, high-quality image for a Twitter post about AI alignment. Style: Bold, modern, technical. Prompt: ${prompt}`
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
            resolve(response.candidates[0].content.parts[0].text);
          } else {
            reject(new Error(`No image in response: ${JSON.stringify(response)}`));
          }
        } catch (e) {
          reject(new Error(`Parse error: ${body}`));
        }
      });
    });

    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

// For now, just update workflow with image paths (images can be generated separately)
async function updateWorkflowWithImagePaths() {
  console.log("🖼️  Updating workflow with image paths...\n");

  for (let i = 0; i < workflow.posts.length; i++) {
    const post = workflow.posts[i];
    const imageName = `post-${i + 1}-${post.hook.toLowerCase().replace(/[^a-z0-9]/g, "-").substring(0, 30)}.png`;
    const imagePath = path.join(IMAGE_OUTPUT_DIR, imageName);

    workflow.posts[i].imagePath = imagePath;
    console.log(`[${i + 1}] ${post.hook}`);
    console.log(`    Image: ${imageName}`);
    console.log(`    Status: Ready for generation\n`);
  }

  // Save updated workflow
  fs.writeFileSync(WORKFLOW_FILE, JSON.stringify(workflow, null, 2));
  console.log("✅ Workflow updated with image paths!");
}

async function main() {
  console.log("🎨 Image Generator for Twitter Posts - ALYGN");
  console.log("=".repeat(60));
  console.log("");

  await updateWorkflowWithImagePaths();

  console.log("\n📝 Next Steps:");
  console.log("1. Review post content and associated image descriptions");
  console.log("2. Generate images manually via Gemini API (image generation endpoint)");
  console.log("3. Place images in: " + IMAGE_OUTPUT_DIR);
  console.log("4. Run post-via-x-api.js to post with images attached");
  console.log("");
  console.log("Or integrate automated image generation from Gemini Image API.");
}

main().catch(error => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});
