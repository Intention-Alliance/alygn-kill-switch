/**
 * ALYGN Outreach Dry-Run Test
 * Tests both VC and Municipal outreach systems
 * Sends test emails to contact@andler.dev
 */

import fs from "fs";
import nodemailer from "nodemailer";
import path from "path";

// Import templates
const { loadSmtpConfig, generateEmail: generateMuniEmail, generateEmailHTML: generateVCEmail } = await import('./lib/utils/outreach-email-template.js');

const SMTP_CONFIG = loadSmtpConfig()
const TEST_EMAIL = 'contact@andler.dev';

/**
 * Create SMTP transporter
 */
function createTransporter() {
  return nodemailer.createTransport({
    host: SMTP_CONFIG.server,
    port: SMTP_CONFIG.port,
    secure: false,
    auth: {
      user: SMTP_CONFIG.user,
      pass: SMTP_CONFIG.password
    }
  });
}

/**
 * Test VC Outreach Email
 */
async function testVCOutreach() {
  console.log('\n📊 VC OUTREACH TEST');
  console.log('=================\n');
  
  // Sample VC data (simulating Khosla Ventures from Notion)
  const vcData = {
    name: 'Khosla Ventures',
    contactName: 'Vinod Khosla',
    painPoints: 'AI governance frameworks, coordination at scale, institutional legitimacy'
  };
  
  console.log('1. Loading VC data:');
  console.log(`   Name: ${vcData.name}`);
  console.log(`   Contact: ${vcData.contactName}`);
  console.log(`   Pain points: ${vcData.painPoints}\n`);
  
  // Generate email using template
  console.log('2. Generating email with vc-outreach-email-template.js...');
  const emailHTML = generateVCEmail(
    vcData.contactName,
    vcData.name,
    vcData.painPoints,
    'governance',
    false // useCid
  );
  
  console.log('   ✅ Email generated\n');
  
  // Verify email content
  console.log('3. Verifying email content:');
  const checks = {
    'Alygn logo embedded': emailHTML.includes('data:image/jpeg;base64') || emailHTML.includes('cid:logo'),
    'Governance-first tone': emailHTML.includes('Governance legitimacy') || emailHTML.includes('coordination'),
    'Personalization (name)': emailHTML.includes(vcData.contactName),
    'Personalization (company)': emailHTML.includes(vcData.name),
    'Footer with social links': emailHTML.includes('alygn.us') && emailHTML.includes('@aialygn'),
    'CTA button': emailHTML.includes('mailto:'),
    'Professional styling': emailHTML.includes('background: linear-gradient')
  };
  
  for (const [check, passed] of Object.entries(checks)) {
    console.log(`   ${passed ? '✅' : '❌'} ${check}`);
  }
  
  // Send test email
  console.log('\n4. Sending test email to ' + TEST_EMAIL + '...');
  
  const mailOptions = {
    from: `Alygn R&D <${SMTP_CONFIG.user}>`,
    to: TEST_EMAIL,
    subject: `[TEST] AI Governance Infrastructure - ${vcData.name}`,
    html: emailHTML,
    text: `TEST EMAIL - VC Outreach\n\nThis is a dry-run test for ${vcData.name}.\n\nContact: ${vcData.contactName}\n\nFull HTML version available separately.`
  };
  
  return { mailOptions, html: emailHTML };
}

/**
 * Test Municipal Outreach Email
 */
