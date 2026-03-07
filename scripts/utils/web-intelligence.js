/**
 * Web Intelligence - Unified Search & Scraping with Fallbacks
 * 
 * Provides a unified interface for web research with automatic fallbacks:
 * - Primary: Perplexity Sonar Pro (via OpenRouter)
 * - Fallback 1: OpenClaw web_search tool (Brave API)
 * 
 * - Primary: Firecrawl API
 * - Fallback 2: OpenClaw web_fetch tool
 * 
 * Usage:
 *   const web = require('../utils/web-intelligence');
 *   
 *   // Search
 *   const results = await web.search('municipalities Costa Rica');
 *   
 *   // Scrape
 *   const content = await web.scrape('https://example.com');
 */

const path = require('path');
const { execSync } = require('child_process');

// Load credentials
let credentials;
try {
  credentials = require(path.join(__dirname, '../../config/credentials.json'));
} catch (error) {
  console.error('⚠️  Failed to load credentials:', error.message);
}

/**
 * Search the web with fallback
 * @param {string} query - Search query
 * @param {Object} options - Search options
 * @returns {Promise<Object>} Search results
 */
async function search(query, options = {}) {
  const {
    count = 5,
    freshness = 'py',
    useFallback = true
  } = options;
  
  console.log(`🔍 Searching: "${query}"`);
  
  // Try Perplexity via OpenRouter first
  try {
    const perplexityKey = credentials?.perplexity?.apiKey || credentials?.openrouter?.apiKey;
    const baseUrl = credentials?.openrouter?.baseUrl || 'https://openrouter.ai/api/v1';
    
    if (perplexityKey) {
      console.log('   → Using Perplexity Sonar Pro (via OpenRouter)');
      
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${perplexityKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://alygn.org',
          'X-Title': 'Alygn Municipal Outreach'
        },
        body: JSON.stringify({
          model: 'perplexity/sonar-pro',
          messages: [{ 
            role: 'user', 
            content: `Search for: ${query}. Provide concise, factual results with sources.` 
          }],
          max_tokens: 2000
        })
      });
      
      const data = await response.json();
      
      if (data.choices && data.choices[0]?.message?.content) {
        console.log('   ✅ Perplexity success');
        return {
          success: true,
          source: 'perplexity',
          content: data.choices[0].message.content,
          citations: data.citations || []
        };
      } else {
        throw new Error(data.error?.message || 'No results from Perplexity');
      }
    }
  } catch (error) {
    console.log(`   ⚠️  Perplexity failed: ${error.message}`);
    
    if (!useFallback) {
      throw error;
    }
  }
  
  // Fallback 1: OpenClaw web_search tool (Brave API)
  try {
    console.log('   → Fallback 1: OpenClaw web_search (Brave API)');
    
    const result = execSync(`openclaw run web_search --query="${query.replace(/"/g, '\\"')}" --count=${count}`, {
      encoding: 'utf8',
      timeout: 30000
    });
    
    const parsed = JSON.parse(result);
    
    console.log('   ✅ web_search success');
    return {
      success: true,
      source: 'web_search',
      content: parsed.content || parsed.answer,
      citations: parsed.citations || []
    };
    
  } catch (error) {
    console.log(`   ⚠️  web_search failed: ${error.message}`);
  }
  
  // All methods failed
  console.error('   ❌ All search methods failed');
  return {
    success: false,
    error: 'All search methods failed',
    source: 'none'
  };
}

/**
 * Scrape a URL with fallback
 * @param {string} url - URL to scrape
 * @param {Object} options - Scrape options
 * @returns {Promise<Object>} Scraped content
 */
