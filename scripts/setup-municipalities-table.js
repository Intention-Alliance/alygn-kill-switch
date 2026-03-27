/**
 * Setup municipalities table schema in Supabase
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://uwusstfgikzeryvaruuk.supabase.co';
const SUPABASE_KEY = 'sb_secret_FJpLuHy0vrsDn1YLJ5QTbw_K0-YRCJY';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function setupTable() {
  console.log("🔧 Setting up municipalities table...\n");

  // SQL to create the table with proper schema
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS municipalities (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      province TEXT NOT NULL,
      country TEXT NOT NULL DEFAULT 'Costa Rica',
      mayor_name TEXT,
      mayor_email TEXT,
      municipality_email TEXT,
      phone TEXT,
      population INTEGER,
      website TEXT,
      status TEXT NOT NULL DEFAULT 'Not contacted',
      discovered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      validated_at TIMESTAMP WITH TIME ZONE,
      pain_points TEXT[] DEFAULT '{}',
      relevance_score INTEGER DEFAULT 7
    );
  `;

  // Try to execute the SQL via RPC or direct query
  try {
    // First, let's try to drop the existing table if it has wrong schema
    console.log("Checking existing table...");
    
    const { data: existingData, error: existingError } = await supabase
      .from('municipalities')
      .select('*')
      .limit(1);
    
    if (existingError) {
      console.log("Table doesn't exist or error accessing it");
    } else {
      console.log("Table exists. Checking if we need to recreate...");
      
      // Try to insert a record with the expected schema
      const testRecord = {
        name: "Test",
        province: "Test",
        country: "Test",
        mayor_name: "Test Mayor",
        mayor_email: "test@example.com",
        municipality_email: "muni@test.com",
        phone: "1234-5678",
        population: 10000,
        website: "https://test.com",
        status: "Not contacted",
        relevance_score: 7
      };
      
      const { error: testError } = await supabase
        .from('municipalities')
        .insert(testRecord);
      
      if (testError) {
        console.log("❌ Schema mismatch detected:", testError.message);
        console.log("\n⚠️  Please run this SQL in Supabase SQL Editor:");
        console.log("\n" + "=".repeat(60));
        console.log(createTableSQL);
        console.log("=".repeat(60));
        return;
      } else {
        console.log("✅ Schema looks good! Cleaning up test record...");
        await supabase.from('municipalities').delete().eq('name', 'Test');
        return;
      }
    }
  } catch (err) {
    console.error("Error:", err.message);
  }
}

setupTable().catch(console.error);
