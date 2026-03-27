#!/usr/bin/env node
/**
 * Live Test Prep Check
 * Queries VC database (Notion), Municipal database (Supabase), and Email inbox
 */

import { Client } from '@notionhq/client';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const CREDENTIALS_PATH = path.join(process.env.HOME, '.openclaw', 'workspace', 'config', 'credentials.json');
const REPORT_PATH = path.join(process.env.HOME, '.openclaw', 'workspace', 'LIVE-TEST-PREP-REPORT.md');

// Load credentials
const creds = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));

// ========== STEP 1: Check VC Outreach Database (Notion) ==========
async function checkVCOutreach() {
  console.log('🔍 Checking VC Outreach Database...');
  
  const notion = new Client({ auth: creds.notion.apiKey });
  // Correct data_source_id from search
  const dataSourceId = '30b33487-4af6-8167-98dd-000bda6934d7';
  
  const results = {
    byStatus: {},
    total: 0,
    withEmail: 0,
    withoutEmail: 0,
    readyToSend: [],
    allVCs: []
  };
  
  try {
    // Query using dataSources.query
    let cursor = undefined;
    do {
      const response = await notion.dataSources.query({
        data_source_id: dataSourceId,
        page_size: 100,
        start_cursor: cursor
      });
      
      for (const page of response.results) {
        results.total++;
        const props = page.properties;
        
        // Get status
        const status = props.Status?.select?.name || 'Unknown';
        results.byStatus[status] = (results.byStatus[status] || 0) + 1;
        
        // Get email
        const email = props.Email?.email || null;
        if (email && email.includes('@')) {
          results.withEmail++;
        } else {
          results.withoutEmail++;
        }
        
        // Get name
        const name = props.Name?.title?.[0]?.text?.content || 'Unknown';
        
        // Check if ready to send (Approved status with valid email)
        if (status === 'Approved' && email) {
          results.readyToSend.push({
            id: page.id,
            name,
            email,
            status
          });
        }
        
        results.allVCs.push({
          id: page.id,
          name,
          email,
          status
        });
      }
      
      cursor = response.next_cursor;
    } while (cursor);
    
    console.log(`✅ Found ${results.total} VCs`);
    console.log('📊 By Status:', results.byStatus);
    console.log(`📧 With email: ${results.withEmail}, Without: ${results.withoutEmail}`);
    console.log(`🚀 Ready to send: ${results.readyToSend.length}`);
    
    return results;
  } catch (error) {
    console.error('❌ Notion query failed:', error.message);
    return { error: error.message, total: 0, byStatus: {}, readyToSend: [] };
  }
}

// ========== STEP 2: Check Municipal Database (Supabase) ==========
async function checkMunicipalDatabase() {
  console.log('\n🔍 Checking Municipal Database...');
  
  const supabase = createClient(creds.supabase.url, creds.supabase.serviceKey);
  
  const results = {
    total: 0,
    contacted: 0,
    ready: 0,
    byStatus: {}
  };
  
  // Try different table names
  const tableNames = ['municipal_outreach', 'alygn_global_muni', 'municipalities'];
  let data = null;
  let usedTable = null;
  
  for (const tableName of tableNames) {
    try {
      const response = await supabase.from(tableName).select('*');
      if (!response.error) {
        data = response.data;
        usedTable = tableName;
        break;
      }
    } catch (e) {
      // Continue to next table
    }
  }
  
  if (!data) {
    console.error('❌ Could not find municipal table');
    return { error: 'Table not found', total: 0, byStatus: {}, table: 'none' };
  }
  
  console.log(`✅ Found table: ${usedTable}`);
  
  results.total = data.length;
  
  for (const muni of data) {
    const status = muni.status || 'Unknown';
    results.byStatus[status] = (results.byStatus[status] || 0) + 1;
    
    if (status === 'contacted' || status === 'sent' || status === 'replied') {
      results.contacted++;
    }
    
    if (status === 'approved' || status === 'ready') {
      results.ready++;
    }
  }
  
  console.log(`✅ Found ${results.total} municipalities`);
  console.log('📊 By Status:', results.byStatus);
  console.log(`📧 Contacted: ${results.contacted}, Ready: ${results.ready}`);
  
  return { ...results, table: usedTable };
}

// ========== STEP 3: Check Email Inbox (Gmail IMAP) ==========
async function checkEmailInbox() {
  console.log('\n🔍 Checking Email Inbox...');
  
  const results = {
    unreadCount: 0,
    recentReplies: [],
    error: null
  };
  
  try {
    // Try to use imapflow if available
    let ImapFlow;
    try {
      const mod = await import('imapflow');
      ImapFlow = mod.default;
    } catch (e) {
      throw new Error('IMAP package not installed');
    }
    
    const client = new ImapFlow({
      host: 'imap.gmail.com',
      port: 993,
      secure: true,
      auth: {
        user: creds.email.address,
        pass: creds.email.smtp.password
      },
      logger: false
    });
    
    await client.connect();
    
    const mailbox = await client.mailboxOpen('INBOX');
    results.unreadCount = mailbox.count - mailbox.uidNext + 1;
    
    const since = new Date();
    since.setDate(since.getDate() - 7);
    
    const searchResults = await client.search({
      since: since.toISOString().split('T')[0],
      unseen: true
    });
    
    results.unreadCount = searchResults.length;
    
    const messages = await client.fetch('1:10', {
      envelope: true,
      flags: true
    });
    
    for await (const msg of messages) {
      if (msg.envelope) {
        results.recentReplies.push({
          subject: msg.envelope.subject || '(no subject)',
          from: msg.envelope.from?.[0]?.address || 'unknown',
          date: msg.envelope.date || 'unknown',
          flags: msg.flags || []
        });
      }
    }
    
    await client.logout();
    
    console.log(`✅ Found ${results.unreadCount} unread emails`);
    console.log(`📧 Recent messages: ${results.recentReplies.length}`);
    
    return results;
  } catch (error) {
    console.log('⚠️  Email check skipped:', error.message);
    return { 
      error: error.message, 
      unreadCount: 'N/A (package not installed)', 
      recentReplies: [] 
    };
  }
}

