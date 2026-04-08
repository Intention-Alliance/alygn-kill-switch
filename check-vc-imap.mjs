#!/usr/bin/env node
/**
 * Check Gmail Sent folder via IMAP for VC outreach emails
 */

import { ImapFlow } from 'imapflow';
import fs from 'fs';
import path from 'path';

const IMAP_CONFIG = {
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: {
        user: 'alyyygn@gmail.com',
        pass: 'pvjktbdzkgimrzlw'
    }
};

const TARGET_DOMAINS = ['menlovc.com', 'sparkcapital.com', 'lsvp.com'];

async function checkSentEmails() {
    const client = new ImapFlow(IMAP_CONFIG);
    const results = {
        menlovc: [],
        sparkcapital: [],
        lsvp: []
    };

    try {
        await client.connect();
        console.log('✅ Connected to Gmail IMAP');

        // Select the [Gmail]/Sent Mail folder
        let lock;
        try {
            lock = await client.getMailboxLock('[Gmail]/Sent Mail');
        } catch (e) {
            // Try alternative folder names
            try {
                lock = await client.getMailboxLock('Sent');
            } catch (e2) {
                console.log('Trying Gmail folder format...');
                const mailboxes = await client.list();
                const sentBox = mailboxes.find(m => 
                    m.path.includes('Sent') || m.path.includes('Enviados')
                );
                if (sentBox) {
                    lock = await client.getMailboxLock(sentBox.path);
                } else {
                    throw new Error('Could not find Sent folder');
                }
            }
        }
        
        console.log('📧 Opened Sent Mail folder');

        // Calculate date 90 days ago
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        const sinceDate = ninetyDaysAgo.toISOString().split('T')[0];
        console.log(`📅 Searching emails since: ${sinceDate}`);

        // Search for all messages in the date range first
        const searchQuery = { since: ninetyDaysAgo };
        const allMessages = await client.search(searchQuery);
        console.log(`🔍 Total messages in Sent folder (last 90 days): ${allMessages.length}`);

        // Process each message to check for target domains
        let processed = 0;
        for await (const message of client.fetch(allMessages, { 
            envelope: true,
            headers: ['to', 'from', 'subject', 'message-id', 'date']
        })) {
            processed++;
            if (processed % 100 === 0) {
                console.log(`  Processed ${processed}/${allMessages.length} messages...`);
            }
            
            if (!message || !message.envelope) continue;
            
            const toAddresses = message.envelope.to || [];
            const fromAddresses = message.envelope.from || [];
            
            // Only include if sent from alyyygn@gmail.com
            const isSentFromUs = fromAddresses.some(addr => 
                addr.address === 'alyyygn@gmail.com'
            );
            
            if (!isSentFromUs) continue;
            
            // Check if any recipient matches target domains
            for (const addr of toAddresses) {
                const email = addr.address || '';
                for (const domain of TARGET_DOMAINS) {
                    if (email.toLowerCase().includes(`@${domain.toLowerCase()}`)) {
                        const entry = {
                            date: message.envelope.date,
                            to: email,
                            partnerName: addr.name || '',
                            subject: message.envelope.subject,
                            messageId: message.headers?.get('message-id')?.[0] || 'N/A'
                        };
                        
                        if (domain === 'menlovc.com') results.menlovc.push(entry);
                        else if (domain === 'sparkcapital.com') results.sparkcapital.push(entry);
                        else if (domain === 'lsvp.com') results.lsvp.push(entry);
                        break;
                    }
                }
            }
        }

        lock.release();
        
    } catch (err) {
        console.error('❌ Error:', err.message);
        throw err;
    } finally {
        await client.logout();
    }

    return results;
}

