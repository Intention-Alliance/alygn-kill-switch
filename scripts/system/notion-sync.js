#!/usr/bin/env node
/**
 * ALYGN Notion Sync Check
 * 
 * Verifies Notion database integrity and sync status
 * Runs every 3 hours (8 AM - 8 PM CST)
 */

const https = require('https');
const { getNotionKey, getNotionPage } = require('../shared/load-credentials');

const NOTION_KEY = getNotionKey();
const NOTION_VERSION = '2022-06-28';
const CENTRAL_HUB_ID = getNotionPage('intention_alliance_hub');

function notionRequest(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.notion.com',
      port: 443,
      path,
      method,
      headers: {
        'Authorization': `Bearer ${NOTION_KEY}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json'
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`Notion API error: ${res.statusCode} - ${data}`));
        }
      });
    });
    
    req.on('error', reject);
    
    if (body) {
      req.write(JSON.stringify(body));
    }
    
    req.end();
  });
}

async function checkNotionSync() {
  console.log('📚 ALYGN Notion Sync Check');
  console.log('');
  
  try {
    // Check Central Hub access
    console.log('🔍 Checking Central Hub access...');
    const page = await notionRequest(`/v1/pages/${CENTRAL_HUB_ID}`);
    console.log(`   ✅ Central Hub accessible: "${page.properties?.title?.title?.[0]?.plain_text || 'Intention Alliance - Central Hub'}"`);
    
    // Search for recent pages
    console.log('');
    console.log('🔍 Checking recent activity...');
    const search = await notionRequest('/v1/search', 'POST', {
      filter: { property: 'object', value: 'page' },
      sort: { direction: 'descending', timestamp: 'last_edited_time' },
      page_size: 5
    });
    
    console.log(`   ✅ Found ${search.results.length} recently edited pages`);
    
    if (search.results.length > 0) {
      console.log('');
      console.log('   Recent pages:');
      search.results.forEach((page, i) => {
        const title = page.properties?.title?.title?.[0]?.plain_text || 'Untitled';
        const edited = new Date(page.last_edited_time).toLocaleString('en-US', { timeZone: 'America/Costa_Rica' });
        console.log(`   ${i + 1}. ${title} (edited: ${edited})`);
      });
    }
    
    console.log('');
    console.log('✅ Notion sync healthy - all systems operational');
    
  } catch (error) {
    console.error('');
    console.error('❌ Notion sync check failed:', error.message);
    console.error('');
    console.error('🔧 Possible issues:');
    console.error('   - API key expired or invalid');
    console.error('   - Network connectivity problem');
    console.error('   - Notion API rate limit reached');
    console.error('');
    console.error('💡 Action required: Check Notion API configuration');
    process.exit(1);
  }
}

// Main execution
checkNotionSync();
