/**
 * Check actual columns in municipalities table
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://uwusstfgikzeryvaruuk.supabase.co';
const SUPABASE_KEY = 'sb_secret_FJpLuHy0vrsDn1YLJ5QTbw_K0-YRCJY';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkColumns() {
  console.log("🔍 Testing column existence...\n");
  
  const columnsToTest = [
    'name',
    'province', 
    'country',
    'mayor_name',
    'mayor_email',
    'municipality_email',
    'phone',
    'population',
    'website',
    'status',
    'discovered_at',
    'validated_at',
    'pain_points',
    'relevance_score'
  ];
  
  const existingColumns = [];
  const missingColumns = [];
  
  for (const column of columnsToTest) {
    const testRecord = { [column]: column === 'population' || column === 'relevance_score' ? 1 : 'test' };
    
    const { error } = await supabase
      .from('municipalities')
      .insert(testRecord);
    
    if (error) {
      if (error.message.includes('column') || error.message.includes('does not exist')) {
        missingColumns.push(column);
      } else {
        // Some other error, column might exist
        existingColumns.push(column);
      }
    } else {
      existingColumns.push(column);
      // Clean up
      await supabase.from('municipalities').delete().eq(column, testRecord[column]);
    }
  }
  
  console.log("✅ Existing columns:");
  existingColumns.forEach(col => console.log(`   - ${col}`));
  
  console.log("\n❌ Missing columns:");
  missingColumns.forEach(col => console.log(`   - ${col}`));
}

checkColumns().catch(console.error);
