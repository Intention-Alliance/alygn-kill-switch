/**
 * ALYGN Outreach Email Template (Governance-First v4)
 * - Independent AI governance institution positioning
 * - Institutional restraint and neutral tone
 * - No product claims, no hype
 * - Focus: coordination, legitimacy, preparedness
 * - Updated: Feb 10, 2026 (context update)
 * 
 * Usage:
 *   import template from "./outreach-email-template.js";
 *   
 *   // Generate email with dynamic parameters
 *   const email = template.generateEmail({
 *     recipientName: 'Diego Miranda',
 *     municipality: 'San José',
 *     subject: 'TRAIGA Act: Protección de integridad humana',
 *     bodyHtml: '<p>Custom HTML content...</p>',
 *     variant: 'institutional'
 *   });
 */

import fs from "fs";
import path from "path";

/**
 * Generate email with dynamic parameters
 * @param {Object} params - Email parameters
 * @param {string} params.recipientName - Recipient name (e.g., "Diego Miranda")
 * @param {string} params.municipality - Municipality/canton name (e.g., "San José")
 * @param {string} params.subject - Email subject
 * @param {string} params.bodyHtml - Custom HTML body content
 * @param {string} params.bodyText - Plain text version (fallback)
 * @param {string} params.variant - Email variant (governance|institutional|traiga)
 * @param {string} params.footer - Custom footer (optional)
 * @param {boolean} params.useCid - Use CID for logo (default: false = base64)
 * @returns {Object} { subject, html, text }
 */
