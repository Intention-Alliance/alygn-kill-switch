#!/usr/bin/env node
/**
 * Check Gmail Sent folder via IMAP for VC outreach emails
 */

import { ImapFlow } from 'imapflow';
import fs from 'fs';

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
        const lock = await client.getMailboxLock('[Gmail]/Sent Mail');
        console.log('📧 Opened Sent Mail folder');

        // Calculate date 90 days ago
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        const sinceDate = ninetyDaysAgo.toISOString().split('T')[0];
        console.log(`📅 Searching emails since: ${sinceDate}`);

        // Search for emails to target domains
        for (const domain of TARGET_DOMAINS) {
            console.log(`\n🔍 Searching for emails to *@${domain}...`);
            
            // Search for messages to this domain
            const searchCriteria = {
                to: { includes: domain },
                since: sinceDate
            };

            const messages = await client.search(searchCriteria);
            console.log(`   Found ${messages.length} emails`);

            if (messages.length > 0) {
                for (const uid of messages) {
                    try {
                        const message = await client.fetchOne(uid, { 
                            envelope: true,
                            headers: ['to', 'from', 'subject', 'message-id', 'date']
                        });
                        
                        if (message) {
                            const toAddresses = message.envelope?.to || [];
                            const fromAddresses = message.envelope?.from || [];
                            
                            // Only include if sent from alyyygn@gmail.com
                            const isSentFromUs = fromAddresses.some(addr => 
                                addr.address === 'alyyygn@gmail.com'
                            );

                            if (isSentFromUs) {
                                const emails = toAddresses.map(a => a.address).join(', ');
                                const partnerName = toAddresses.map(a => a.name || '').filter(n => n).join(', ');
                                const domainKey = domain.replace(/\.com$/, '');
                                
                                if (domain === 'menlovc.com') results.menlovc.push({
                                    date: message.envelope.date,
                                    to: emails,
                                    partnerName,
                                    subject: message.envelope.subject,
                                    messageId: message.headers?.get('message-id')?.[0] || `uid-${uid}`
                                });
                                else if (domain === 'sparkcapital.com') results.sparkcapital.push({
                                    date: message.envelope.date,
                                    to: emails,
                                    partnerName,
                                    subject: message.envelope.subject,
                                    messageId: message.headers?.get('message-id')?.[0] || `uid-${uid}`
                                });
                                else if (domain === 'lsvp.com') results.lsvp.push({
                                    date: message.envelope.date,
                                    to: emails,
                                    partnerName,
                                    subject: message.envelope.subject,
                                    messageId: message.headers?.get('message-id')?.[0] || `uid-${uid}`
                                });
                            }
                        }
                    } catch (err) {
                        console.log(`   ⚠️ Error fetching message ${uid}: ${err.message}`);
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
        console.log('📊 VC EMAIL VERIFICATION REPORT');
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
        console.log('📋 COMPARISON WITH sent-emails.json');
        console.log('═══════════════════════════════════════════════════════\n');

        const sentEmails = JSON.parse(fs.readFileSync('/home/andlersrv/.openclaw/workspace/scripts/alygn/lib/sent-emails.json', 'utf8'));
        
        // Check for each VC
        const menloInJson = sentEmails.vcs.filter(e => e.email.includes('@menlovc.com'));
        const sparkInJson = sentEmails.vcs.filter(e => e.email.includes('@sparkcapital.com'));
        const lsvpInJson = sentEmails.vcs.filter(e => e.email.includes('@lsvp.com'));

        console.log('Menlo Ventures:');
        console.log(`  - IMAP Found: ${results.menlovc.length} emails`);
        console.log(`  - JSON Records: ${menloInJson.length} entries`);
        if (menloInJson.length > 0) {
            menloInJson.forEach(e => {
                console.log(`    • ${e.sentAt} → ${e.email} (${e.partnerName})`);
            });
        }

        console.log('\nSpark Capital:');
        console.log(`  - IMAP Found: ${results.sparkcapital.length} emails`);
        console.log(`  - JSON Records: ${sparkInJson.length} entries`);
        if (sparkInJson.length > 0) {
            sparkInJson.forEach(e => {
                console.log(`    • ${e.sentAt} → ${e.email} (${e.partnerName})`);
            });
        }

        console.log('\nLightspeed:');
        console.log(`  - IMAP Found: ${results.lsvp.length} emails`);
        console.log(`  - JSON Records: ${lsvpInJson.length} entries`);
        if (lsvpInJson.length > 0) {
            lsvpInJson.forEach(e => {
                console.log(`    • ${e.sentAt} → ${e.email} (${e.partnerName})`);
            });
        }

        // Summary
        console.log('\n═══════════════════════════════════════════════════════');
        console.log('📊 SUMMARY');
        console.log('═══════════════════════════════════════════════════════');
        const menloContacted = results.menlovc.length > 0 || menloInJson.length > 0;
        const sparkContacted = results.sparkcapital.length > 0 || sparkInJson.length > 0;
        const lsvpContacted = results.lsvp.length > 0 || lsvpInJson.length > 0;

        console.log(`\n✅ Menlo Ventures: ${menloContacted ? 'ALREADY CONTACTED' : 'NOT CONTACTED'}`);
        console.log(`✅ Spark Capital: ${sparkContacted ? 'ALREADY CONTACTED' : 'NOT CONTACTED'}`);
        console.log(`✅ Lightspeed: ${lsvpContacted ? 'ALREADY CONTACTED' : 'NOT CONTACTED'}`);
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
        console.log(`💾 Results saved to: ${outputPath}`);
    })
    .catch(err => {
        console.error('Failed:', err);
        process.exit(1);
    });
