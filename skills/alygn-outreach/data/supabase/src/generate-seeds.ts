
/**
 * Generate Seed Files for Database Backup
 * 
 * Creates SQL seed files from current database state
 * for backup and restore purposes.
 * 
 * Usage:
 *   node generate-seeds.js --output=/tmp/seeds.sql
 *   node generate-seeds.js --table=municipalities --output=/tmp/muni-seeds.sql
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

// Console helpers
const log = (msg) => console.log(`ℹ️  ${msg}`);
const success = (msg) => console.log(`✅ ${msg}`);
const error = (msg, err) => console.error(`❌ ${msg}`, err || '');

/**
 * Initialize Supabase client
 */
function createSupabaseClient() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_KEY environment variables are required');
  }
  
  return createClient(SUPABASE_URL, SUPABASE_KEY);
}

/**
 * Generate INSERT statements from data
 */
function generateInsertStatements(tableName, data, columns) {
  if (!data || data.length === 0) {
    return `-- No data in ${tableName}\n`;
  }
  
  let sql = `\n-- Seed data for ${tableName}\n`;
  sql += `-- Generated: ${new Date().toISOString()}\n\n`;
  
  data.forEach((row, idx) => {
    sql += `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (\n  `;
    
    const values = columns.map(col => {
      const value = row[col];
      
      if (value === null || value === undefined) {
        return 'NULL';
      }
      
      if (typeof value === 'boolean') {
        return value ? 'TRUE' : 'FALSE';
      }
      
      if (typeof value === 'number') {
        return value.toString();
      }
      
      if (Array.isArray(value) || typeof value === 'object') {
        // Escape JSON
        const jsonStr = JSON.stringify(value).replace(/'/g, "''");
        return `'${jsonStr}'::jsonb`;
      }
      
      // String - escape single quotes
      const escaped = value.toString().replace(/'/g, "''");
      return `'${escaped}'`;
    });
    
    sql += values.join(', ');
    sql += `);\n`;
    
    if (idx < data.length - 1 && idx % 100 === 99) {
      sql += `\n-- ${idx + 1} rows inserted...\n`;
    }
  });
  
  return sql;
}

/**
 * Fetch table data and generate seeds
 */
async function generateSeedsForTable(supabase, tableName, columns) {
  log(`Fetching ${tableName}...`);
  
  const { data, error } = await supabase
    .from(tableName)
    .select(columns.join(','));
  
  if (error) {
    throw error;
  }
  
  log(`  Retrieved ${data.length} rows`);
  
  return generateInsertStatements(tableName, data, columns);
}

/**
 * Main function
 */
async function generateSeeds(outputFile, specificTable = null) {
  log(`📊 Generating seed files...`);
  
  // Initialize Supabase
  const supabase = createSupabaseClient();
  success('Supabase client initialized\n');
  
  // Define tables and columns
  const tables = {
    municipalities: [
      'id', 'name', 'country', 'region', 'province', 'population',
      'website_url', 'mayor_name', 'mayor_email', 'council_emails',
      'general_email', 'x_handle', 'discovered_at', 'researched_at',
      'verified_at', 'outreach_sent_at', 'replied_at', 'reply_sentiment',
      'x_warmup_phase1_at', 'x_warmup_phase2_at', 'x_engagement_count',
      'x_last_engagement_at', 'wave_number', 'priority_score',
      'outreach_variant', 'pain_points', 'ai_governance_signals',
      'notes', 'created_at', 'updated_at'
    ],
    outreach_emails: [
      'id', 'municipality_id', 'variant', 'subject', 'body',
      'sent_at', 'message_id', 'status', 'x_warmup_completed',
      'x_engagements_before_email', 'days_between_x_and_email',
      'replied_at', 'reply_sentiment', 'reply_body', 'created_at'
    ],
    x_engagements: [
      'id', 'municipality_id', 'engagement_type', 'x_handle',
      'x_user_id', 'tweet_id', 'content', 'engaged_at', 'phase',
      'notes', 'created_at'
    ]
  };
  
  let allSeeds = `-- ============================================
-- Alygn Municipal Outreach - Database Seeds
-- Generated: ${new Date().toISOString()}
-- ============================================

-- These seeds can be used to restore database state
-- Run with: psql -f seeds.sql or via Supabase SQL editor

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

`;
  
  // Generate seeds for specific table or all tables
  const tablesToProcess = specificTable 
    ? { [specificTable]: tables[specificTable] }
    : tables;
  
  for (const [tableName, columns] of Object.entries(tablesToProcess)) {
    try {
      const seedSql = await generateSeedsForTable(supabase, tableName, columns);
      allSeeds += seedSql + '\n';
    } catch (err) {
      error(`Failed to fetch ${tableName}:`, err.message);
      allSeeds += `\n-- ERROR fetching ${tableName}: ${err.message}\n\n`;
    }
  }
  
  // Write to file
  fs.writeFileSync(outputFile, allSeeds);
  success(`\n💾 Seed file generated: ${outputFile}`);
  
  // Summary
  const stats = fs.statSync(outputFile);
  console.log('\n📊 Summary:');
  console.log(`  File size: ${(stats.size / 1024).toFixed(2)} KB`);
  console.log(`  Tables: ${Object.keys(tablesToProcess).length}`);
  console.log(`  Output: ${outputFile}`);
  
  // Also generate JSON backup
  const jsonFile = outputFile.replace('.sql', '.json');
  const jsonBackup = {
    generated_at: new Date().toISOString(),
    tables: Object.keys(tablesToProcess),
    note: 'This is a backup of database state. Use restore-seeds.js to restore.'
  };
  
  fs.writeFileSync(jsonFile, JSON.stringify(jsonBackup, null, 2));
  log(`💾 JSON metadata: ${jsonFile}`);
  
  return { success: true, outputFile, size: stats.size };
}

/**
 * CLI Entry Point
 */
async function main() {
  try {
    const args = process.argv.slice(2);
    
    const outputArg = args.find(a => a.startsWith('--output='));
    const tableArg = args.find(a => a.startsWith('--table='));
    
    if (!outputArg) {
      console.log(`
❌ No output file specified.

Usage:
  node generate-seeds.js --output=/tmp/seeds.sql [--table=tableName]

Options:
  --output=<file>  Output file path (required)
  --table=<name>   Specific table to seed (optional, defaults to all)

Examples:
  # All tables
  node generate-seeds.js --output=/tmp/seeds.sql
  
  # Specific table
  node generate-seeds.js --output=/tmp/muni-seeds.sql --table=municipalities
`);
      process.exit(1);
    }
    
    const outputFile = outputArg.split('=')[1];
    const tableName = tableArg ? tableArg.split('=')[1] : null;
    
    await generateSeeds(outputFile, tableName);
    
    process.exit(0);
    
  } catch (err) {
    error('💥 Fatal error:', err);
    console.error('\n💡 Check Supabase credentials and connection');
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { generateSeeds };
