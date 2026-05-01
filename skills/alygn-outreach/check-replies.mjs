import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://uwusstfgikzeryvaruuk.supabase.co';
const supabaseKey = 'sb_secret_FJpLuHy0vrsDn1YLJ5QTbw_K0-YRCJY';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkReplies() {
  console.log('📧 Checking Supabase for outreach emails with replies...\n');
  
  const { data, error } = await supabase
    .from('outreach_emails')
    .select('*')
    .not('reply_received_at', 'is', null)
    .order('reply_received_at', { ascending: false })
    .limit(50);
  
  if (error) {
    console.error('❌ Error:', error.message);
    return;
  }
  
  console.log(`✅ Found ${data?.length || 0} emails with replies\n`);
  
  if (data && data.length > 0) {
    const byCategory = {};
    data.forEach(email => {
      const cat = email.reply_category || 'uncategorized';
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(email);
    });
    
    console.log('📊 Reply Breakdown by Category:');
    Object.entries(byCategory).forEach(([cat, emails]) => {
      console.log(`   ${cat}: ${emails.length}`);
    });
    
    console.log('\n📋 Recent Replies:');
    data.slice(0, 10).forEach(email => {
      console.log(`   - ${email.recipient_name || 'Unknown'} (${email.recipient_email})`);
      console.log(`     Category: ${email.reply_category}, Sentiment: ${email.reply_sentiment}`);
      console.log(`     Meeting: ${email.meeting_requested ? '✅' : '❌'}, Follow-up: ${email.follow_up_needed ? '✅' : '❌'}`);
      console.log(`     Date: ${new Date(email.reply_received_at).toLocaleDateString()}\n`);
    });
  }
  
  const { data: noReplies, error: err2 } = await supabase
    .from('outreach_emails')
    .select('id, recipient_name, recipient_email, sent_at, status')
    .is('reply_received_at', null)
    .order('sent_at', { ascending: false })
    .limit(20);
  
  if (!err2 && noReplies) {
    console.log(`\n⏳ ${noReplies.length} emails awaiting replies\n`);
  }
}

checkReplies().catch(console.error);
