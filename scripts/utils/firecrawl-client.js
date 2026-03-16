/**
 * Firecrawl Client - Web Scraping API
 * 
 * Provides a unified interface for Firecrawl web scraping.
 * Loads credentials from config/credentials.json or environment variables.
 * 
 * Usage:
 *   import firecrawl from "../utils/firecrawl-client.js";
 *   const result = await firecrawl.scrape('https://example.com');
 */

import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load credentials
let apiKey;

try {
  const credentials = JSON.parse(fs.readFileSync(path.join(__dirname, '../../config/credentials.json'), 'utf8'));
  apiKey = credentials.firecrawl?.apiKey || process.env.FIRECRAWL_API_KEY;
} catch (error) {
  // Fallback to environment variables
  apiKey = process.env.FIRECRAWL_API_KEY;
}

// Validate credentials
if (!apiKey) {
  console.error('❌ Firecrawl API key not found');
  console.error('Set FIRECRAWL_API_KEY in environment or config/credentials.json');
  process.exit(1);
}

const BASE_URL = 'https://api.firecrawl.dev/v1';

/**
 * Scrape a single URL
 * @param {string} url - URL to scrape
 * @param {Object} options - Scrape options
 * @returns {Promise<Object>} Scrape result
 */
async function scrape(url, options = {}) {
  const {
    formats = ['markdown'],
    onlyMainContent = true,
    waitFor = 0,
    timeout = 30000
  } = options;
  
  try {
    const response = await fetch(`${BASE_URL}/scrape`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        url,
        formats,
        onlyMainContent,
        waitFor,
        timeout
      })
    });
    
    if (!response.ok) {
      throw new Error(`Firecrawl API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Firecrawl scrape failed');
    }
    
    return {
      success: true,
      url: data.metadata?.sourceURL || url,
      title: data.metadata?.title,
      description: data.metadata?.description,
      content: data.markdown || data.html || data.content,
      metadata: data.metadata
    };
    
  } catch (error) {
    console.error(`❌ Firecrawl scrape failed for ${url}:`, error.message);
    return {
      success: false,
      error: error.message,
      url
    };
  }
}

/**
 * Crawl multiple URLs from a starting point
 * @param {string} url - Starting URL
 * @param {Object} options - Crawl options
 * @returns {Promise<Object>} Crawl result with job ID for polling
 */
async function crawl(url, options = {}) {
  const {
    limit = 10,
    scrapeOptions = {},
    maxDepth = 2
  } = options;
  
  try {
    const response = await fetch(`${BASE_URL}/crawl`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        url,
        limit,
        scrapeOptions,
        maxDepth
      })
    });
    
    if (!response.ok) {
      throw new Error(`Firecrawl API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Firecrawl crawl failed');
    }
    
    return {
      success: true,
      jobId: data.id,
      status: data.status
    };
    
  } catch (error) {
    console.error(`❌ Firecrawl crawl failed for ${url}:`, error.message);
    return {
      success: false,
      error: error.message,
      url
    };
  }
}

/**
 * Check crawl job status
 * @param {string} jobId - Job ID from crawl()
 * @returns {Promise<Object>} Job status and results
 */
async function checkCrawlStatus(jobId) {
  try {
    const response = await fetch(`${BASE_URL}/crawl/${jobId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`Firecrawl API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    return {
      success: data.status === 'completed',
      status: data.status,
      progress: data.progress,
      data: data.data,
      error: data.error
    };
    
  } catch (error) {
    console.error(`❌ Firecrawl status check failed for job ${jobId}:`, error.message);
    return {
      success: false,
      error: error.message,
      jobId
    };
  }
}

/**
 * Search and scrape (map mode)
 * @param {string} query - Search query
 * @param {Object} options - Search options
 * @returns {Promise<Object>} Search results
 */
async function search(query, options = {}) {
  const {
    limit = 10,
    lang = 'en',
    country = 'us'
  } = options;
  
  try {
    const response = await fetch(`${BASE_URL}/search`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query,
        limit,
        lang,
        country
      })
    });
    
    if (!response.ok) {
      throw new Error(`Firecrawl API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Firecrawl search failed');
    }
    
    return {
      success: true,
      results: data.data
    };
    
  } catch (error) {
    console.error(`❌ Firecrawl search failed for "${query}":`, error.message);
    return {
      success: false,
      error: error.message,
      query
    };
  }
}

/**
 * Test Firecrawl connection
 * @returns {Promise<boolean>} Connection status
 */
async function testConnection() {
  try {
    const result = await scrape('https://example.com', { timeout: 10000 });
    if (result.success) {
      console.log('✅ Firecrawl connection successful');
      return true;
    } else {
      console.error('❌ Firecrawl connection failed:', result.error);
      return false;
    }
  } catch (error) {
    console.error('❌ Firecrawl connection failed:', error.message);
    return false;
  }
}

export {
  scrape,
  crawl,
  checkCrawlStatus,
  search,
  testConnection,
  config: {
    apiKey: apiKey ? apiKey.substring(0, 8) + '...' : null
  }
};