async function testMuniOutreach() {
  console.log('\n\n🏛️  MUNICIPAL OUTREACH TEST');
  console.log('========================\n');
  
  // Sample municipality data (from Supabase - Costa Rica pilot)
  const muniData = {
    name: 'San José',
    mayorName: 'Luis Diego Miranda Méndez',
    province: 'San José',
    country: 'Costa Rica',
    painPoints: ['Traffic congestion', 'Rising crime rates', 'Budget shortages'],
    aiInitiatives: ['Smart city security systems', 'Crime data coordination']
  };
  
  console.log('1. Loading municipality data:');
  console.log(`   Name: ${muniData.name}`);
  console.log(`   Mayor: ${muniData.mayorName}`);
  console.log(`   Province: ${muniData.province}\n`);
  
  // Generate personalized content using muni-personalizer logic
  console.log('2. Generating personalized content (simulating muni-personalizer.js)...');
  
  const personalizedBody = `
<p>Estimado Alcalde ${muniData.mayorName.split(' ')[0]},</p>

<p><strong>${muniData.name}</strong> está atravesando la misma transición hacia sistemas de Inteligencia Artificial Avanzada que operan a escala global y sistémica.</p>

<p>Como capital de Costa Rica, ${muniData.name} enfrenta desafíos únicos en <strong>${muniData.painPoints[0].toLowerCase()}</strong> y <strong>${muniData.painPoints[1].toLowerCase()}</strong>, que requieren coordinación institucional antes del despliegue de sistemas de IA.</p>

<p>Alygn funciona como una capa de gobernanza y coordinación neutral—similar a como SWIFT permite coordinación financiera global sin ser un banco.</p>

<h3>Beneficios para ${muniData.name}:</h3>
<ul>
  <li><strong>Alineación Pre-Crisis:</strong> Adoptar protocolos de seguridad antes del despliegue</li>
  <li><strong>Interoperabilidad de Gobernanza:</strong> Supervisión bajo estándar único y neutral</li>
  <li><strong>Protocolos de Emergencia 24/7:</strong> Canales de escalabilidad con Frontier Labs</li>
  <li><strong>Mitigación de Riesgo de Responsabilidad:</strong> Diligencia debida demostrada</li>
</ul>

<p>La gobernanza legítima, no la tecnología, es la infraestructura que escala.</p>
  `.trim();
  
  console.log('   ✅ Personalized content generated\n');
  
  // Generate email using dynamic template
  console.log('3. Building email with outreach-email-template.js (dynamic template)...');
  
  const email = generateMuniEmail({
    recipientName: muniData.mayorName,
    municipality: muniData.name,
    subject: `Alianza Estratégica para la Salvaguarda Institucional - ${muniData.name}`,
    bodyHtml: personalizedBody,
    variant: 'governance',
    footer: 'P.S.: Este mensaje fue generado con IA, verificado por humanos. Transparencia total en nuestros procesos.',
    useCid: false
  });
  
  console.log('   ✅ Email generated\n');
  
  // Verify email content
  console.log('4. Verifying email content:');
  const checks = {
    'Spanish language': email.html.includes('Estimado') && email.html.includes('Saludos'),
    'Municipality name inserted': email.html.includes(muniData.name),
    'Mayor name inserted': email.html.includes(muniData.mayorName.split(' ')[0]),
    'Dynamic content placed': email.html.includes('body-content') && email.html.includes(personalizedBody.substring(0, 50)),
    'Institutional tone': email.html.includes('gobernanza') && email.html.includes('institucional'),
    'Logo embedded': email.html.includes('data:image') || email.html.includes('cid:logo') || email.html.includes('alygn.us/logo.png'),
    'Footer with social links': email.html.includes('alygn.us') && email.html.includes('@aialygn'),
    'P.S. footer': email.html.includes('generado con IA')
  };
  
  for (const [check, passed] of Object.entries(checks)) {
    console.log(`   ${passed ? '✅' : '❌'} ${check}`);
  }
  
  // Send test email
  console.log('\n5. Sending test email to ' + TEST_EMAIL + '...');
  
  const mailOptions = {
    from: `Alygn R&D <${SMTP_CONFIG.user}>`,
    to: TEST_EMAIL,
    subject: `[TEST] ${email.subject}`,
    html: email.html,
    text: `CORREO DE PRUEBA - Alcaldía Municipal\n\nEste es un dry-run test para ${muniData.name}.\n\nAlcalde: ${muniData.mayorName}\n\nVersión HTML completa disponible por separado.`
  };
  
  return { mailOptions, html: email.html };
}

/**
 * Send email via SMTP
 */
async function sendEmail(transporter, mailOptions) {
  try {
    const info = await transporter.sendMail(mailOptions);
    return {
      success: true,
      messageId: info.messageId,
      status: 'sent'
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      status: 'failed'
    };
  }
}

/**
 * Main test runner
 */
