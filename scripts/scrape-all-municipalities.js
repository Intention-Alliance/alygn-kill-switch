/**
 * Scrape all 82 Costa Rican municipalities for emails and X handles
 * Uses web_fetch for reliable scraping
 */

import { createClient } from '@supabase/supabase-js';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

// Supabase configuration
const SUPABASE_URL = 'https://uwusstfgikzeryvaruuk.supabase.co';
const SUPABASE_KEY = 'sb_secret_FJpLuHy0vrsDn1YLJ5QTbw_K0-YRCJY';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Ensure output directory exists
const OUTPUT_DIR = '$HOME/.openclaw/workspace/.firecrawl/muni-emails';
if (!existsSync(OUTPUT_DIR)) {
  mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Common contact page paths to try
const CONTACT_PATHS = [
  '/contactenos/directorio',
  '/contacto',
  '/contactenos',
  '/directorio',
  '/contacto/directorio',
  '/institucional/directorio',
  '/alcaldia',
  '/alcaldia/directorio',
  '/municipalidad/directorio',
  '/nosotros/directorio',
  '/equipo',
  '/organigrama',
  '/institucional',
  '/acerca-de'
];

/**
 * Extract emails from markdown content
 */
function extractEmails(content) {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const matches = content.match(emailRegex) || [];
  return [...new Set(matches)].filter(email => {
    const invalidPatterns = ['example.com', 'test.com', 'domain.com', 'email.com', 'yourdomain.com', 'gmail.com', 'yahoo.com', 'hotmail.com'];
    return !invalidPatterns.some(pattern => email.toLowerCase().includes(pattern));
  });
}

/**
 * Extract X/Twitter handle from content
 */
function extractXHandle(content) {
  const patterns = [
    /(?:twitter|x)\.com\/([a-zA-Z0-9_]+)/i,
    /@([a-zA-Z0-9_]{3,})/g,
    /(?:síguenos|follow us|siguenos)\s+@([a-zA-Z0-9_]+)/i
  ];
  
  for (const pattern of patterns) {
    const matches = content.match(pattern);
    if (matches) {
      for (const match of matches) {
        const handle = match.replace('@', '').toLowerCase();
        const invalid = ['http', 'www', 'png', 'jpg', 'css', 'js', 'php', 'html', 'go', 'cr', 'mun', 'info', 'contacto'];
        if (!invalid.some(i => handle.includes(i)) && handle.length > 3) {
          return `@${handle}`;
        }
      }
    }
  }
  return null;
}

/**
 * Categorize emails by type based on content context
 */
function categorizeEmails(content, emails) {
  const categorized = {
    mayor: null,
    planning: null,
    it: null,
    general: null,
    all: emails
  };

  const contentLower = content.toLowerCase();

  for (const email of emails) {
    const emailLower = email.toLowerCase();
    
    // Find context around email
    const emailIndex = contentLower.indexOf(emailLower);
    if (emailIndex === -1) continue;
    
    const contextStart = Math.max(0, emailIndex - 300);
    const contextEnd = Math.min(contentLower.length, emailIndex + 300);
    const context = contentLower.substring(contextStart, contextEnd);

    // Mayor patterns
    if (context.includes('alcalde') || 
        context.includes('alcaldesa') ||
        context.includes('alcaldía') ||
        context.includes('alcaldia') ||
        emailLower.includes('alcalde') ||
        emailLower.includes('alcaldia')) {
      if (!categorized.mayor) categorized.mayor = email;
    }
    // Planning patterns
    else if (context.includes('planificación') || 
             context.includes('planificacion') ||
             context.includes('urbanismo') ||
             context.includes('desarrollo urbano') ||
             context.includes('plan') ||
             context.includes('urbano') ||
             context.includes('catastro') ||
             context.includes('arquitectura') ||
             emailLower.includes('planificacion') ||
             emailLower.includes('urbano') ||
             emailLower.includes('catastro')) {
      if (!categorized.planning) categorized.planning = email;
    }
    // IT patterns
    else if (context.includes('tecnología') || 
             context.includes('tecnologia') ||
             context.includes('sistemas') ||
             context.includes('informática') ||
             context.includes('informatica') ||
             context.includes('digital') ||
             context.includes('ti') ||
             context.includes('informática') ||
             emailLower.includes('sistemas') ||
             emailLower.includes('tecnologia') ||
             emailLower.includes('informatica') ||
             emailLower.includes('info')) {
      if (!categorized.it) categorized.it = email;
    }
    // General contact
    else if (context.includes('contacto') || 
             context.includes('información') ||
             context.includes('informacion') ||
             context.includes('atención') ||
             context.includes('atencion') ||
             context.includes('municipalidad') ||
             context.includes('central') ||
             emailLower.includes('info') ||
             emailLower.includes('contacto') ||
             emailLower.includes('muni')) {
      if (!categorized.general) categorized.general = email;
    }
  }

  // If no specific categorization, use first email as general
  if (!categorized.general && emails.length > 0) {
    categorized.general = emails[0];
  }

  return categorized;
}

/**
 * Fetch a URL using web_fetch tool
 */
async function fetchUrl(url) {
  try {
    // This will be called via the web_fetch tool
    return { success: false, error: 'Use web_fetch tool directly' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Scrape a single municipality
 */
async function scrapeMunicipality(muni) {
  console.log(`\n🏛️  ${muni.name} (${muni.province})`);
  console.log(`   Website: ${muni.website_url}`);
  
  const result = {
    name: muni.name,
    province: muni.province,
    website: muni.website_url,
    mayor_email: null,
    planning_email: null,
    it_email: null,
    general_email: null,
    x_handle: null,
    contact_page_url: null,
    scraped_at: new Date().toISOString(),
    status: 'pending',
    notes: []
  };

  // Try main website first
  const mainUrl = muni.website_url;
  
  // Try contact page variations
  const baseDomain = mainUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  
  for (const path of CONTACT_PATHS) {
    const contactUrl = `https://${baseDomain}${path}`;
    console.log(`   Trying: ${contactUrl}`);
    
    // Note: Actual scraping will be done via web_fetch tool
    // This script prepares the URLs to scrape
    result.contact_page_url = contactUrl;
    break; // For now, just use first path
  }

  return result;
}

/**
 * Main execution - generates list of URLs to scrape
 */
async function main() {
  console.log('🚀 Generating Municipality Scraping List\n');
  console.log('=' .repeat(60));
  
  // Get all municipalities from Supabase
  const { data: municipalities, error } = await supabase
    .from('municipalities')
    .select('name, province, website_url, mayor_email, general_email')
    .order('province', { ascending: true })
    .order('name', { ascending: true });
  
  if (error) {
    console.error('❌ Failed to fetch municipalities:', error.message);
    return;
  }
  
  console.log(`📊 Found ${municipalities.length} municipalities\n`);
  
  // Generate scraping tasks
  const scrapingTasks = [];
  
  for (const muni of municipalities) {
    const baseDomain = muni.website_url?.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    if (!baseDomain) continue;
    
    // Primary contact page
    const contactUrl = `https://${baseDomain}/contactenos/directorio`;
    
    scrapingTasks.push({
      name: muni.name,
      province: muni.province,
      website: muni.website_url,
      scrapeUrl: contactUrl,
      fallbackUrls: [
        `https://${baseDomain}/contacto`,
        `https://${baseDomain}/directorio`,
        muni.website_url
      ]
    });
  }
  
  // Save tasks to file
  const tasksFile = join(OUTPUT_DIR, 'scraping-tasks.json');
  writeFileSync(tasksFile, JSON.stringify(scrapingTasks, null, 2));
  
  console.log(`💾 Generated ${scrapingTasks.length} scraping tasks`);
  console.log(`📁 Saved to: ${tasksFile}\n`);
  
  // Print first 10 as examples
  console.log('📋 First 10 municipalities to scrape:');
  scrapingTasks.slice(0, 10).forEach((task, i) => {
    console.log(`   ${i + 1}. ${task.name} - ${task.scrapeUrl}`);
  });
  
  console.log('\n✨ Task list generated!');
  console.log('\nNext step: Use web_fetch to scrape each URL');
}

main().catch(console.error);
