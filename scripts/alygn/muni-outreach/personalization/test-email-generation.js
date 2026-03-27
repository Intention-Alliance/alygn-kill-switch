/**
 * Dry-run test for HTML email generation
 * Verifies the structure without sending
 * 
 * Usage:
 *   node test-email-generation.js --input=/tmp/muni-cr-with-html.json
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load official Alygn email template
const templatePath = path.join(__dirname, '../../lib/outreach-email-template.js');
const emailTemplate = await import(templatePath);

function testEmailGeneration(inputFile) {
  console.log(`🧪 DRY-RUN: Testing email generation from ${inputFile}\n`);
  
  const data = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
  const municipalities = data.municipalities || data;
  
  console.log(`Testing ${municipalities.length} municipalities...\n`);
  
  const results = municipalities.map((muni, index) => {
    const outreach = muni.outreach;
    const mayorName = muni.contacts?.mayor_name || 'Alcalde/Alcaldesa';
    
    // Build email using same logic as sender
    const bodyHtml = outreach.bodyHtml || `<p>${outreach.body.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>`;
    
    const email = emailTemplate.generateEmail({
      recipientName: mayorName,
      municipality: muni.name,
      painPoints: '',
      subject: outreach.subject,
      bodyHtml: bodyHtml,
      bodyText: outreach.body,
      variant: outreach.variant || 'governance',
      footer: outreach.footer || 'P.D.: Esta comunicación fue asistida por IA y revisada por humanos.',
      useCid: false
    });
    
    // Verify structure
    const hasGreeting = email.html.includes('Estimado/a');
    const hasVariantIntro = email.html.includes('Alygn es una institución independiente') || 
                            email.html.includes('Alygn es una institución independiente');
    const hasBodyContent = email.html.includes('Nuestra alianza no es una contratación');
    const hasClosing = email.html.includes('Esperando explorar esto con usted');
    const hasCTA = email.html.includes('cta-button');
    const hasFooter = email.html.includes('footer');
    
    const checks = {
      hasGreeting,
      hasVariantIntro,
      hasBodyContent,
      hasClosing,
      hasCTA,
      hasFooter
    };
    
    const allPassed = Object.values(checks).every(v => v);
    
    console.log(`[${index + 1}] ${muni.name}:`);
    console.log(`   Subject: ${email.subject}`);
    console.log(`   Variant: ${outreach.variant || 'governance'}`);
    console.log(`   ✓ Greeting: ${hasGreeting ? 'YES' : 'NO'}`);
    console.log(`   ✓ Variant Intro: ${hasVariantIntro ? 'YES' : 'NO'}`);
    console.log(`   ✓ Body Content: ${hasBodyContent ? 'YES' : 'NO'}`);
    console.log(`   ✓ Closing: ${hasClosing ? 'YES' : 'NO'}`);
    console.log(`   ✓ CTA Button: ${hasCTA ? 'YES' : 'NO'}`);
    console.log(`   ✓ Footer: ${hasFooter ? 'YES' : 'NO'}`);
    console.log(`   ${allPassed ? '✅ PASS' : '❌ FAIL'}\n`);
    
    return {
      name: muni.name,
      allPassed,
      checks,
      htmlLength: email.html.length
    };
  });
  
  const passed = results.filter(r => r.allPassed).length;
  const failed = results.filter(r => !r.allPassed).length;
  
  console.log(`\n📊 DRY-RUN SUMMARY:`);
  console.log(`   Total: ${results.length}`);
  console.log(`   Passed: ${passed}`);
  console.log(`   Failed: ${failed}`);
  
  if (failed > 0) {
    console.log(`\n⚠️  Some checks failed. Review the output above.`);
    process.exit(1);
  } else {
    console.log(`\n✅ All emails structured correctly! Ready for sending.`);
    console.log(`\n💾 Full HTML saved to /tmp/muni-cr-with-html.json`);
    console.log(`\n📧 To send (when ready):`);
    console.log(`   node scripts/alygn/muni-outreach/sending/email-sender-smtp-v2.js --input=/tmp/muni-cr-with-html.json --approved`);
  }
  
  return results;
}

// CLI
if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  const args = process.argv.slice(2);
  const inputArg = args.find(a => a.startsWith('--input='));
  
  if (!inputArg) {
    console.error('Usage: node test-email-generation.js --input=/tmp/muni-cr-with-html.json');
    process.exit(1);
  }
  
  const inputFile = inputArg.split('=')[1];
  
  try {
    testEmailGeneration(inputFile);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

export { testEmailGeneration };
