/**
 * Thread Generator - Generates Twitter threads using Grok API
 * Uses prompts from Notion or local config
 */

import fs from "fs";
import path from "path";

// Grok API configuration
const GROK_API_KEY = process.env.GROK_API_KEY;
const GROK_ENDPOINT = process.env.GROK_ENDPOINT || 'https://api.x.ai/v1';
const GROK_MODEL = process.env.GROK_MODEL || 'grok-4-1-fast-reasoning';

if (!GROK_API_KEY) {
  console.error('❌ Missing GROK_API_KEY environment variable');
  process.exit(1);
}

/**
 * System prompt for Alygn thread generation
 */
const ALYGN_SYSTEM_PROMPT = `You are writing Twitter content for Alygn (@aialygn), an independent AI governance institution.

**Alygn's Core Identity:**
- Independent AI governance institution (NOT a research lab, NOT a regulator)
- Focus: Making accountability, oversight, and coordination workable for advanced AI at global scale
- Value proposition: Governance legitimacy, not technology
- Principles: Neutrality across labs, operators, jurisdictions

**Communication Style:**
- Institutional, calm, restrained, non-promotional
- No hype, no urgency, no fear-mongering
- Focus on coordination failure, legitimacy, preparedness
- Avoid: "ensures compliance", "regulates", "controls"
- Use: "supports coordination", "enables accountability", "provides neutral infrastructure"

**Tweet Format (MANDATORY):**
- Each tweet: max 280 characters
- Include 1-3 hashtags from: #AIGovernance, #AIAlignment, #AISafety, #AGI, #AIPolicy, #AIEthics, #AIRisk
- End with: "more at @aialygn"

**Content Types:**
1. **Threads** (4-8 tweets): Deep dives into institutional truths, reframes, process thinking
2. **Single posts**: Key insights, quotes, institutional statements
3. **Replies**: Strategic engagement with relevant accounts

**Topics:**
- Governance legitimacy as infrastructure
- Coordination failure as systemic AI risk
- Emergency preparedness before crisis
- Trust scaling harder than technology
- Institutional risks > technical risks
- Restraint, credibility, durability (not speed, hype, visibility)`;

/**
 * Generates thread using Grok API
 * @param {string} topic - Topic or trend to generate content about
 * @param {string} type - 'thread', 'single', 'reply'
 * @param {number} tweetCount - Number of tweets (for threads)
 * @returns {Promise<string>} Generated markdown content
 */
async function generateContent(topic, type = 'thread', tweetCount = 5) {
  const prompt = buildPrompt(topic, type, tweetCount);
  
  const requestBody = {
    model: GROK_MODEL,
    messages: [
      { role: 'system', content: ALYGN_SYSTEM_PROMPT },
      { role: 'user', content: prompt }
    ],
    temperature: 0.7,
    max_tokens: 2000
  };

  try {
    const response = await fetch(`${GROK_ENDPOINT}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROK_API_KEY}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      throw new Error(`Grok API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error('Error generating content:', error.message);
    
    // Return mock content for testing without API key
    return generateMockContent(topic, type, tweetCount);
  }
}

/**
 * Builds prompt for Grok based on content type
 */
function buildPrompt(topic, type, tweetCount) {
  const basePrompt = `Generate Twitter content about: ${topic}`;
  
  if (type === 'thread') {
    return `${basePrompt}

Create a ${tweetCount}-tweet thread that:
1. Hook: Start with a compelling institutional truth or reframe
2-(${tweetCount-1}): Develop the argument with specific points, examples, or process thinking
${tweetCount}: End with a memorable takeaway about governance legitimacy or coordination

Format each tweet as:
1. [Tweet content]
2. [Tweet content]
...

Remember: Institutional tone, no hype, focus on legitimacy/coordination.`;
  } else if (type === 'single') {
    return `${basePrompt}

Create a single powerful tweet (max 280 chars) that captures an institutional truth about this topic.

Format:
[Single tweet content]`;
  } else if (type === 'reply') {
    return `${basePrompt}

Create a strategic reply that adds Alygn's governance perspective to the conversation.

Format:
[Reply content]`;
  }
  
  return basePrompt;
}

/**
 * Generates mock content for testing (no API key)
 */
function generateMockContent(topic, type, tweetCount) {
  const mockThreads = {
    default: `1. Governance can't be retrofitted at frontier scale. Legitimacy is infrastructure that must exist before crisis, not improvised during one.

#AIGovernance

more at @aialygn

2. The hardest AI risks are institutional, not technical. Coordination failure across developers, operators, and public institutions is the real systemic threat.

#AISafety #AIRisk

more at @aialygn

3. This is why neutral governance infrastructure matters - not to control AI, but to support coordination without centralizing power.

#AIGovernance #AIPolicy

more at @aialygn

4. Emergency response that doesn't exist before crisis rarely works during one. Preparedness is the price of legitimacy.

#AISafety

more at @aialygn

5. Trust is harder to scale than technology. This is why restraint, credibility, and durability matter more than speed, hype, or visibility.

#AIGovernance #AIEthics

more at @aialygn`
  };

  return mockThreads.default;
}

/**
 * Loads prompts from Notion config or local file
 */
function loadPrompts(promptIds) {
  const promptsFile = path.join(__dirname, 'pre-approved-posts.json');
  
  if (!fs.existsSync(promptsFile)) {
    console.warn('Pre-approved prompts not found, using defaults');
    return [];
  }
  
  const data = JSON.parse(fs.readFileSync(promptsFile, 'utf8'));
  
  if (promptIds === 'all') {
    return data.posts || [];
  }
  
  const ids = promptIds.split(',').map(id => parseInt(id.trim()));
  return (data.posts || []).filter(post => ids.includes(post.id));
}

// CLI usage
if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Usage: node thread-generator.js --topic="topic" --type=thread --count=5');
    console.error('   or: node thread-generator.js --prompts=1,13');
    process.exit(1);
  }
  
  const topicArg = args.find(a => a.startsWith('--topic='));
  const typeArg = args.find(a => a.startsWith('--type='));
  const countArg = args.find(a => a.startsWith('--count='));
  const promptsArg = args.find(a => a.startsWith('--prompts='));
  
  if (promptsArg) {
    const promptIds = promptsArg.split('=')[1];
    const prompts = loadPrompts(promptIds);
    console.log(`Loaded ${prompts.length} prompts`);
    prompts.forEach(prompt => {
      console.log(`\n--- Prompt #${prompt.id}: ${prompt.title} ---`);
      console.log(prompt.content);
    });
  } else {
    const topic = topicArg ? topicArg.split('=')[1].replace(/"/g, '') : 'AI governance legitimacy';
    const type = typeArg ? typeArg.split('=')[1] : 'thread';
    const count = countArg ? parseInt(countArg.split('=')[1]) : 5;
    
    console.log(`Generating ${type} about "${topic}" (${count} tweets)...`);
    
    generateContent(topic, type, count).then(content => {
      console.log('\n--- Generated Content ---');
      console.log(content);
      
      // Save to file
      const outputFile = `/tmp/x-growth-generated-${Date.now()}.md`;
      fs.writeFileSync(outputFile, content);
      console.log(`\nSaved to ${outputFile}`);
    });
  }
}

export {
  generateContent,
  loadPrompts,
  ALYGN_SYSTEM_PROMPT
};
