/**
 * LLM Router - Model Tier Routing
 * 
 * Routes prompts to appropriate model tier based on task complexity.
 * Uses Ollama qwen3.5:cloud for all tasks (as per project decision).
 * 
 * Usage:
 *   const llm = require('../utils/llm-router');
 *   
 *   // Bulk task (parsing, templates)
 *   const result = await llm.complete('bulk', 'Parse this JSON...');
 *   
 *   // Reasoning task (research, classify)
 *   const result = await llm.complete('reason', 'Analyze this data...');
 *   
 *   // Heavy task (complex personalization)
 *   const result = await llm.complete('heavy', 'Generate personalized email...');
 */

const path = require('path');

// Model configuration (all use qwen3.5:cloud as per project decision)
// Note: qwen3.5:cloud for text, qwen3.5:397b-cloud for vision+text
const MODELS = {
  bulk: 'qwen3.5:cloud',          // Fast - parsing, templates
  reason: 'qwen3.5:cloud',        // Balanced - research, classify
  heavy: 'qwen3.5:397b-cloud'     // Full capabilities - complex personalization
};

// Load credentials (for future Anthropic support if needed)
let anthropicApiKey;

try {
  const credentials = require(path.join(__dirname, '../../config/credentials.json'));
  anthropicApiKey = credentials.anthropic?.apiKey || process.env.ANTHROPIC_API_KEY;
} catch (error) {
  anthropicApiKey = process.env.ANTHROPIC_API_KEY;
}

/**
 * Complete a prompt using specified tier
 * @param {string} tier - Model tier: 'bulk', 'reason', or 'heavy'
 * @param {string} prompt - Prompt text
 * @param {Object} options - Generation options
 * @returns {Promise<string>} Generated text
 */
async function complete(tier, prompt, options = {}) {
  const {
    maxTokens = 1000,
    temperature = 0.7,
    systemPrompt
  } = options;
  
  const model = MODELS[tier];
  
  if (!model) {
    throw new Error(`Unknown tier: ${tier}. Use 'bulk', 'reason', or 'heavy'`);
  }
  
  console.log(`🤖 LLM Router: Using ${tier} tier (${model})`);
  
  // Use Ollama via fetch (assuming Ollama server is running)
  try {
    const response = await fetch('http://127.0.0.1:11435/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model,
        prompt: prompt,
        system: systemPrompt || '',
        stream: false,
        options: {
          temperature,
          num_predict: maxTokens
        }
      })
    });
    
    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.response || data.text || '';
    
  } catch (error) {
    console.error('❌ Ollama request failed:', error.message);
    
    // Fallback: try direct model call if available
    throw new Error(`LLM completion failed: ${error.message}`);
  }
}

/**
 * Chat completion (multi-turn)
 * @param {string} tier - Model tier
 * @param {Array} messages - Message history [{role, content}]
 * @param {Object} options - Generation options
 * @returns {Promise<string>} Generated response
 */
async function chat(tier, messages, options = {}) {
  const {
    maxTokens = 1000,
    temperature = 0.7
  } = options;
  
  const model = MODELS[tier];
  
  console.log(`🤖 LLM Router: Using ${tier} tier (${model}) for chat`);
  
  try {
    const response = await fetch('http://127.0.0.1:11435/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        stream: false,
        options: {
          temperature,
          num_predict: maxTokens
        }
      })
    });
    
    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.message?.content || '';
    
  } catch (error) {
    console.error('❌ Ollama chat failed:', error.message);
    throw new Error(`LLM chat failed: ${error.message}`);
  }
}

/**
 * Parse JSON from LLM response
 * @param {string} tier - Model tier
 * @param {string} prompt - Prompt requesting JSON
 * @returns {Promise<Object>} Parsed JSON
 */
async function parseJSON(tier, prompt) {
  const response = await complete(tier, prompt);
  
  try {
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }
    
    const jsonStr = jsonMatch[0];
    return JSON.parse(jsonStr);
    
  } catch (error) {
    console.error('❌ Failed to parse JSON from LLM response:', error.message);
    console.error('Response was:', response.substring(0, 500));
    throw new Error(`JSON parsing failed: ${error.message}`);
  }
}

/**
 * Classify text into categories
 * @param {string} tier - Model tier (usually 'reason')
 * @param {string} text - Text to classify
 * @param {Array} categories - Possible categories
 * @returns {Promise<string>} Selected category
 */
async function classify(tier, text, categories) {
  const prompt = `Classify the following text into one of these categories: ${categories.join(', ')}

Text: ${text}

Respond with ONLY the category name, nothing else.`;
  
  const response = await complete(tier, prompt, { maxTokens: 50 });
  return response.trim();
}

/**
 * Extract structured data from text
 * @param {string} tier - Model tier
 * @param {string} text - Text to extract from
 * @param {Object} schema - Expected schema { fieldName: 'description' }
 * @returns {Promise<Object>} Extracted data
 */
async function extract(tier, text, schema) {
  const schemaDesc = Object.entries(schema)
    .map(([field, desc]) => `  - ${field}: ${desc}`)
    .join('\n');
  
  const prompt = `Extract the following information from the text below:

${schemaDesc}

Text:
${text}

Respond with valid JSON matching the schema above.`;
  
  return await parseJSON(tier, prompt);
}

/**
 * Test LLM connection
 * @returns {Promise<boolean>} Connection status
 */
async function testConnection() {
  try {
    const response = await complete('bulk', 'Say "OK" if you can read this.', { maxTokens: 10 });
    if (response.toLowerCase().includes('ok')) {
      console.log('✅ LLM connection successful (Ollama)');
      return true;
    } else {
      console.error('❌ LLM connection failed: unexpected response');
      return false;
    }
  } catch (error) {
    console.error('❌ LLM connection failed:', error.message);
    return false;
  }
}

/**
 * Get model info for a tier
 * @param {string} tier - Model tier
 * @returns {Object} Model info
 */
function getModelInfo(tier) {
  return {
    tier,
    model: MODELS[tier],
    description: tier === 'bulk' ? 'Fast, cheap - parsing, templates' :
                 tier === 'reason' ? 'Balanced - research, classify' :
                 'Full capabilities - complex personalization'
  };
}

module.exports = {
  complete,
  chat,
  parseJSON,
  classify,
  extract,
  testConnection,
  getModelInfo,
  MODELS
};
