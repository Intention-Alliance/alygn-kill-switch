/**
 * Check Supabase municipalities table schema
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://uwusstfgikzeryvaruuk.supabase.co';
const SUPABASE_KEY = 'sb_secret_FJpLuHy0vrsDn1YLJ5QTbw_K0-YRCJY';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkSchema() {
  console.log("🔍 Checking municipalities table schema...\n");
  
  // Try to get a single row to see the structure
  const { data, error } = await supabase
    .from('municipalities')
    .select('*')
    .limit(1);
  
  if (error) {
    console.error("❌ Error:", error.message);
    
    // Try to check if table exists
    const { count, error: countError } = await supabase
      .from('municipalities')
      .select('*', { count: 'exact', head: true });
    
    if (countError) {
      console.error("❌ Table access error:", countError.message);
    } else {
      console.log(`✅ Table exists. Row count: ${count}`);
    }
    return;
  }
  
  if (data && data.length > 0) {
    console.log("✅ Table schema (from existing row):");
    console.log(Object.keys(data[0]).join('\n'));
  } else {
    console.log("ℹ️ Table is empty. Checking columns via insert test...");
    
    // Try inserting a minimal record to see what columns exist
    const testRecord = {
      name: "Test",
      province: "Test",
      country: "Test"
    };
    
    const { error: insertError } = await supabase
      .from('municipalities')
      .insert(testRecord);
    
    if (insertError) {
      console.error("❌ Insert error:", insertError.message);
      console.log("\nTrying to infer schema from error...");
    } else {
      console.log("✅ Basic insert successful");
      
      // Clean up
      await supabase
        .from('municipalities')
        .delete()
        .eq('name', 'Test');
    }
  }
}

checkSchema().catch(console.error);