// ========== GENERATE REPORT ==========
function generateReport(vcData, muniData, emailData) {
  const now = new Date().toISOString();
  
  const report = `# Alygn Live Test Prep Report

**Generated:** ${now}

---

## 1. VC Database Summary (Notion)

**Database ID:** \`30b33487-4af6-8167-98dd-000bda6934d7\`

### Status Breakdown

| Status | Count |
|--------|-------|
${Object.entries(vcData.byStatus).map(([status, count]) => `| ${status} | ${count} |`).join('\n')}

**Total VCs:** ${vcData.total}
**With Valid Email:** ${vcData.withEmail}
**Missing Email:** ${vcData.withoutEmail}
**Ready to Send (Approved + Email):** ${vcData.readyToSend.length}

### Ready to Send VCs

${vcData.readyToSend.length > 0 
  ? vcData.readyToSend.map(vc => `- **${vc.name}** (${vc.email})`).join('\n')
  : '*No VCs currently ready to send*'}

---

## 2. Municipal Database Summary (Supabase)

**Table:** \`${muniData.table || 'N/A'}\`
**URL:** \`https://uwusstfgikzeryvaruuk.supabase.co\`

### Status Breakdown

| Status | Count |
|--------|-------|
${Object.entries(muniData.byStatus).map(([status, count]) => `| ${status} | ${count} |`).join('\n')}

**Total Municipalities:** ${muniData.total}
**Contacted:** ${muniData.contacted}
**Ready for Outreach:** ${muniData.ready}

---

## 3. Email Inbox Summary (Gmail)

**Email:** \`alyyygn@gmail.com\`

**Unread Emails:** ${emailData.unreadCount}
**Recent Messages (last 7 days):** ${emailData.recentReplies.length}

### Recent Replies

${emailData.recentReplies.length > 0
  ? emailData.recentReplies.map(msg => `- **${msg.subject}** from ${msg.from} (${msg.date})`).join('\n')
  : '*No recent replies found*'}

${emailData.error ? `\n**Note:** Email check encountered an issue: ${emailData.error}` : ''}

---

## 4. Recommendations for Live Test Batch Sizes

### VC Outreach

Based on current database state:

- **Ready to send:** ${vcData.readyToSend.length} VCs
- **Recommended batch size:** ${Math.min(vcData.readyToSend.length, 5)} VCs for initial test
- **Strategy:** Start with small batch (3-5) to test email deliverability and response rates

### Municipal Outreach

- **Ready for outreach:** ${muniData.ready} municipalities
- **Recommended batch size:** ${Math.min(muniData.ready, 10)} municipalities for initial test
- **Strategy:** Municipal outreach can handle larger batches due to lower volume

### Combined Test Plan

| Phase | VCs | Municipalities | Purpose |
|-------|-----|----------------|---------|
| Phase 1 (Pilot) | ${Math.min(vcData.readyToSend.length, 3)} | ${Math.min(muniData.ready, 5)} | Validate email delivery |
| Phase 2 (Small) | ${Math.min(vcData.readyToSend.length, 5)} | ${Math.min(muniData.ready, 10)} | Test response rates |
| Phase 3 (Scale) | ${Math.min(vcData.readyToSend.length, 10)} | ${Math.min(muniData.ready, 25)} | Full automation test |

### Pre-Flight Checklist

- [ ] Verify all ${vcData.readyToSend.length} ready VCs have valid email addresses
- [ ] Confirm ${muniData.ready} municipalities are approved for outreach
- [ ] Test email sending with 1-2 manual sends
- [ ] Set up reply tracking for inbox monitoring
- [ ] Configure rate limiting (max 50 emails/hour)

---

## Next Steps

1. **Review ready VCs** - Verify email addresses are correct
2. **Approve municipalities** - Move approved municipalities to "ready" status
3. **Test email delivery** - Send 1-2 manual test emails
4. **Monitor replies** - Check inbox for responses within 24-48 hours
5. **Scale up** - Increase batch sizes based on initial results

---

*Report generated by Alygn Live Test Prep Script*
`;

  return report;
}

// ========== MAIN ==========
async function main() {
  console.log('🚀 Starting Live Test Prep Check...\n');
  
  const vcData = await checkVCOutreach();
  const muniData = await checkMunicipalDatabase();
  const emailData = await checkEmailInbox();
  
  console.log('\n📝 Generating report...');
  const report = generateReport(vcData, muniData, emailData);
  
  fs.writeFileSync(REPORT_PATH, report, 'utf8');
  console.log(`✅ Report saved to: ${REPORT_PATH}`);
  
  // Print summary
  console.log('\n📊 SUMMARY:');
  console.log('==========');
  console.log(`VCs: ${vcData.total} total, ${vcData.readyToSend.length} ready to send`);
  console.log(`Municipalities: ${muniData.total} total, ${muniData.ready} ready`);
  console.log(`Email: ${emailData.unreadCount} unread messages`);
}

main().catch(console.error);
