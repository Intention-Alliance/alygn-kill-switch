import path from 'path';
import { EmailService } from path.join(process.env.HOME, '.openclaw/workspace/scripts/alygn/lib/email/EmailService.js');
import fs from 'fs';

async function sendTestEmails() {
  const service = new EmailService('smtp', {
    server: 'smtp.gmail.com',
    port: 587,
    user: 'alyyygn@gmail.com',
    password: 'pvjktbdzkgimrzlw'
  });

  // Redirect to test email
  service.setTestEmail('contact@andler.dev');

  const drafts = [
    { file: '/tmp/alygn-drafts/harpi-singh-innovation-endeavors.html', to: 'harpi@innovationendeavors.com', subject: 'Research-Driven AI Coordination for Enterprise' },
    { file: '/tmp/alygn-drafts/josh-wolfe-lux-capital.html', to: 'josh@luxcapital.com', subject: 'The Future of AI Infrastructure: Beyond Data Center CapEx' },
    { file: '/tmp/alygn-drafts/michael-stewart-m12.html', to: 'michael@m12.vc', subject: 'Enterprise AI Governance for the Microsoft Ecosystem' },
    { file: '/tmp/alygn-drafts/alcalde-san-jose.html', to: 'jvasquez@msj.go.cr', subject: 'Apoyo en Implementación de Gobernanza de IA - TRAIGA' }
  ];

  const results = [];
  let successCount = 0;
  let errorCount = 0;

  for (const draft of drafts) {
    try {
      console.log(`Sending: ${draft.subject}`);
      const html = fs.readFileSync(draft.file, 'utf8');
      const result = await service.sendEmail({
        to: draft.to,
        subject: draft.subject,
        html: html,
        from: 'Alygn R&D <alyyygn@gmail.com>'
      });

      results.push({
        subject: draft.subject,
        originalTo: draft.to,
        status: result.success ? 'SENT' : 'FAILED',
        messageId: result.messageId || null,
        error: result.error || null,
        testMode: result.testMode
      });

      if (result.success) {
        successCount++;
        console.log(`  ✓ Sent successfully`);
      } else {
        errorCount++;
        console.log(`  ✗ Failed: ${result.error}`);
      }
    } catch (error) {
      errorCount++;
      results.push({
        subject: draft.subject,
        originalTo: draft.to,
        status: 'ERROR',
        error: error.message
      });
      console.log(`  ✗ Error: ${error.message}`);
    }
  }

  console.log('\n========== SUMMARY ==========');
  console.log(`Total: ${drafts.length} | Success: ${successCount} | Failed: ${errorCount}`);
  console.log('\nAll emails redirected to: contact@andler.dev');
  console.log('\nDetailed Results:');
  results.forEach((r, i) => {
    console.log(`\n${i + 1}. ${r.subject}`);
    console.log(`   Original recipient: ${r.originalTo}`);
    console.log(`   Status: ${r.status}`);
    if (r.error) console.log(`   Error: ${r.error}`);
  });

  return { successCount, errorCount, results };
}

sendTestEmails().catch(console.error);
