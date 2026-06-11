// scripts/utils/supabase-client.test.js
// Smoke test for supabase-client.js — exits 0 on success, 1 on failure

const { supabase, supabaseAdmin, testConnection, config } = require('./supabase-client');

async function run() {
  // 1. Assert from() is a function
  if (typeof supabase.from !== 'function') throw new Error('supabase.from() is not a function');

  // 2. Assert config fields exist
  if (!config.url) throw new Error('config.url is missing');
  if (!config.key) throw new Error('config.key is missing');

  // 3. Hit the municipalities table (known to exist)
  const { status, error } = await supabase.from('municipalities').select('id').limit(1);
  if (error) throw new Error(`Query error: ${error.message}`);
  if (status !== 200) throw new Error(`municipalities status was ${status}, expected 200`);

  // 4. Run testConnection (should succeed)
  const connected = await testConnection();
  if (!connected) throw new Error('testConnection() returned false');

  console.log('✅ supabase-client smoke test passed');
}

run().catch(e => { console.error('❌', e.message); process.exit(1); });