// Run the check
checkSentEmails()
    .then(results => {
        console.log('\n═══════════════════════════════════════════════════════');
        console.log('📊 VC EMAIL VERIFICATION REPORT (IMAP)');
        console.log('═══════════════════════════════════════════════════════\n');

        // Menlo Ventures
        console.log('🏢 MENLO VENTURES (@menlovc.com)');
        console.log('───────────────────────────────────────────────────────');
        if (results.menlovc.length === 0) {
            console.log('❌ NO EMAILS FOUND in Sent folder (last 90 days)');
        } else {
            console.log(`✅ ${results.menlovc.length} email(s) found:\n`);
            results.menlovc.forEach((email, i) => {
                console.log(`  ${i + 1}. ${email.date || 'N/A'}`);
                console.log(`     To: ${email.to}`);
                console.log(`     Partner: ${email.partnerName || 'N/A'}`);
                console.log(`     Subject: ${email.subject || 'N/A'}`);
                console.log(`     Message ID: ${email.messageId}`);
                console.log();
            });
        }

        // Spark Capital
        console.log('\n🏢 SPARK CAPITAL (@sparkcapital.com)');
        console.log('───────────────────────────────────────────────────────');
        if (results.sparkcapital.length === 0) {
            console.log('❌ NO EMAILS FOUND in Sent folder (last 90 days)');
        } else {
            console.log(`✅ ${results.sparkcapital.length} email(s) found:\n`);
            results.sparkcapital.forEach((email, i) => {
                console.log(`  ${i + 1}. ${email.date || 'N/A'}`);
                console.log(`     To: ${email.to}`);
                console.log(`     Partner: ${email.partnerName || 'N/A'}`);
                console.log(`     Subject: ${email.subject || 'N/A'}`);
                console.log(`     Message ID: ${email.messageId}`);
                console.log();
            });
        }

        // Lightspeed
        console.log('\n🏢 LIGHTSPEED VENTURE PARTNERS (@lsvp.com)');
        console.log('───────────────────────────────────────────────────────');
        if (results.lsvp.length === 0) {
            console.log('❌ NO EMAILS FOUND in Sent folder (last 90 days)');
        } else {
            console.log(`✅ ${results.lsvp.length} email(s) found:\n`);
            results.lsvp.forEach((email, i) => {
                console.log(`  ${i + 1}. ${email.date || 'N/A'}`);
                console.log(`     To: ${email.to}`);
                console.log(`     Partner: ${email.partnerName || 'N/A'}`);
                console.log(`     Subject: ${email.subject || 'N/A'}`);
                console.log(`     Message ID: ${email.messageId}`);
                console.log();
            });
        }

        // Comparison with sent-emails.json
        console.log('\n═══════════════════════════════════════════════════════');
        console.log('📋 COMPARISON WITH sent-emails.json RECORDS');
        console.log('═══════════════════════════════════════════════════════\n');

        // Load both JSON files
        let sentEmailsOld = { vcs: [] };
        let sentEmailsNew = { vcs: [] };
        
        try {
            sentEmailsOld = JSON.parse(fs.readFileSync('/home/andlersrv/.openclaw/workspace/scripts/alygn/lib/sent-emails.json', 'utf8'));
        } catch (e) {
            console.log('⚠️ Could not load scripts/alygn/lib/sent-emails.json');
        }
        
        try {
            sentEmailsNew = JSON.parse(fs.readFileSync('/home/andlersrv/.openclaw/workspace/skills/alygn-outreach/data/sent-emails.json', 'utf8'));
        } catch (e) {
            console.log('⚠️ Could not load skills/alygn-outreach/data/sent-emails.json');
        }

        // Merge both sources
        const allRecords = [...(sentEmailsOld.vcs || []), ...(sentEmailsNew.vcs || [])];
        
        // Check for each VC
        const menloInJson = allRecords.filter(e => e.email && e.email.includes('@menlovc.com'));
        const sparkInJson = allRecords.filter(e => e.email && e.email.includes('@sparkcapital.com'));
        const lsvpInJson = allRecords.filter(e => e.email && e.email.includes('@lsvp.com'));

        console.log('Menlo Ventures:');
        console.log(`  - IMAP Sent Folder: ${results.menlovc.length} emails`);
        console.log(`  - JSON Records: ${menloInJson.length} entries`);
        if (menloInJson.length > 0) {
            menloInJson.forEach(e => {
                console.log(`    • ${e.sentAt || 'N/A'} → ${e.email} (${e.partnerName || 'Unknown'})`);
                console.log(`      Message ID: ${e.messageId || 'N/A'}`);
            });
        }

        console.log('\nSpark Capital:');
        console.log(`  - IMAP Sent Folder: ${results.sparkcapital.length} emails`);
        console.log(`  - JSON Records: ${sparkInJson.length} entries`);
        if (sparkInJson.length > 0) {
            sparkInJson.forEach(e => {
                console.log(`    • ${e.sentAt || 'N/A'} → ${e.email} (${e.partnerName || 'Unknown'})`);
                console.log(`      Message ID: ${e.messageId || 'N/A'}`);
            });
        }

        console.log('\nLightspeed Venture Partners:');
        console.log(`  - IMAP Sent Folder: ${results.lsvp.length} emails`);
        console.log(`  - JSON Records: ${lsvpInJson.length} entries`);
        if (lsvpInJson.length > 0) {
            lsvpInJson.forEach(e => {
                console.log(`    • ${e.sentAt || 'N/A'} → ${e.email} (${e.partnerName || 'Unknown'})`);
                console.log(`      Message ID: ${e.messageId || 'N/A'}`);
            });
        }

        // Summary
        console.log('\n═══════════════════════════════════════════════════════');
        console.log('📊 FINAL SUMMARY - VC CONTACT STATUS');
        console.log('═══════════════════════════════════════════════════════');
        
        const menloContacted = results.menlovc.length > 0 || menloInJson.length > 0;
        const sparkContacted = results.sparkcapital.length > 0 || sparkInJson.length > 0;
        const lsvpContacted = results.lsvp.length > 0 || lsvpInJson.length > 0;

        console.log(`\n🔍 Menlo Ventures (@menlovc.com): ${menloContacted ? '✅ ALREADY CONTACTED' : '❌ NOT CONTACTED'}`);
        console.log(`🔍 Spark Capital (@sparkcapital.com): ${sparkContacted ? '✅ ALREADY CONTACTED' : '❌ NOT CONTACTED'}`);
        console.log(`🔍 Lightspeed (@lsvp.com): ${lsvpContacted ? '✅ ALREADY CONTACTED' : '❌ NOT CONTACTED'}`);
        console.log();

        // Save results
        const outputPath = '/home/andlersrv/.openclaw/workspace/vc-imap-verification.json';
        fs.writeFileSync(outputPath, JSON.stringify({
            checkedAt: new Date().toISOString(),
            imapResults: results,
            jsonRecords: {
                menlovc: menloInJson,
                sparkcapital: sparkInJson,
                lsvp: lsvpInJson
            },
            summary: {
                menlovcContacted: menloContacted,
                sparkContacted: sparkContacted,
                lsvpContacted: lsvpContacted
            }
        }, null, 2));
        console.log(`💾 Detailed results saved to: ${outputPath}`);
        
        return results;
    })
    .catch(err => {
        console.error('Failed:', err);
        process.exit(1);
    });