async function scrape(url, options = {}) {
  const {
    formats = ['markdown'],
    useFallback = true
  } = options;
  
  console.log(`📄 Scraping: ${url}`);
  
  // Try Firecrawl first
  try {
    const firecrawlKey = credentials?.firecrawl?.apiKey;
    
    if (firecrawlKey) {
      console.log('   → Using Firecrawl API');
      
      const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${firecrawlKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          url,
          formats: ['markdown']
        })
      });
      
      const data = await response.json();
      
      if (data.success && data.markdown) {
        console.log('   ✅ Firecrawl success');
        return {
          success: true,
          source: 'firecrawl',
          content: data.markdown,
          metadata: data.metadata
        };
      } else {
        throw new Error(data.error || 'Firecrawl failed');
      }
    }
  } catch (error) {
    console.log(`   ⚠️  Firecrawl failed: ${error.message}`);
    
    if (!useFallback) {
      throw error;
    }
  }
  
  // Fallback 2: OpenClaw web_fetch tool
  try {
    console.log('   → Fallback 2: OpenClaw web_fetch');
    
    const result = execSync(`openclaw run web_fetch --url="${url}" --extractMode=markdown`, {
      encoding: 'utf8',
      timeout: 30000
    });
    
    const parsed = JSON.parse(result);
    
    console.log('   ✅ web_fetch success');
    return {
      success: true,
      source: 'web_fetch',
      content: parsed.text || parsed.content,
      metadata: {
        title: parsed.title,
        url: parsed.url
      }
    };
    
  } catch (error) {
    console.log(`   ⚠️  web_fetch failed: ${error.message}`);
  }
  
  // All methods failed
  console.error('   ❌ All scrape methods failed');
  return {
    success: false,
    error: 'All scrape methods failed',
    source: 'none'
  };
}

/**
 * Deep research with multiple sources
 * @param {string} query - Research query
 * @param {Object} options - Research options
 * @returns {Promise<Object>} Research results
 */
async function research(query, options = {}) {
  const {
    maxSources = 3,
    useFallback = true
  } = options;
  
  console.log(`🔬 Researching: "${query}"`);
  
  const results = [];
  
  // Search from multiple sources
  try {
    const perplexityResult = await search(query, { useFallback: false });
    if (perplexityResult.success) {
      results.push(perplexityResult);
    }
  } catch (error) {
    // Ignore, will use fallback
  }
  
  // If Perplexity failed, use web_search
  if (results.length === 0 && useFallback) {
    try {
      const searchResult = await search(query, { useFallback: true });
      if (searchResult.success) {
        results.push(searchResult);
      }
    } catch (error) {
      // Ignore
    }
  }
  
  // Scrape top sources
  const scrapePromises = [];
  for (let i = 0; i < Math.min(maxSources, results.length); i++) {
    const citation = results[i].citations?.[i];
    if (citation?.url) {
      scrapePromises.push(
        scrape(citation.url, { useFallback })
          .then(result => ({ url: citation.url, content: result }))
          .catch(() => null)
      );
    }
  }
  
  const scraped = await Promise.all(scrapePromises);
  
  return {
    success: results.length > 0,
    searchResults: results,
    scrapedContent: scraped.filter(r => r?.content?.success),
    summary: results.map(r => r.content).join('\n\n')
  };
}

/**
 * Test all methods
 * @returns {Promise<Object>} Test results
 */
async function testAll() {
  console.log('🧪 Testing Web Intelligence...\n');
  
  const results = {
    perplexity: false,
    web_search: false,
    firecrawl: false,
    web_fetch: false
  };
  
  // Test Perplexity
  try {
    const result = await search('test query', { useFallback: false });
    results.perplexity = result.success;
  } catch (error) {
    results.perplexity = false;
  }
  
  // Test web_search
  try {
    const result = await search('test query', { useFallback: true });
    results.web_search = result.source === 'web_search';
  } catch (error) {
    results.web_search = false;
  }
  
  // Test Firecrawl
  try {
    const result = await scrape('https://example.com', { useFallback: false });
    results.firecrawl = result.success;
  } catch (error) {
    results.firecrawl = false;
  }
  
  // Test web_fetch
  try {
    const result = await scrape('https://example.com', { useFallback: true });
    results.web_fetch = result.source === 'web_fetch';
  } catch (error) {
    results.web_fetch = false;
  }
  
  return results;
}

module.exports = {
  search,
  scrape,
  research,
  testAll
};
