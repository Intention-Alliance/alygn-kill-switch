/**
 * Final Email Generator with HTML Body Content
 * Wraps bodyHtml with official Alygn template (handles greeting, intro, closing)
 * 
 * Usage:
 *   node generate-final-emails.js --input=/tmp/muni-cr-with-html.json --output=/tmp/muni-cr-final.json
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load official Alygn email template
const templatePath = path.join(__dirname, '../../lib/outreach-email-template.js');
const emailTemplate = await import(templatePath);

function generateFinalEmails(inputFile, outputFile) {
  console.log(`📧 Generating final emails from ${inputFile}...\n`);
  
  const data = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
  const municipalities = data.municipalities || data;
  
  const final = municipalities.map((muni) => {
    const outreach = muni.outreach;
    const mayorName = muni.contacts?.mayor_name || 'Alcalde/Alcaldesa';
    
    // Generate email using official template
    // The template handles: greeting, variant intro, bodyHtml injection, closing, CTA, footer
    const email = emailTemplate.generateEmail({
      recipientName: mayorName,
      municipality: muni.name,
      painPoints: '', // Template handles pain points separately if needed
      subject: outreach.subject,
      bodyHtml: outreach.bodyHtml,  // Middle content only (no greeting/closing)
      bodyText: outreach.body,       // Plain text fallback
      variant: outreach.variant || 'governance',
      footer: outreach.footer || 'P.D.: Esta comunicación fue asistida por IA y revisada por humanos. Transparencia total en nuestros procesos.',
      useCid: false
    });
    
    console.log(`✅ ${muni.name}: ${email.subject}`);
    
    return {
      ...muni,
      outreach: {
        ...outreach,
        finalHtml: email.html,    // Full wrapped HTML with header/footer
        finalText: email.text || outreach.body,
        final_generated_at: new Date().toISOString()
      }
    };
  });
  
  const output = {
    generated_at: new Date().toISOString(),
    count: final.length,
    municipalities: final
  };
  
  fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));
  console.log(`\n💾 Saved to ${outputFile}`);
  console.log(`\n✅ All emails ready with proper HTML structure!`);
  
  // Save first email as preview
  if (final.length > 0) {
    const previewFile = outputFile.replace('.json', '-PREVIEW.html');
    fs.writeFileSync(previewFile, final[0].outreach.finalHtml);
    console.log(`\n👁️  Preview saved to ${previewFile} (first email)`);
  }
  
  return output;
}

// CLI
if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  const args = process.argv.slice(2);
  const inputArg = args.find(a => a.startsWith('--input='));
  const outputArg = args.find(a => a.startsWith('--output='));
  
  if (!inputArg) {
    console.error('Usage: node generate-final-emails.js --input=/tmp/muni-cr-with-html.json [--output=file.json]');
    process.exit(1);
  }
  
  const inputFile = inputArg.split('=')[1];
  const outputFile = outputArg ? outputArg.split('=')[1] : '/tmp/muni-cr-final.json';
  
  try {
    generateFinalEmails(inputFile, outputFile);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

export { generateFinalEmails };
