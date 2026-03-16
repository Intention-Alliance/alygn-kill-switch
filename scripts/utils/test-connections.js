/**
 * Test All API Connections
 * 
 * Quick connectivity test for all configured APIs
 * 
 * Usage: node test-connections.js
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getClient, retrievePage } from '../shared/notion-client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load credentials
let credentials;
try {
  credentials = JSON.parse(fs.readFileSync(path.join(__dirname, '../../config/credentials.json'), 'utf8'));
  console.log('✅ Credentials loaded from config/credentials.json\n');
} catch (error) {
  console.error('❌ Failed to load credentials:', error.message);
  process.exit(1);
}

// Test results
const results = {
  passed: 0,
  failed: 0,
  skipped: 0
};

// Color codes
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const NC = '\x1b[0m'; // No Color

function pass(name) {
  console.log(`${GREEN}✅ PASS${NC}: ${name}`);
  results.passed++;
}

function fail(name, reason) {
  console.log(`${RED}❌ FAIL${NC}: ${name} - ${reason}`);
  results.failed++;
}

function skip(name, reason) {
  console.log(`${YELLOW}⏭️  SKIP${NC}: ${name} - ${reason}`);
  results.skipped++;
}

// Test 1: Supabase
async function testSupabase() {
  try {
    import { createClient } from "@supabase/supabase-js";
    const supabase = createClient(credentials.supabase.url, credentials.supabase.key || credentials.supabase.serviceKey);
    
    const { data, error } = await supabase.from('municipalities').select('id').limit(1);
    
    if (error) throw error;
    pass('Supabase');
  } catch (error) {
    fail('Supabase', error.message);
  }
}

// Test 2: Firecrawl
async function testFirecrawl() {
  try {
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${credentials.firecrawl.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        url: 'https://example.com',
        formats: ['markdown']
      })
    });
    
    const data = await response.json();
    if (data.success) {
      pass('Firecrawl');
    } else {
      fail('Firecrawl', data.error || 'Unknown error');
    }
  } catch (error) {
    fail('Firecrawl', error.message);
  }
}

// Test 3: ZeroBounce
async function testZeroBounce() {
  try {
    const response = await fetch(`https://api.zerobounce.net/v2/getcredits?api_key=${credentials.zerobounce.apiKey}`);
    const data = await response.json();
    
    if (data.Credits !== undefined) {
      pass(`ZeroBounce (${data.Credits} credits)`);
    } else {
      fail('ZeroBounce', data.Error || 'Unknown error');
    }
  } catch (error) {
    fail('ZeroBounce', error.message);
  }
}

// Test 4: Perplexity (via OpenRouter)
async function testPerplexity() {
  try {
    // Perplexity Sonar via OpenRouter
    const openrouterKey = credentials.openrouter?.apiKey || credentials.perplexity.apiKey;
    const baseUrl = credentials.openrouter?.baseUrl || 'https://openrouter.ai/api/v1';
    
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openrouterKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'perplexity/sonar-pro',
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 10
      })
    });
    
    const data = await response.json();
    if (data.choices) {
      pass('Perplexity (via OpenRouter)');
    } else {
      fail('Perplexity', data.error?.message || 'Unknown error');
    }
  } catch (error) {
    fail('Perplexity', error.message);
  }
}

// Test 5: Brave
async function testBrave() {
  try {
    const response = await fetch('https://api.search.brave.com/res/v1/web/search?q=test&count=1', {
      headers: {
        'X-Subscription-Token': credentials.brave.apiKey
      }
    });
    
    const data = await response.json();
    if (data.web) {
      pass('Brave');
    } else {
      fail('Brave', 'No results or error');
    }
  } catch (error) {
    fail('Brave', error.message);
  }
}

// Test 6: Grok (xAI)
async function testGrok() {
  try {
    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${credentials.grok.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: credentials.grok.model || 'grok-3',
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 10
      })
    });
    
    const data = await response.json();
    if (data.choices) {
      pass('Grok (xAI)');
    } else {
      fail('Grok (xAI)', data.error?.message || 'Unknown error');
    }
  } catch (error) {
    fail('Grok (xAI)', error.message);
  }
}

// Test 7: Ollama (LLM Router)
async function testOllama() {
  try {
    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'qwen3.5:cloud',
        prompt: 'Say OK',
        stream: false,
        max_tokens: 10
      })
    });
    
    const data = await response.json();
    if (data.response && data.response.toLowerCase().includes('ok')) {
      pass('Ollama (qwen3.5:cloud)');
    } else {
      fail('Ollama', 'Unexpected response or error');
    }
  } catch (error) {
    fail('Ollama', error.message);
  }
}

// Test 8: X API (Twitter)
async function testXAPI() {
  try {
    import OAuth from "oauth-1.0a";
    import crypto from "crypto";
    
    const oauth = OAuth({
      consumer: {
        key: credentials.twitter.consumerKey,
        secret: credentials.twitter.consumerSecret
      },
      signature_method: 'HMAC-SHA1',
      hash_function: (baseString, key) => 
        crypto.createHmac('sha1', key).update(baseString).digest('base64')
    });
    
    const token = {
      key: credentials.twitter.accessToken,
      secret: credentials.twitter.accessTokenSecret
    };
    
    const url = 'https://api.twitter.com/2/users/me';
    const headers = oauth.toHeader(oauth.authorize({ url, method: 'GET' }, token));
    
    const response = await fetch(url, { headers });
    const data = await response.json();
    
    if (data.data) {
      pass(`X API (@${data.data.username})`);
    } else {
      fail('X API', data.errors?.[0]?.message || 'Unknown error');
    }
  } catch (error) {
    fail('X API', error.message);
  }
}

// Test 9: Notion
async function testNotion() {
  try {
    const notion = getClient(credentials.notion.apiKey);
    const data = await retrievePage(notion, credentials.notion.pages.alygn_tracker);
    if (data.object === 'page') {
      pass('Notion');
    } else {
      fail('Notion', 'Unexpected response');
    }
  } catch (error) {
    fail('Notion', error.message);
  }
}

// Test 10: Smartlead
async function testSmartlead() {
  try {
    if (!credentials.smartlead?.apiKey) {
      skip('Smartlead', 'API key not configured yet');
      return;
    }
    
    const response = await fetch(`https://server.smartlead.ai/api/v1/campaigns?api_key=${credentials.smartlead.apiKey}`);
    const data = await response.json();
    
    if (Array.isArray(data) || data.data) {
      pass('Smartlead');
    } else {
      fail('Smartlead', data.message || 'Unknown error');
    }
  } catch (error) {
    fail('Smartlead', error.message);
  }
}

// Main
async function main() {
  console.log('🧪 Testing API Connections...\n');
  console.log('=' .repeat(50));
  
  // Run all tests
  await testSupabase();
  await testFirecrawl();
  await testZeroBounce();
  await testPerplexity();
  await testBrave();
  await testGrok();
  await testOllama();
  await testXAPI();
  await testNotion();
  await testSmartlead();
  
  // Summary
  console.log('=' .repeat(50));
  console.log(`\n📊 Results:`);
  console.log(`   ${GREEN}✅ Passed:${NC}  ${results.passed}`);
  console.log(`   ${RED}❌ Failed:${NC}  ${results.failed}`);
  console.log(`   ${YELLOW}⏭️  Skipped:${NC} ${results.skipped}`);
  console.log(`   Total: ${results.passed + results.failed + results.skipped}\n`);
  
  if (results.failed > 0) {
    console.log('⚠️  Some APIs failed. Check credentials and try again.\n');
    process.exit(1);
  } else {
    console.log('🎉 All APIs connected successfully!\n');
    process.exit(0);
  }
}

// Run
main().catch(error => {
  console.error('❌ Fatal error:', error.message);
  process.exit(1);
});
