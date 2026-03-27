/**
 * Get actual schema of municipalities table v2
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://uwusstfgikzeryvaruuk.supabase.co';
const SUPABASE_KEY = 'sb_secret_FJpLuHy0vrsDn1YLJ5QTbw_K0-YRCJY';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function getSchema() {
  console.log("🔍 Getting actual table schema...\n");
  
  // Insert minimal record
  const minimalRecord = {
    name: "SchemaTest",
    province: "TestProvince"
  };
  
  const { data, error } = await supabase
    .from('municipalities')
    .insert(minimalRecord)
    .select();
  
  if (error) {
    console.error("❌ Error:", error.message);
    return;
  }
  
  if (data && data.length > 0) {
    console.log("✅ Actual table columns:");
    Object.keys(data[0]).forEach(key => {
      const value = data[0][key];
      const type = value === null ? 'null' : typeof value;
      console.log(`   - ${key}: ${type}`);
    });
    
    // Clean up
    await supabase.from('municipalities').delete().eq('id', data[0].id);
  }
}

getSchema().catch(console.error);