function generateEmail(params) {
  const {
    recipientName = 'there',
    municipality = '',
    subject = '',
    bodyHtml = '',
    bodyText = '',
    variant = 'governance',
    footer = '',
    useCid = false
  } = params;
  
  const logoPath = path.join(process.env.HOME, '.openclaw', 'workspace', 'media', 'alygn', 'avatar_400x400-transparent.png');
  const logoBase64 = getBase64Image(logoPath);
  
  if (useCid) {
    logoImg = `<img src="cid:logo" alt="ALYGN" style="width: 40px; height: 40px; border-radius: 4px; display: block;">`;
  } else if (logoBase64) {
    logoImg = `<img src="data:image/jpeg;base64,${logoBase64}" alt="ALYGN" style="width: 40px; height: 40px; border-radius: 4px; display: block;">`;
  } else {
    // Fallback to hosted logo if base64 not available
    logoImg = `<img src="${hostedLogoUrl}" alt="ALYGN" style="width: 40px; height: 40px; border-radius: 4px; display: block;">`;
  }
  
  // Extract first name for personalization
  const firstName = recipientName.split(' ')[0];
  
  // Default footer
  // Removing any outerHTML
  const clearFooter = footer.replace(/<\/?[^>]+(>|$)/g, "").trim();
  const defaultFooter = clearFooter || 'P.S.: Este mensaje fue generado con IA, verificado por humanos. Transparencia total en nuestros procesos.';
  
  // Build HTML
  const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  ${emailStyle}
</head>
<body>
  <div class="container">
    <!-- Header with Logo + Wordmark -->
    ${alygnHeader}
    
    <div class="content">
      <p class="greeting">Estimado/a ${firstName}${municipality ? `, Alcalde de ${municipality}` : ''},</p>
      
      <div class="body-content">
        ${bodyHtml}
      </div>
      
      <div class="closing">
        <p>
          Saludos,<br>
          <strong>Equipo Alygn</strong>
        </p>
      </div>

      <p class="ps">${defaultFooter}</p>
    </div>

    <!-- Footer -->
    ${alygnFooter.replace(/{variant}/g, variant)}
  </div>
</body>
</html>
  `.trim();
  
  return {
    subject: subject || 'ALYGN - AI Governance',
    html,
    text: bodyText || subject
  };
}

// HTML template builder (Governance-First v4)
function generateEmailHTML(recipientName = 'there', companyName = '', painPoints = '', variant = 'governance', useCid = false) {
  const logoPath = path.join(process.env.HOME, '.openclaw', 'workspace', 'media', 'alygn', 'avatar_400x400.jpg');
  const logoBase64 = getBase64Image(logoPath);

  if (useCid) {
    logoImg = `<img src="cid:logo" alt="ALYGN" style="width: 40px; height: 40px; border-radius: 4px; display: block;">`;
  } else if (logoBase64) {
    logoImg = `<img src="data:image/jpeg;base64,${logoBase64}" alt="ALYGN" style="width: 40px; height: 40px; border-radius: 4px; display: block;">`;
  } else {
    // Fallback to hosted logo if base64 not available
    logoImg = `<img src="${hostedLogoUrl}" alt="ALYGN" style="width: 40px; height: 40px; border-radius: 4px; display: block;">`;
  }

  // Copy variants (parity with Python)
  const variants = {
    governance: {
      subject: 'AI Governance Infrastructure',
      headline: 'Coordination Before Crisis',
      subheadline: 'Independent AI Governance for Global-Scale Systems',
      intro: `Alygn is an independent AI governance institution focused on making accountability, oversight, and coordination workable for advanced AI systems operating at global scale.<br><br>
As AI systems outgrow individual actors, governance can't be retrofitted. We exist to support coordination across developers, operators, and public institutions—without centralizing control or asserting authority.`,
      body: `<p style="margin: 16px 0; line-height: 1.6;"><strong>Why This Matters:</strong></p>
<ul style="margin: 16px 0; line-height: 1.8; padding-left: 24px;">
  <li><strong>Governance legitimacy, not technology.</strong> The hardest AI risks are institutional, not technical. Coordination failure is the real systemic risk.</li>
  <li><strong>Pre-crisis preparation.</strong> Emergency response that doesn't exist before crisis rarely works during one. Institutions are slow to build and expensive to replace.</li>
  <li><strong>Institutional restraint.</strong> We enable accountability through neutral infrastructure—not by regulating, controlling, or claiming authority over systems.</li>
  <li><strong>Independence matters.</strong> Oversight only works if all sides believe it's fair. Trust is harder to scale than technology.</li>
</ul>
<p style="margin: 16px 0; line-height: 1.6;">Alygn is publicly forming to address the institutional gap in AI governance before urgency removes options. We're building for legitimacy and durability, not speed or visibility.</p>`,
      cta: 'Learn more about Alygn',
      closing: `We're interested in exploring how governance infrastructure can support your organization's work.`,
      ps: 'This outreach was researched and drafted by our AI agent—verified by humans. Total transparency in our processes.'
    },
    institutional: {
      subject: 'Institutional AI Governance',
      headline: 'The Real AI Risk is Coordination Failure',
      subheadline: 'Neutral Governance Infrastructure for Advanced Systems',
      intro: `When AI systems scale beyond individual control, coordination becomes the bottleneck. Traditional oversight breaks down when no single actor can credibly intervene alone.<br><br>
Alygn is an independent institution focused on making accountability, emergency response, and cross-organization coordination actually work—before crisis conditions force fragmented outcomes.`,
      body: `<p style="margin: 16px 0; line-height: 1.6;"><strong>Core Principles:</strong></p>
<ul style="margin: 16px 0; line-height: 1.8; padding-left: 24px;">
  <li><strong>Governance-first, not technology-first.</strong> Our value proposition is legitimacy, not technical systems. Any infrastructure exists only in service of coordination.</li>
  <li><strong>Separation of concerns.</strong> Clear boundaries between governance, oversight, and system operation. We support coordination—we don't control systems.</li>
  <li><strong>Independent review.</strong> Neutral frameworks are easier to challenge but harder to dismiss. Independence is insulation from capture.</li>
  <li><strong>Emergency coordination without standing control.</strong> Preparedness is about permission, not prediction. Crisis frameworks designed during crisis reflect panic, not judgment.</li>
</ul>
<p style="margin: 16px 0; line-height: 1.6;">The absence of trusted coordination mechanisms is itself a systemic risk. We're addressing this gap deliberately, with institutional restraint rather than claims of authority.</p>`,
      cta: 'Discuss institutional coordination',
      closing: 'Looking forward to exploring this with you.',
      ps: 'This outreach was researched and drafted by our AI agent—verified by humans. Total transparency in our processes.'
    }
  };

  const copy = variants[variant] || variants.governance;

  // Personalization
  const companyMention = companyName ? ` at ${companyName}` : '';
  let painPointText = '';
  if (painPoints && typeof painPoints === 'string' && painPoints.trim()) {
    painPointText = `<p style="margin: 16px 0; line-height: 1.6;">We understand your organization${companyMention} faces challenges such as:</p>
<ul style="margin: 16px 0; line-height: 1.8; padding-left: 24px;">
  ${painPoints.split(/[,;\n]/).slice(0, 3).map(p => `<li>${p.trim()}</li>`).join('')}
</ul>`;
  }

  // Mailto template (for CTA button)
  const mailtoSubject = encodeURIComponent(copy.subject);
  const mailtoBody = encodeURIComponent(
    `Hi,\n\n${copy.intro.replace(/<br\s*\/?>/g, '\n')}\n\n${copy.ps}\n\nhttps://alygn.us`
  );
  const mailtoLink = `mailto:tanialeaidm@gmail.com?subject=${mailtoSubject}&body=${mailtoBody}&Bcc=alyyygn@gmail.com`;

  // Convert Python-style (snake_case) CSS to JS-style (camelCase) if needed
  // (In this template, CSS is in a string, so no conversion needed for inline styles)
  // If you want to use JS objects for styles, here's an example conversion:
  // { background_color: "#fff", font_size: "16px" } -> { backgroundColor: "#fff", fontSize: "16px" }
  // But for email HTML, keep as string CSS.

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${copy.subject}</title>
  ${emailStyle}
</head>
<body>
  <div class="container">
    <!-- Header with Logo + Wordmark -->
    ${alygnHeader}

    <div class="content">
      <p>Hi ${recipientName}${companyMention},</p>
      <p>${copy.intro}</p>
      ${painPointText}
      ${copy.body}
      <div class="divider"></div>
      <p>
        <a href="${mailtoLink}" class="cta-button">${copy.cta}</a>
      </p>

      <p>${copy.closing}</p>

      <p>
        Best,<br>
        <strong>Alygn Team</strong>
      </p>

      <p class="ps">${copy.ps}</p>
    </div>
    
    <!-- Footer -->
    ${alygnFooter.replace(/{variant}/g, variant)}
  </div>
