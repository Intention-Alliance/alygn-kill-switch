/**
 * Verify municipalities data in Supabase
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://uwusstfgikzeryvaruuk.supabase.co';
const SUPABASE_KEY = 'sb_secret_FJpLuHy0vrsDn1YLJ5QTbw_K0-YRCJY';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function verifyData() {
  console.log("🔍 Verifying municipalities data...\n");

  // Get all municipalities
  const { data, error } = await supabase
    .from('municipalities')
    .select('*');

  if (error) {
    console.error("❌ Error:", error.message);
    return;
  }

  console.log(`✅ Total records in database: ${data.length}\n`);

  // Count by province
  const byProvince = {};
  data.forEach(m => {
    byProvince[m.province] = (byProvince[m.province] || 0) + 1;
  });

  console.log("📍 Distribution by Province:");
  Object.entries(byProvince).forEach(([province, count]) => {
    console.log(`   ${province}: ${count}`);
  });

  // Count emails
  const withMayorEmail = data.filter(m => m.mayor_email).length;
  const withGeneralEmail = data.filter(m => m.general_email).length;
  const withAnyEmail = data.filter(m => m.mayor_email || m.general_email).length;
  const withMayorName = data.filter(m => m.mayor_name).length;

  console.log("\n📧 Email Statistics:");
  console.log(`   Mayor emails: ${withMayorEmail}/${data.length}`);
  console.log(`   General emails: ${withGeneralEmail}/${data.length}`);
  console.log(`   Any email: ${withAnyEmail}/${data.length}`);

  console.log("\n👤 Mayor Names:");
  console.log(`   With mayor name: ${withMayorName}/${data.length}`);
  console.log(`   Missing mayor names: ${data.length - withMayorName}`);

  // List municipalities with verified mayor emails
  const verifiedMayorEmails = data.filter(m => m.mayor_email);
  console.log("\n✅ Municipalities with verified mayor emails:");
  verifiedMayorEmails.forEach(m => {
    console.log(`   - ${m.name} (${m.province}): ${m.mayor_email}`);
  });

  // List municipalities missing mayor names
  const missingMayorNames = data.filter(m => !m.mayor_name);
  console.log("\n⚠️  Municipalities missing mayor names:");
  missingMayorNames.forEach(m => {
    console.log(`   - ${m.name} (${m.province})`);
  });

  console.log("\n✨ Verification complete!");
}

verifyData().catch(console.error);
