/**
 * Scrape Municipality Emails and X Handles
 * Uses Firecrawl to scrape all 82 Costa Rican canton websites
 * Extracts: mayor email, planning email, IT email, general email, X handle
 */

import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
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
  '/contacto',
  '/contactenos',
  '/contactenos/directorio',
  '/directorio',
  '/contacto/directorio',
  '/institucional/directorio',
  '/alcaldia',
  '/alcaldia/directorio',
  '/municipalidad/directorio',
  '/nosotros/directorio',
  '/equipo',
  '/organigrama'
];

/**
 * Scrape a URL using Firecrawl CLI
 */
async function scrapeWithFirecrawl(url, outputFile) {
  try {
    const cmd = `firecrawl scrape "${url}" --format markdown -o "${outputFile}" 2>&1`;
    const result = execSync(cmd, { encoding: 'utf-8', timeout: 60000 });
    return { success: true, output: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Extract emails from markdown content
 */
function extractEmails(content) {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const matches = content.match(emailRegex) || [];
  return [...new Set(matches)].filter(email => {
    // Filter out common false positives
    const invalidPatterns = ['example.com', 'test.com', 'domain.com', 'email.com', 'yourdomain.com'];
    return !invalidPatterns.some(pattern => email.toLowerCase().includes(pattern));
  });
}

/**
 * Extract X/Twitter handle from content
 */
function extractXHandle(content) {
  // Look for X/Twitter handles
  const patterns = [
    /(?:twitter|x)\.com\/([a-zA-Z0-9_]+)/i,
    /@([a-zA-Z0-9_]+)\s*(?:on\s+)?(?:twitter|x)/i,
    /(?:twitter|x):?\s*@?([a-zA-Z0-9_]+)/i,
    /(?:síguenos|follow us)\s+@([a-zA-Z0-9_]+)/i
  ];
  
  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match && match[1] && match[1].length > 2) {
      // Filter out common false positives
      const handle = match[1].toLowerCase();
      const invalid = ['http', 'www', 'png', 'jpg', 'css', 'js', 'php', 'html'];
      if (!invalid.some(i => handle.includes(i))) {
        return `@${match[1]}`;
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
    
    // Look for context around the email (200 chars before and after)
    const emailIndex = contentLower.indexOf(emailLower);
    if (emailIndex === -1) continue;
    
    const contextStart = Math.max(0, emailIndex - 200);
    const contextEnd = Math.min(contentLower.length, emailIndex + 200);
    const context = contentLower.substring(contextStart, contextEnd);

    // Mayor/Alcalde patterns
    if (context.includes('alcalde') || 
        context.includes('alcaldesa') ||
        context.includes('alcalde municipal') ||
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
             emailLower.includes('planificacion') ||
             emailLower.includes('planifi')) {
      if (!categorized.planning) categorized.planning = email;
    }
    
    // IT/Tech patterns
    else if (context.includes('tecnología') || 
             context.includes('tecnologia') ||
             context.includes('sistemas') ||
             context.includes('informática') ||
             context.includes('informatica') ||
             context.includes('digital') ||
             context.includes('ti') ||
             emailLower.includes('sistemas') ||
             emailLower.includes('tecnologia') ||
             emailLower.includes('informatica')) {
      if (!categorized.it) categorized.it = email;
    }
    
    // General contact
    else if (context.includes('contacto') || 
             context.includes('información') ||
             context.includes('informacion') ||
             context.includes('atención') ||
             context.includes('atencion') ||
             context.includes('municipalidad') ||
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
 * Try to find and scrape contact page
 */
async function scrapeContactPage(baseUrl, municipalityName) {
  const baseDomain = baseUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  
  for (const path of CONTACT_PATHS) {
    const contactUrl = `https://${baseDomain}${path}`;
    const outputFile = join(OUTPUT_DIR, `${municipalityName.replace(/\s+/g, '-').toLowerCase()}-contact-${path.replace(/\//g, '-')}.md`);
    
    console.log(`  Trying: ${contactUrl}`);
    const result = await scrapeWithFirecrawl(contactUrl, outputFile);
    
    if (result.success && existsSync(outputFile)) {
      const content = readFileSync(outputFile, 'utf-8');
      if (content.length > 500) { // Valid content found
        console.log(`  ✅ Found contact page: ${contactUrl}`);
        return { success: true, content, url: contactUrl };
      }
    }
  }
  
  return { success: false };
}

/**
 * Scrape a single municipality
 */
async function scrapeMunicipality(muni) {
  console.log(`\n🏛️  Scraping: ${muni.name} (${muni.province})`);
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
    status: 'pending'
  };

  // First try to scrape the main website
  const mainOutputFile = join(OUTPUT_DIR, `${muni.name.replace(/\s+/g, '-').toLowerCase()}-main.md`);
  const mainResult = await scrapeWithFirecrawl(muni.website_url, mainOutputFile);
  
  let content = '';
  
  if (mainResult.success && existsSync(mainOutputFile)) {
    content = readFileSync(mainOutputFile, 'utf-8');
    console.log(`  ✅ Main page scraped successfully`);
  } else {
    console.log(`  ⚠️  Failed to scrape main page, trying contact pages...`);
  }

  // Try to find and scrape contact page
  const contactResult = await scrapeContactPage(muni.website_url, muni.name);
  
  if (contactResult.success) {
    content += '\n\n' + contactResult.content;
    result.contact_page_url = contactResult.url;
  }

  // Extract and categorize data
  if (content) {
    const emails = extractEmails(content);
    const categorized = categorizeEmails(content, emails);
    const xHandle = extractXHandle(content);

    result.mayor_email = categorized.mayor;
    result.planning_email = categorized.planning;
    result.it_email = categorized.it;
    result.general_email = categorized.general;
    result.x_handle = xHandle;
    
    result.status = emails.length > 0 ? 'success' : 'no_emails_found';
    
    console.log(`  📧 Emails found: ${emails.length}`);
    if (categorized.mayor) console.log(`     Mayor: ${categorized.mayor}`);
    if (categorized.planning) console.log(`     Planning: ${categorized.planning}`);
    if (categorized.it) console.log(`     IT: ${categorized.it}`);
    if (categorized.general) console.log(`     General: ${categorized.general}`);
    if (xHandle) console.log(`     X Handle: ${xHandle}`);
  } else {
    result.status = 'failed';
    console.log(`  ❌ No content extracted`);
  }

  return result;
}

/**
 * Update Supabase with scraped data
 */
async function updateSupabase(results) {
  console.log('\n\n📊 Updating Supabase...\n');
  
  let updated = 0;
  let failed = 0;
  
  for (const result of results) {
    if (result.status === 'success' || result.mayor_email || result.general_email) {
      const updateData = {
        mayor_email: result.mayor_email,
        planning_email: result.planning_email,
        it_email: result.it_email,
        general_email: result.general_email || result.mayor_email,
        x_handle: result.x_handle,
        updated_at: new Date().toISOString()
      };
      
      // Remove null values
      Object.keys(updateData).forEach(key => {
        if (updateData[key] === null) delete updateData[key];
      });
      
      const { error } = await supabase
        .from('municipalities')
        .update(updateData)
        .eq('name', result.name)
        .eq('province', result.province);
      
      if (error) {
        console.error(`❌ Failed to update ${result.name}:`, error.message);
        failed++;
      } else {
        console.log(`✅ Updated: ${result.name}`);
        updated++;
      }
    }
  }
  
  console.log(`\n✅ Updated: ${updated}, ❌ Failed: ${failed}`);
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 Starting Municipality Email Scraping\n');
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
  
  console.log(`📊 Found ${municipalities.length} municipalities to scrape\n`);
  
  // Process in batches to avoid overwhelming Firecrawl
  const BATCH_SIZE = 5;
  const results = [];
  
  for (let i = 0; i < municipalities.length; i += BATCH_SIZE) {
    const batch = municipalities.slice(i, i + BATCH_SIZE);
    console.log(`\n📦 Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(municipalities.length / BATCH_SIZE)}...`);
    
    for (const muni of batch) {
      const result = await scrapeMunicipality(muni);
      results.push(result);
      
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // Delay between batches
    if (i + BATCH_SIZE < municipalities.length) {
      console.log('\n⏳ Waiting 5 seconds before next batch...');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
  
  // Save results to file
  const resultsFile = join(OUTPUT_DIR, 'scraping-results.json');
  writeFileSync(resultsFile, JSON.stringify(results, null, 2));
  console.log(`\n💾 Results saved to: ${resultsFile}`);
  
  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 SCRAPING SUMMARY');
  console.log('='.repeat(60));
  
  const successful = results.filter(r => r.status === 'success').length;
  const withMayorEmail = results.filter(r => r.mayor_email).length;
  const withPlanningEmail = results.filter(r => r.planning_email).length;
  const withITEmail = results.filter(r => r.it_email).length;
  const withXHandle = results.filter(r => r.x_handle).length;
  
  console.log(`✅ Successfully scraped: ${successful}/${results.length}`);
  console.log(`👤 Mayor emails found: ${withMayorEmail}/${results.length}`);
  console.log(`📋 Planning emails found: ${withPlanningEmail}/${results.length}`);
  console.log(`💻 IT emails found: ${withITEmail}/${results.length}`);
  console.log(`🐦 X handles found: ${withXHandle}/${results.length}`);
  
  // List municipalities with complete data
  const completeData = results.filter(r => 
    r.mayor_email && r.planning_email && r.it_email
  );
  console.log(`\n✅ Cantones with complete data: ${completeData.length}`);
  completeData.forEach(r => console.log(`   - ${r.name} (${r.province})`));
  
  // List municipalities missing mayor emails
  const missingMayor = results.filter(r => !r.mayor_email);
  console.log(`\n⚠️  Cantones missing mayor email: ${missingMayor.length}`);
  missingMayor.forEach(r => console.log(`   - ${r.name} (${r.province})`));
  
  // Update Supabase
  await updateSupabase(results);
  
  console.log('\n✨ Scraping complete!');
}

main().catch(console.error);