</body>
</html>`;
}


// Read image assets and convert to base64 for inline embedding
function getBase64Image(imagePath) {
  try {
    if (fs.existsSync(imagePath)) {
      return fs.readFileSync(imagePath, 'base64');
    }
  } catch (err) {
    console.error(`Failed to read image: ${imagePath}`, err.message);
  }
  return null;
}

// Load SMTP/email config from credentials.json (for parity with Python version)
function loadSmtpConfig() {
  const credentialsPath = path.join(process.env.HOME, '.openclaw', 'workspace', 'config', 'credentials.json');
  if (!fs.existsSync(credentialsPath)) return null;
  try {
    const creds = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
    const emailCreds = creds.email.smtp;
    return {
      server: emailCreds.server,
      port: emailCreds.port,
      user: creds.email.address,
      password: emailCreds.password
    };
  } catch (e) {
    console.error('Failed to load SMTP config:', e.message);
    return null;
  }
}

// Logo embedding - Fallback to hosted URL if base64 fails
let logoImg = '';
const hostedLogoUrl = 'https://res.cloudinary.com/andler-develops/image/upload/v1773687409/alygn/avatar_400x400-transparent_n4gey5.png'; // Fallback URL

const alygnHeader = `<div class="header">
  <div class="header-brand">
    <h2 class="brand-name">ALYGN</h2>
    ${logoImg}
  </div>
</div>`
const alygnFooter = `<div class="footer">
  <p style="margin: 0 0 12px 0;">
    Alygn - Independent AI Governance Institution<br>
    ${new Date().getFullYear()} © All rights reserved.
  </p>
  <p style="margin: 0; font-size: 14px;">
    <a href="https://alygn.us?utm_source=email&utm_medium=vc-outreach&utm_campaign={variant}" style="display: inline-block; margin: 0 8px;">🌐 alygn.us</a> | 
    <a href="https://x.com/aialygn?utm_source=email&utm_medium=vc-outreach&utm_campaign={variant}" style="display: inline-block; margin: 0 8px;">𝕏 @aialygn</a> | 
    <a href="https://linkedin.com/company/alygn?utm_source=email&utm_medium=vc-outreach&utm_campaign={variant}" style="display: inline-block; margin: 0 8px;">💼 LinkedIn</a>
  </p>
</div>`;
const emailStyle = `<style>
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
    background-color: #f9fafb;
    margin: 0;
    padding: 0;
    color: #1f2937;
  }
  .container {
    max-width: 600px;
    margin: 0 auto;
    background-color: #ffffff;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }
  .header {
    background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
    padding: 32px 24px;
    text-align: center;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .header-brand {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    margin-left: auto;
    margin-right: auto;
  }
  .brand-name {
    color: #ffffff !important;
    font-size: 28px;
    font-weight: 700;
    margin: 0;
    letter-spacing: 2px;
    text-transform: uppercase;
  }
  .logo-container {
    margin-bottom: 16px;
  }
  .headline {
    color: #ffffff;
    font-size: 24px;
    font-weight: 600;
    margin: 0 0 8px 0;
  }
  .subheadline {
    color: #94a3b8;
    font-size: 14px;
    margin: 0;
  }
  .content {
    padding: 32px 24px;
  }
  .greeting {
    font-size: 16px;
    font-weight: 500;
    margin-bottom: 16px;
    color: #1f2937;
  }
  .body-content {
    line-height: 1.6;
    font-size: 15px;
    color: #374151;
  }
  .body-content p {
    margin: 16px 0;
  }
  .body-content ul {
    margin: 16px 0;
    padding-left: 24px;
  }
  .body-content li {
    margin: 8px 0;
    line-height: 1.6;
  }
  .cta-button {
    display: inline-block;
    background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
    color: #ffffff;
    text-decoration: none;
    padding: 12px 24px;
    border-radius: 6px;
    font-weight: 500;
    margin: 24px 0;
  }
  .closing {
    margin-top: 24px;
    font-size: 15px;
    color: #374151;
  }
  .signature {
    margin-top: 24px;
    font-size: 15px;
    color: #1f2937;
  }
  .ps {
    margin-top: 24px;
    padding-top: 16px;
    border-top: 1px solid #e5e7eb;
    font-size: 13px;
    color: #6b7280;
    font-style: italic;
  }
  .footer {
    background-color: #f3f4f6;
    padding: 24px;
    text-align: center;
    font-size: 12px;
    color: #9ca3af;
    border-top: 1px solid #e5e7eb;
  }
  .footer a,
  .footer p {
    color: #0f172a;
    text-decoration: none;
    margin: 0 8px;
  }
</style>`;

export {
  generateEmail, // New dynamic API
  generateEmailHTML, // Legacy API (for backwards compatibility)
  loadSmtpConfig
};