async function runTests() {
  console.log('🧪 ALYGN OUTREACH DRY-RUN TESTS');
  console.log('================================\n');
  console.log('Testing both VC and Municipal outreach systems');
  console.log('Test emails will be sent to: ' + TEST_EMAIL);
  
  const results = {
    timestamp: new Date().toISOString(),
    vc: null,
    muni: null,
    smtp: null
  };
  
  try {
    // Test VC Outreach
    const vcTest = await testVCOutreach();
    results.vc = { generated: true, subject: vcTest.mailOptions.subject };
    
    // Test Municipal Outreach
    const muniTest = await testMuniOutreach();
    results.muni = { generated: true, subject: muniTest.mailOptions.subject };
    
    // Send emails via SMTP
    console.log('\n\n📧 SENDING TEST EMAILS');
    console.log('=====================\n');
    
    const transporter = createTransporter();
    console.log('1. SMTP Configuration:');
    console.log(`   Server: ${SMTP_CONFIG.server}`);
    console.log(`   Port: ${SMTP_CONFIG.port}`);
    console.log(`   User: ${SMTP_CONFIG.user}`);
    console.log(`   ✅ SMTP configured\n`);
    
    console.log('2. Sending VC outreach test email...');
    const vcResult = await sendEmail(transporter, vcTest.mailOptions);
    if (vcResult.success) {
      console.log(`   ✅ Sent! Message ID: ${vcResult.messageId}`);
      results.vc.sent = true;
      results.vc.messageId = vcResult.messageId;
    } else {
      console.log(`   ❌ Failed: ${vcResult.error}`);
      results.vc.sent = false;
      results.vc.error = vcResult.error;
    }
    
    console.log('\n3. Sending Municipal outreach test email...');
    const muniResult = await sendEmail(transporter, muniTest.mailOptions);
    if (muniResult.success) {
      console.log(`   ✅ Sent! Message ID: ${muniResult.messageId}`);
      results.muni.sent = true;
      results.muni.messageId = muniResult.messageId;
    } else {
      console.log(`   ❌ Failed: ${muniResult.error}`);
      results.muni.sent = false;
      results.muni.error = muniResult.error;
    }
    
    results.smtp = {
      tested: true,
      working: vcResult.success || muniResult.success,
      server: SMTP_CONFIG.server
    };
    
    // Save HTML versions for review
    console.log('\n\n💾 SAVING HTML VERSIONS');
    console.log('====================\n');
    
    const outputDir = path.join(process.env.HOME, '.openclaw', 'workspace', 'tmp', 'outreach-tests');
    fs.mkdirSync(outputDir, { recursive: true });
    
    const vcHtmlPath = path.join(outputDir, 'vc-outreach-test.html');
    const muniHtmlPath = path.join(outputDir, 'muni-outreach-test.html');
    
    fs.writeFileSync(vcHtmlPath, vcTest.html);
    console.log(`1. VC email saved: ${vcHtmlPath}`);
    
    fs.writeFileSync(muniHtmlPath, muniTest.html);
    console.log(`2. Muni email saved: ${muniHtmlPath}`);
    
    // Summary
    console.log('\n\n📊 TEST SUMMARY');
    console.log('===============\n');
    
    console.log('✅ VC Outreach:');
    console.log(`   - Email generated: ${results.vc.generated}`);
    console.log(`   - Email sent: ${results.vc.sent ? 'YES' : 'NO'}`);
    if (results.vc.messageId) console.log(`   - Message ID: ${results.vc.messageId}`);
    if (results.vc.error) console.log(`   - Error: ${results.vc.error}`);
    
    console.log('\n✅ Municipal Outreach:');
    console.log(`   - Email generated: ${results.muni.generated}`);
    console.log(`   - Email sent: ${results.muni.sent ? 'YES' : 'NO'}`);
    if (results.muni.messageId) console.log(`   - Message ID: ${results.muni.messageId}`);
    if (results.muni.error) console.log(`   - Error: ${results.muni.error}`);
    
    console.log('\n✅ SMTP Status:');
    console.log(`   - Server: ${results.smtp.server}`);
    console.log(`   - Working: ${results.smtp.working ? 'YES' : 'NO'}`);
    
    // Blockers
    console.log('\n\n🚧 BLOCKERS FOR PRODUCTION');
    console.log('========================\n');
    
    const blockers = [];
    
    if (!results.vc.sent) blockers.push('VC email sending failed');
    if (!results.muni.sent) blockers.push('Municipal email sending failed');
    if (!results.smtp.working) blockers.push('SMTP not working');
    
    // Check for template issues
    if (!vcTest.html.includes('data:image') && !vcTest.html.includes('cid:logo')) {
      blockers.push('VC template: Logo not embedded (check logo path)');
    }
    
    if (!muniTest.html.includes('data:image') && !muniTest.html.includes('cid:logo') && !muniTest.html.includes('alygn.us/logo.png')) {
      blockers.push('Muni template: Logo fallback to hosted URL (verify URL is valid)');
    }
    
    if (blockers.length === 0) {
      console.log('🎉 NO BLOCKERS - Ready for production deployment!');
    } else {
      console.log('⚠️  Blockers found:');
      blockers.forEach((b, i) => console.log(`   ${i + 1}. ${b}`));
    }
    
    // Save test results
    const resultsPath = path.join(outputDir, 'test-results.json');
    fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
    console.log(`\n💾 Full results saved: ${resultsPath}`);
    
    return results;
    
  } catch (error) {
    console.error('\n❌ Test failed with error:', error.message);
    console.error(error.stack);
    results.error = error.message;
    return results;
  }
}

// Run tests
runTests()
  .then(results => {
    console.log('\n✅ Tests complete!\n');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n💥 Fatal error:', error.message);
    process.exit(1);
  });
