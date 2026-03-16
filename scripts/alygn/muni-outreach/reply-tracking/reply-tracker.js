/**
 * Reply Tracker - IMAP Fetch + LLM Classification
 * 
 * Hybrid script: IMAP email fetch + Grok sub-agent for sentiment/intent classification.
 * 
 * Tools:
 * - IMAP: Fetch replies from inbox
 * - Grok/Perplexity: Classify sentiment, intent, political context
 * - Supabase: Store classification results
 * 
 * Usage:
 *   node reply-tracker.js --region=cr --wave=1 --imap-host=imap.gmail.com
 */

import path from "path";
import { sessions_spawn } from "openclaw";
import Imap from "imap";
import { simpleParser } from "mailparser";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load utilities
import supabaseClient from "../../../utils/supabase-client.js";
const supabase = supabaseClient.supabase;
import checkpoint from "../core/checkpoint.js";

// Load credentials
let credentials;
try {
  credentials = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../config/credentials.json'), 'utf8'));
} catch (error) {
  console.error('⚠️  Failed to load credentials:', error.message);
}

// Current date for context
const currentDate = new Date().toLocaleDateString('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric'
});

/**
 * Main reply tracking function
 */
async function trackReplies(options) {
  const {
    region,
    wave,
    imapConfig
  } = options;
  
  console.log(`📧 Reply Tracker - ${region} Wave ${wave}`);
  console.log(`   Date: ${currentDate}`);
  console.log(`   IMAP Host: ${imapConfig.host}`);
  
  // Connect to IMAP
  const imap = new Imap({
    user: imapConfig.user,
    password: imapConfig.password,
    host: imapConfig.host,
    port: imapConfig.port || 993,
    tls: imapConfig.tls !== false,
    tlsOptions: { rejectUnauthorized: false }
  });
  
  const emails = [];
  
  try {
    // Connect to IMAP
    await new Promise((resolve, reject) => {
      imap.once('ready', resolve);
      imap.once('error', reject);
      imap.connect();
    });
    
    console.log('   ✅ IMAP connected');
    
    // Open INBOX
    await new Promise((resolve, reject) => {
      imap.openBox('INBOX', false, (err, box) => {
        if (err) reject(err);
        else resolve(box);
      });
    });
    
    console.log('   ✅ INBOX opened');
    
    // Search for unread emails (or recently read)
    const searchCriteria = ['UNSEEN'];
    
    const fetchResult = await new Promise((resolve, reject) => {
      const f = imap.fetch(searchCriteria, { bodies: '' });
      
      const fetchedEmails = [];
      
      f.on('message', (msg) => {
        msg.on('body', (stream) => {
          simpleParser(stream, (err, parsed) => {
            if (!err) {
              fetchedEmails.push(parsed);
            }
          });
        });
      });
      
      f.once('error', reject);
      f.once('end', () => resolve(fetchedEmails));
    });
    
    console.log(`   📬 Emails found: ${fetchResult.length}`);
    
    // Filter to Alygn outreach replies
    for (const email of fetchResult) {
      if (email.subject?.toLowerCase().includes('alygn') ||
          email.from?.value?.some(f => f.address?.includes('alygn'))) {
        emails.push(email);
      }
    }
    
    console.log(`   🎯 Alygn-related replies: ${emails.length}`);
    
    if (emails.length === 0) {
      console.log('⚠️  No new replies to process');
      imap.end();
      return { classified: 0, results: [] };
    }
    
    const results = [];
    
    // Classify each reply
    for (const email of emails) {
      try {
        console.log(`\n📧 Classifying: ${email.subject} (from: ${email.from?.text})`);
        
        // Spawn sub-agent for classification
        const agentResult = await sessions_spawn({
          task: `Classify email reply for ${region} Wave ${wave}. TODAY: ${currentDate}`,
          agentId: `reply-classifier:${region}:${wave}`,
          model: 'ollama/qwen3.5:cloud',
          attachments: [{
            name: 'email-context.json',
            content: JSON.stringify({
              subject: email.subject,
              body: email.text || email.html,
              from: email.from?.text,
              date: email.date?.toISOString(),
              region,
              wave,
              currentDate,
              currentYear: 2026
            })
          }]
        });
        
        console.log(`   ✅ Classification: ${agentResult.category}`);
        
        // Update Supabase
        const outreachRecord = await findOutreachRecord(email);
        
        if (outreachRecord) {
          await supabase
            .from('outreach_emails')
            .update({
              reply_received_at: new Date().toISOString(),
              reply_category: agentResult.category,
              reply_sentiment: agentResult.sentiment,
              reply_confidence: agentResult.confidence,
              meeting_requested: agentResult.meetingRequested,
              follow_up_needed: agentResult.followUpNeeded,
              referred_to: agentResult.referredTo || null,
              political_context: agentResult.politicalContext || null
            })
            .eq('id', outreachRecord.id);
        }
        
        results.push({
          subject: email.subject,
          from: email.from?.text,
          classification: agentResult.category,
          sentiment: agentResult.sentiment,
          confidence: agentResult.confidence,
          meetingRequested: agentResult.meetingRequested,
          followUpNeeded: agentResult.followUpNeeded
        });
        
        // Save checkpoint
        checkpoint.autoSave(region, wave, {
          step: 'reply-tracking',
          classifiedCount: results.length
        });
        
      } catch (error) {
        console.error(`   ❌ Error classifying email:`, error.message);
        results.push({
          subject: email.subject,
          error: error.message
        });
      }
    }
    
    imap.end();
    
    console.log(`\n✅ Reply classification complete: ${results.length} emails`);
    
    const positiveCount = results.filter(r => r.classification === 'positive').length;
    const meetingCount = results.filter(r => r.meetingRequested).length;
    
    console.log(`   Positive replies: ${positiveCount}/${results.length}`);
    console.log(`   Meetings requested: ${meetingCount}`);
    
    return { classified: results.length, results };
    
  } catch (error) {
    console.error('❌ IMAP error:', error.message);
    imap.end();
    throw error;
  }
}

/**
 * Find outreach record by email subject/from
 */
async function findOutreachRecord(email) {
  const { data, error } = await supabase
    .from('outreach_emails')
    .select('id')
    .or(`subject.ilike.%${email.subject}%,recipient_email.ilike.%${email.from?.value?.[0]?.address}%`)
    .single();
  
  if (error || !data) {
    return null;
  }
  
  return data;
}

// CLI
if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  const args = process.argv.slice(2);
  
  const parseArg = (name) => {
    const arg = args.find(a => a.startsWith(`--${name}=`));
    return arg ? arg.split('=')[1] : null;
  };
  
  const region = parseArg('region') || 'cr';
  const wave = parseInt(parseArg('wave') || '1');
  
  const imapConfig = {
    host: parseArg('imap-host') || credentials?.email?.imap?.host || 'imap.gmail.com',
    port: parseInt(parseArg('imap-port') || credentials?.email?.imap?.port || '993'),
    user: parseArg('imap-user') || credentials?.email?.user,
    password: parseArg('imap-password') || credentials?.email?.password,
    tls: parseArg('imap-tls') !== 'false'
  };
  
  if (!imapConfig.user || !imapConfig.password) {
    console.error('❌ IMAP credentials required (--imap-user, --imap-password or credentials.json)');
    process.exit(1);
  }
  
  trackReplies({ region, wave, imapConfig })
    .then(({ classified, results }) => {
      console.log('\n📊 Results:', JSON.stringify(results, null, 2));
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Fatal error:', error.message);
      process.exit(1);
    });
}

export { trackReplies, findOutreachRecord };
