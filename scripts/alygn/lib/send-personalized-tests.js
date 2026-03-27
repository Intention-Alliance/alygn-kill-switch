/**
 * Send 4 Test Emails with Updated Personalization
 * Uses NEW personalization specifications from docs/alygn-outreach-cronjobs-PERSONALIZED.json
 * 
 * Recreates the emails inline with customBody and customPS support
 */

import { createEmailService } from './email-sender.js';
import template from './outreach-email-template.js';

async function sendPersonalizedTests() {
  console.log('🎯 Sending 4 Test Emails with Updated Personalization\n');
  console.log('All emails will be redirected to: contact@andler.dev\n');

  // Create email service with test mode
  const service = await createEmailService('smtp');
  service.setTestEmail('contact@andler.dev');

  // Define the 4 emails with NEW personalization
  const emails = [
    {
      id: 1,
      name: 'Harpi Singh',
      company: 'Innovation Endeavors',
      originalEmail: 'harpi@innovationendeavors.com',
      subject: 'Research-Driven AI Coordination for Enterprise',
      variant: 'governance',
      language: 'en',
      painPoints: ['AI coordination failures', 'governance infrastructure gaps', 'institutional preparedness'],
      customBody: "Given Innovation Endeavors' investment in AI convergence companies and your Stanford GSB lectures on Research-Driven Ideation, you understand the importance of governance infrastructure for intelligent software...",
      customPS: 'P.S.: I noticed your work on the Super Evolution thesis aligns with our coordination thesis for AI governance infrastructure.'
    },
    {
      id: 2,
      name: 'Josh Wolfe',
      company: 'Lux Capital',
      originalEmail: 'josh@luxcapital.com',
      subject: 'The Future of AI Infrastructure: Beyond Data Center CapEx',
      variant: 'governance',
      language: 'en',
      painPoints: ['AI infrastructure', 'data center CapEx', 'distributed coordination'],
      customBody: 'Given your recent critique of massive data center CapEx and Lux\'s investment in Physical Intelligence and Anduril, you understand the governance infrastructure gap we\'re addressing...',
      customPS: 'P.S.: Your contrarian view on AI infrastructure spending directly resonates with our approach to distributed AI coordination.'
    },
    {
      id: 3,
      name: 'Michael Stewart',
      company: 'M12',
      originalEmail: 'michael@m12.vc',
      subject: 'Enterprise AI Governance for the Microsoft Ecosystem',
      variant: 'governance',
      language: 'en',
      painPoints: ['enterprise AI', 'proprietary data moats', 'Microsoft ecosystem coordination'],
      customBody: 'Given M12\'s focus on enterprise AI with proprietary data moats and your background in AI systems, you understand the coordination challenges Microsoft customers face...',
      customPS: 'P.S.: Having backed enterprise AI companies like Typeface, you recognize the governance infrastructure gap in the Microsoft ecosystem.'
    },
    {
      id: 4,
      name: 'Alcalde San José',
      company: 'San José',
      originalEmail: 'jvasquez@msj.go.cr',
      subject: 'Apoyo en Implementación de Gobernanza de IA - TRAIGA',
      variant: 'traiga',
      language: 'es',
      painPoints: ['coordinación institucional', 'gobernanza digital', 'infraestructura'],
      customBody: 'Dado su liderazgo en la modernización de servicios digitales en San José y el reciente anuncio sobre transformación digital, entiende la importancia de la coordinación institucional...',
      customPS: 'P.D.: Como pioneros en implementación de gobernanza de IA en Costa Rica, su municipio tiene la oportunidad de liderar la región en coordinación institucional. Este mensaje fue generado con IA y verificado por humanos.'
    }
  ];

  const results = [];
  let successCount = 0;
  let errorCount = 0;

  for (const email of emails) {
    try {
      console.log(`📧 [${email.id}/4] ${email.name} (${email.company})`);
      console.log(`   Subject: ${email.subject}`);
      console.log(`   Original recipient: ${email.originalEmail}`);

      // Generate email with personalization
      const generatorFn = email.language === 'es' 
        ? template.generateEmail 
        : template.generateEmailHTML;

      const emailData = generatorFn({
        recipientName: email.name,
        companyName: email.company,
        painPoints: email.painPoints,
        variant: email.variant,
        language: email.language,
        subject: email.subject
      });

      // Inject custom body and PS into the HTML
      let personalizedHtml = emailData.html;

      // Find the intro paragraph and replace with custom body
      const introMatch = personalizedHtml.match(/<p[^>]*>[\s\S]*?<\/p>/);
      if (introMatch && email.customBody) {
        const newIntro = `<p style="margin: 16px 0; line-height: 1.6;">${email.customBody}</p>`;
        personalizedHtml = personalizedHtml.replace(introMatch[0], newIntro);
      }

      // Find the PS section and replace with custom PS
      const psMatch = personalizedHtml.match(/<p class="ps">[\s\S]*?<\/p>/);
      if (psMatch && email.customPS) {
        const newPS = `<p class="ps">${email.customPS}</p>`;
        personalizedHtml = personalizedHtml.replace(psMatch[0], newPS);
      }

      // Send the email
      const result = await service.sendEmail({
        to: email.originalEmail,
        subject: email.subject,
        html: personalizedHtml,
        text: emailData.text,
        from: 'Alygn R&D <alyyygn@gmail.com>'
      });

      const status = result.success ? '✓ SENT' : '✗ FAILED';
      console.log(`   ${status}`);
      console.log(`   Message ID: ${result.messageId || 'N/A'}`);
      console.log(`   Body personalization: ${email.customBody ? '✓ INCLUDED' : '✗ MISSING'}`);
      console.log(`   PS/P.D.: ${email.customPS ? '✓ INCLUDED' : '✗ MISSING'}`);
      console.log();

      results.push({
        id: email.id,
        name: email.name,
        company: email.company,
        subject: email.subject,
        originalTo: email.originalEmail,
        redirectedTo: 'contact@andler.dev',
        status: result.success ? 'SENT' : 'FAILED',
        messageId: result.messageId || null,
        bodyPersonalization: email.customBody ? 'INCLUDED' : 'MISSING',
        psPersonalization: email.customPS ? 'INCLUDED' : 'MISSING',
        error: result.error || null
      });

      if (result.success) {
        successCount++;
      } else {
        errorCount++;
      }
    } catch (error) {
      errorCount++;
      console.log(`   ✗ ERROR: ${error.message}`);
      console.log();

      results.push({
        id: email.id,
        name: email.name,
        company: email.company,
        subject: email.subject,
        originalTo: email.originalEmail,
        status: 'ERROR',
        error: error.message
      });
    }
  }

  // Print summary
  console.log('========== SUMMARY ==========');
  console.log(`Total: ${emails.length} | Success: ${successCount} | Failed: ${errorCount}`);
  console.log('\nAll emails redirected to: contact@andler.dev');
  console.log('\nDetailed Results:');
  
  results.forEach((r) => {
    console.log(`\n${r.id}. ${r.name} (${r.company})`);
    console.log(`   Subject: ${r.subject}`);
    console.log(`   Original recipient: ${r.originalTo}`);
    console.log(`   Status: ${r.status}`);
    console.log(`   Body personalization: ${r.bodyPersonalization}`);
    console.log(`   PS/P.D.: ${r.psPersonalization}`);
    if (r.messageId) console.log(`   Message ID: ${r.messageId}`);
    if (r.error) console.log(`   Error: ${r.error}`);
  });

  return { successCount, errorCount, results };
}

// Run
sendPersonalizedTests().catch(console.error);
