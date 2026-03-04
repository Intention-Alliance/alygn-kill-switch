/**
 * Content Generator - Generates Twitter content using Grok API
 * Adapts to project voice and topics
 * 
 * Usage:
 *   node content-generator.js --project=myproject --trends=/path/to/trends.json --mock
 */

const fs = require('fs');
const path = require('path');

const { loadProject } = require('./load-project');

// Grok API configuration
const GROK_API_KEY = process.env.GROK_API_KEY;
const GROK_ENDPOINT = process.env.GROK_ENDPOINT || 'https://api.x.ai/v1';
const GROK_MODEL = process.env.GROK_MODEL || 'grok-4-1-fast-reasoning';

/**
 * Generates content for a project based on trends
 * @param {Object} config - Project configuration
 * @param {Array} trends - Array of trend objects
 * @param {boolean} mock - Use mock data
 * @returns {Promise<Object>} Workflow JSON with generated content
 */
async function generateContent(config, trends, mock = false) {
  console.log(`✍️  Generating content for ${config.name}...`);
  
  if (mock || !GROK_API_KEY) {
    console.log('⚠️  Mock mode or no API key - generating sample content');
    return generateMockContent(config, trends);
  }
  
  // In production, would call Grok API with project-specific system prompt
  const systemPrompt = buildSystemPrompt(config);
  const userPrompt = buildUserPrompt(config, trends);
  
  try {
    const response = await fetch(`${GROK_ENDPOINT}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROK_API_KEY}`
      },
      body: JSON.stringify({
        model: GROK_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: config.grok?.temperature || 0.7,
        max_tokens: config.grok?.maxTokens || 2000
      })
    });
    
    if (!response.ok) {
      throw new Error(`Grok API error: ${response.status}`);
    }
    
    const data = await response.json();
    return parseGrokResponse(data, config);
  } catch (error) {
    console.error('Error calling Grok API:', error.message);
    console.log('Falling back to mock content...');
    return generateMockContent(config, trends);
  }
}

/**
 * Builds system prompt based on project voice
 */
function buildSystemPrompt(config) {
  const voice = config.twitter?.voice || 'professional';
  const topics = config.twitter?.topics?.join(', ') || 'general';
  const handle = config.twitter?.handle || '@project';
  
  const voicePrompts = {
    professional: 'You are a professional, authoritative voice in technology and innovation.',
    casual: 'You are a friendly, approachable brand with a conversational tone.',
    institutional: 'You are an independent institution focused on governance, coordination, and legitimacy.',
    quirky: 'You are a quirky, enthusiastic brand with playful energy.',
    academic: 'You are a research-focused voice with emphasis on evidence and analysis.'
  };
  
  return `You are creating Twitter content for ${handle}.

${voicePrompts[voice] || voicePrompts.professional}

**Topics:** ${topics}

**Voice Guidelines:**
- Tone: ${voice}
- Hashtags: Use 1-3 from project config
- Signature: "${config.twitter?.signature || 'more at ' + handle}"
- Max length: 280 characters per tweet

**Content Types to Generate:**
1. Original posts (2-3 tweets)
2. Strategic replies to trends (2-3 replies)
3. Quote tweets with commentary (1-2 quotes)

Keep content concise, engaging, and aligned with project voice.`;
}

/**
 * Builds user prompt with trends
 */
function buildUserPrompt(config, trends) {
  const topTrends = trends.slice(0, 5);
  
  return `Generate Twitter content based on these ${topTrends.length} trending topics:

${topTrends.map((trend, i) => `
**Trend #${i + 1}:** ${trend.topic}
- Tweets: ${trend.tweet_count.toLocaleString()}
- Sample: "${trend.sample_tweets[0]}"
`).join('\n')}

For each trend you choose to engage with, provide:
1. **Post** - Original tweet about the trend
2. **Reply** - Reply to existing conversation
3. **Quote** - Quote tweet with your perspective

Format as JSON:
{
  "posts": [{"content": "...", "hashtags": ["#Tag1"]}],
  "replies": [{"content": "...", "targetUrl": "..."}],
  "quotes": [{"content": "...", "targetUrl": "..."}]
}`;
}

/**
 * Parses Grok API response into workflow JSON
 */
