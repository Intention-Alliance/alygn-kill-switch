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

const currentDate = new Date().toLocaleDateString('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric'
});

console.log(`📧 Gmail Reply Fetch - ${currentDate}\n`);

const imap = new Imap(imapConfig);

async function fetchReplies() {
  return new Promise((resolve, reject) => {
    imap.once('ready', async () => {
      console.log('✅ IMAP connected to Gmail');
      
      imap.openBox('INBOX', false, async (err, box) => {
        if (err) {
          reject(err);
          return;
        }
        
        console.log('✅ INBOX opened\n');
        
        // Search for unread emails from last 30 days
        const searchCriteria = ['UNSEEN'];
        
        // First search, then fetch
        imap.search(searchCriteria, (err, results) => {
          if (err) {
            reject(err);
            return;
          }
          
          console.log(`🔍 Search results: ${results.length} unread emails`);
          
          if (results.length === 0) {
            console.log('✅ No unread emails found');
            imap.end();
            resolve([]);
            return;
          }
          
          const f = imap.fetch(results, { bodies: '' });
        const emails = [];
        
        f.on('message', (msg) => {
          msg.on('body', (stream) => {
            simpleParser(stream, (err, parsed) => {
              if (!err) {
                // Filter for Alygn-related or outreach replies
                const isRelevant = 
                  parsed.subject?.toLowerCase().includes('alygn') ||
                  parsed.subject?.toLowerCase().includes('traiga') ||
                  parsed.subject?.toLowerCase().includes('municipal') ||
                  parsed.subject?.toLowerCase().includes('ai governance') ||
                  parsed.subject?.toLowerCase().includes('ai risk') ||
                  parsed.subject?.toLowerCase().includes('coordination') ||
                  parsed.from?.value?.some(f => f.address?.includes('alygn')) ||
                  // Check if this looks like a reply to our outreach
                  parsed.inReplyTo ||
                  parsed.references;
                
                if (isRelevant) {
                  emails.push({
                    subject: parsed.subject,
                    from: parsed.from?.text,
                    fromAddress: parsed.from?.value?.[0]?.address,
                    to: parsed.to?.text,
                    date: parsed.date?.toISOString(),
                    text: parsed.text?.substring(0, 3000),
                    html: parsed.html?.substring(0, 3000),
                    inReplyTo: parsed.inReplyTo,
                    messageId: parsed.messageId
                  });
                }
              }
            });
          });
        });
        
        f.once('error', (err) => {
          reject(err);
        });
        
          f.once('end', () => {
            console.log(`📬 Total relevant emails found: ${emails.length}`);
            imap.end();
            resolve(emails);
          });
        });
      });
    });
    
    imap.once('error', (err) => {
      reject(err);
    });
    
    imap.connect();
  });
}

fetchReplies()
  .then(emails => {
    console.log('\n📧 Alygn-related replies found:\n');
    emails.forEach((email, i) => {
      console.log(`${i + 1}. Subject: ${email.subject}`);
      console.log(`   From: ${email.from} <${email.fromAddress}>`);
      console.log(`   Date: ${new Date(email.date).toLocaleString()}`);
      console.log(`   Preview: ${email.text?.substring(0, 200).replace(/\n/g, ' ')}...\n`);
    });
    
    // Save to file for classification
    import('fs').then(fs => {
      fs.writeFileSync('/tmp/fetched-emails.json', JSON.stringify(emails, null, 2));
      console.log('💾 Saved to /tmp/fetched-emails.json for classification\n');
    });
    
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
  });
