import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://uwusstfgikzeryvaruuk.supabase.co',
  'sb_secret_FJpLuHy0vrsDn1YLJ5QTbw_K0-YRCJY'
);

async function updateBounce() {
  console.log('🔄 Updating bounce record for alcaldia@escazu.go.cr...');
  
  // Find the outreach record
  const { data: record, error: findError } = await supabase
    .from('outreach_emails')
    .select('id, recipient_email, status')
    .ilike('recipient_email', '%alcaldia@escazu.go.cr%')
    .single();
  
  if (findError || !record) {
    console.log('⚠️  No outreach record found for this address');
    console.log('Creating bounce log entry...');
    
    // Create a bounce log instead
    const { data: logData, error: logError } = await supabase
      .from('email_bounces')
      .insert({
        recipient_email: 'alcaldia@escazu.go.cr',
        bounce_type: 'hard_bounce',
        bounce_reason: '550 5.4.1 Recipient address rejected: Access denied',
        bounced_at: new Date('2026-04-20T16:23:40.000Z').toISOString(),
        original_subject: 'TRAIGA Act - AI Governance for Escazú',
        status: 'invalid'
      });
    
    if (logError) {
      console.error('❌ Error creating bounce log:', logError.message);
    } else {
      console.log('✅ Bounce log created');
    }
    return;
  }
  
  console.log(`Found record: ${record.id} (${record.status})`);
  
  // Update the record
  const { error: updateError } = await supabase
    .from('outreach_emails')
    .update({
      status: 'bounced',
      bounce_type: 'hard_bounce',
      bounce_reason: '550 5.4.1 Recipient address rejected: Access denied',
      bounced_at: new Date('2026-04-20T16:23:40.000Z').toISOString()
    })
    .eq('id', record.id);
  
  if (updateError) {
    console.error('❌ Error updating record:', updateError.message);
  } else {
    console.log('✅ Outreach record updated to bounced');
  }
}

updateBounce();
