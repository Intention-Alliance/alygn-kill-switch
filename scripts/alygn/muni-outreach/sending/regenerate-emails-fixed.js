/**
 * Regenerate Emails with Fixed Template
 * Re-generates HTML emails using the updated outreach-email-template.js
 * with proper logo embedding and white wordmark
 * 
 * Usage:
 *   node regenerate-emails-fixed.js
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load official Alygn email template
const templatePath = path.join(__dirname, '../../lib/outreach-email-template.js');
const emailTemplate = await import(templatePath);

// Load approved municipalities
const inputFile = '/tmp/muni-cr-approved-html.json';
const municipalities = JSON.parse(fs.readFileSync(inputFile, 'utf8'));

console.log(`🔧 Regenerating ${municipalities.length} emails with fixed template...\n`);

const regenerated = municipalities.map((muni, index) => {
  const outreach = muni.outreach;
  const mayorName = muni.contacts?.mayor_name || 'Alcalde/Alcaldesa';
  
  // Convert plain text body to HTML if needed
  const bodyHtml = outreach.bodyHtml || `<p>${outreach.body.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>`;
  
  // Generate email using new dynamic API
  const email = emailTemplate.generateEmail({
    recipientName: mayorName,
    municipality: muni.name,
    subject: outreach.subject,
    bodyHtml: bodyHtml,
    bodyText: outreach.body,
    variant: outreach.variant || 'institutional',
    footer: outreach.footer,
    useCid: false // Use base64 inline (more compatible)
  });
  
  console.log(`✅ ${muni.name}: ${email.subject}`);
  
  return {
    ...muni,
    outreach: {
      ...outreach,
      bodyHtml: email.html,
      body: email.text
    }
  };
});

// Save regenerated emails
const outputFile = '/tmp/muni-cr-approved-fixed-v2.json';
fs.writeFileSync(outputFile, JSON.stringify(regenerated, null, 2));

console.log(`\n💾 Saved to ${outputFile}`);
console.log(`\n✨ Fixes applied:`);
console.log(`   1. Logo: Base64 + fallback to hosted URL`);
console.log(`   2. Wordmark "ALYGN": White color (#ffffff) with !important`);
console.log(`   3. Better responsive layout`);
console.log(`\n📧 Ready for approval and send!`);
