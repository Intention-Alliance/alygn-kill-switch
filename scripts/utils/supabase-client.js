/**
 * Supabase Client - Shared Instance
 * 
 * Provides a singleton Supabase client for all scripts.
 * Loads credentials from config/credentials.json or environment variables.
 * 
 * Usage:
 *   const supabase = require('../utils/supabase-client');
 *   const { data, error } = await supabase.from('municipalities').select('*');
 */

const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Load credentials
let supabaseUrl;
let supabaseKey;
let supabaseServiceKey;

try {
  const credentials = require(path.join(__dirname, '../../config/credentials.json'));
  supabaseUrl = credentials.supabase?.url || process.env.SUPABASE_URL;
  supabaseKey = credentials.supabase?.key || process.env.SUPABASE_KEY;
  supabaseServiceKey = credentials.supabase?.serviceKey || process.env.SUPABASE_SERVICE_KEY;
} catch (error) {
  // Fallback to environment variables
  supabaseUrl = process.env.SUPABASE_URL;
  supabaseKey = process.env.SUPABASE_KEY;
  supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
}

// Validate credentials
if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Supabase credentials not found');
  console.error('Set SUPABASE_URL and SUPABASE_KEY in environment or config/credentials.json');
  process.exit(1);
}

// Create client (anon key for client-side operations)
const supabase = createClient(supabaseUrl, supabaseKey);

// Create service role client (for admin operations)
const supabaseAdmin = supabaseServiceKey 
  ? createClient(supabaseUrl, supabaseServiceKey)
  : supabase;

// Test connection
async function testConnection() {
  try {
    const { data, error } = await supabase.from('municipalities').select('id').limit(1);
    if (error) throw error;
    console.log('✅ Supabase connection successful');
    return true;
  } catch (error) {
    console.error('❌ Supabase connection failed:', error.message);
    return false;
  }
}

module.exports = {
  supabase,
  supabaseAdmin,
  testConnection,
  config: {
    url: supabaseUrl,
    key: supabaseKey ? supabaseKey.substring(0, 8) + '...' : null,
    serviceKey: supabaseServiceKey ? supabaseServiceKey.substring(0, 8) + '...' : null
  }
};