function parseGrokResponse(data, config) {
  const content = data.choices[0].message.content;
  
  // Try to parse JSON from response
  try {
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : content;
    const workflow = JSON.parse(jsonStr);
    
    // Add signature to all content
    const signature = config.twitter?.signature || `more at ${config.twitter?.handle}`;
    
    if (workflow.posts) {
      workflow.posts = workflow.posts.map(post => ({
        ...post,
        content: `${post.content}\n\n${post.hashtags?.join(' ') || ''}\n\n${signature}`
      }));
    }
    
    return workflow;
  } catch (error) {
    console.error('Failed to parse Grok response:', error.message);
    return generateMockContent(config, []);
  }
}

/**
 * Generates mock content based on project config
 */
function generateMockContent(config, trends) {
  const handle = config.twitter?.handle || '@project';
  const signature = config.twitter?.signature || `more at ${handle}`;
  const hashtags = config.twitter?.hashtags || ['#Tech', '#Innovation'];
  const topics = config.twitter?.topics || ['Technology'];
  
  const workflow = {
    posts: [
      {
        content: `The future of ${topics[0]} isn't just about innovation—it's about responsible development that benefits everyone.\n\n${hashtags[0]}\n\n${signature}`,
        hashtags: [hashtags[0]]
      },
      {
        content: `Coordination across stakeholders is the missing infrastructure for scaling ${topics[0] || 'technology'}.\n\n${hashtags.join(' ')}\n\n${signature}`,
        hashtags: hashtags.slice(0, 2)
      }
    ],
    replies: [
      {
        content: `This highlights why ${topics[0] || 'governance'} must exist before crisis, not improvised during one.\n\n${hashtags[0]}\n\n${signature}`,
        targetUrl: trends[0]?.url || 'https://x.com/example/status/123',
        targetHandle: trends[0]?.related_accounts?.[0] || '@example'
      }
    ],
    quotes: [
      {
        content: `Exactly. Legitimacy is infrastructure that enables coordination without centralization.\n\n${hashtags[0]}\n\n${signature}`,
        targetUrl: trends[0]?.url || 'https://x.com/example/status/123',
        targetHandle: trends[0]?.related_accounts?.[0] || '@example'
      }
    ],
    metadata: {
      generated_at: new Date().toISOString(),
      project: config.name,
      mock: !GROK_API_KEY
    }
  };
  
  console.log(`✅ Generated ${workflow.posts.length} posts, ${workflow.replies.length} replies, ${workflow.quotes.length} quotes`);
  
  return workflow;
}

/**
 * Saves workflow to file
 */
function saveResults(workflow, outputFile, config) {
  const output = {
    generated_at: new Date().toISOString(),
    project: config.name,
    ...workflow
  };
  
  fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));
  console.log(`💾 Saved to ${outputFile}`);
  
  return output;
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  
  const projectArg = args.find(a => a.startsWith('--project='));
  const trendsArg = args.find(a => a.startsWith('--trends='));
  const outputArg = args.find(a => a.startsWith('--output='));
  const mockArg = args.includes('--mock');
  
  if (!projectArg || !trendsArg) {
    console.error('Usage: node content-generator.js --project=name --trends=/path/to/trends.json [--output=file.json] [--mock]');
    process.exit(1);
  }
  
  const projectName = projectArg.split('=')[1];
  const trendsFile = trendsArg.split('=')[1];
  const outputFile = outputArg ? outputArg.split('=')[1] : `/tmp/x-growth-${projectName}-content.json`;
  
  try {
    const config = loadProject(projectName);
    const trends = JSON.parse(fs.readFileSync(trendsFile, 'utf8'));
    
    generateContent(config, trends.trends || trends, mockArg)
      .then(workflow => {
        saveResults(workflow, outputFile, config);
        
        console.log('\n📝 Generated Content Preview:');
        console.log(`   Posts: ${workflow.posts?.length || 0}`);
        console.log(`   Replies: ${workflow.replies?.length || 0}`);
        console.log(`   Quotes: ${workflow.quotes?.length || 0}`);
        
        if (workflow.posts?.[0]) {
          console.log('\n   First post:');
          console.log(`   "${workflow.posts[0].content.substring(0, 100)}..."`);
        }
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

module.exports = {
  generateContent,
  generateMockContent,
  buildSystemPrompt,
  buildUserPrompt
};
