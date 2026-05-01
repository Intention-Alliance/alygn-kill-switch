import Imap from 'imap';
import { simpleParser } from 'mailparser';

const imapConfig = {
  user: 'alyyygn@gmail.com',
  password: 'pvjktbdzkgimrzlw',
  host: 'imap.gmail.com',
  port: 993,
  tls: true,
  tlsOptions: { rejectUnauthorized: false }
};

const imap = new Imap(imapConfig);
const emails = [];

imap.once('ready', () => {
  console.log('✅ IMAP connected');
  imap.openBox('INBOX', false, (err, box) => {
    if (err) {
      console.error('❌ Error opening INBOX:', err);
      process.exit(1);
    }
    console.log('✅ INBOX opened');
    
    // Search for unread emails from last 7 days
    const searchCriteria = ['UNSEEN'];
    const f = imap.fetch(searchCriteria, { bodies: '' });
    
    f.on('message', (msg) => {
      msg.on('body', (stream) => {
        simpleParser(stream, (err, parsed) => {
          if (!err) {
            emails.push({
              subject: parsed.subject,
              from: parsed.from?.text,
              fromAddress: parsed.from?.value?.[0]?.address,
              date: parsed.date?.toISOString(),
              text: parsed.text?.substring(0, 500),
              html: parsed.html?.substring(0, 500)
            });
          }
        });
      });
    });
    
    f.once('error', (err) => {
      console.error('❌ Fetch error:', err);
      imap.end();
    });
    
    f.once('end', () => {
      console.log(`\n📬 Total emails found: ${emails.length}`);
      
      // Filter Alygn-related
      const alygnEmails = emails.filter(e => 
        e.subject?.toLowerCase().includes('alygn') ||
        e.subject?.toLowerCase().includes('intention alliance') ||
        e.fromAddress?.includes('alygn')
      );
      
      console.log(`🎯 Alygn-related replies: ${alygnEmails.length}\n`);
      
      if (alygnEmails.length === 0) {
        console.log('⚠️  No new Alygn replies to process');
        imap.end();
        process.exit(0);
      }
      
      // Output for processing
      console.log('=== EMAILS FOR CLASSIFICATION ===');
      alygnEmails.forEach((email, idx) => {
        console.log(`\n--- EMAIL ${idx + 1} ---`);
        console.log(`Subject: ${email.subject}`);
        console.log(`From: ${email.from} (${email.fromAddress})`);
        console.log(`Date: ${email.date}`);
        console.log(`Body preview: ${email.text || email.html}`);
      });
      
      // Save to file for classification
      import('fs').then(({ writeFileSync }) => {
        writeFileSync('/tmp/alygn-replies.json', JSON.stringify(alygnEmails, null, 2));
        console.log('\n💾 Saved to /tmp/alygn-replies.json');
        imap.end();
        process.exit(0);
      });
    });
  });
});

imap.once('error', (err) => {
  console.error('❌ IMAP error:', err);
  process.exit(1);
});

imap.connect();
