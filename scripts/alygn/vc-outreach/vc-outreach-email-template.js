/**
 * ALYGN VC Outreach Email Template v4 - Governance-First
 * Professional, minimalist design with institutional messaging
 * Updated: Feb 10, 2026 (context update)
 * 
 * Key changes from v3:
 * - Removed "Intention Marketplace" reference
 * - Governance-first positioning (not technology products)
 * - Institutional restraint tone (calm, non-promotional)
 * - Language: "Supports coordination", not "Regulates"
 * - Focus: Legitimacy, preparedness, coordination
 */

const fs = require('fs');
const path = require('path');

// Read image assets and convert to base64
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

function generateEmailHTML(recipientName = 'there', variant = 'governance') {
  const logoPath = path.join(process.env.HOME, 'Downloads', 'avatar_400x400.jpg');
  const bannerPath = path.join(process.env.HOME, 'Downloads', 'banner-1500x500.jpeg');
  
  const logoBase64 = getBase64Image(logoPath);
  const bannerBase64 = getBase64Image(bannerPath);

  // Email copy variants for VC outreach (governance-first, institutional tone)
  const copyVariants = {
    governance: {
      greeting: `Hi ${recipientName},`,
      subject: 'AI Governance Infrastructure',
      headline: 'Coordination Before Crisis',
      subheadline: 'Independent AI Governance for Global-Scale Systems',
      intro: `Alygn is an independent AI governance institution focused on making accountability, oversight, and coordination workable for advanced AI systems operating at global scale.

As AI systems outgrow individual actors, governance can't be retrofitted. We exist to support coordination across developers, operators, and public institutions—without centralizing control or asserting authority.`,
      body: `
        <p style="margin: 16px 0; line-height: 1.6;"><strong>Why This Matters:</strong></p>
        <ul style="margin: 16px 0; line-height: 1.8; padding-left: 24px;">
          <li><strong>Governance legitimacy, not technology.</strong> The hardest AI risks are institutional, not technical. Coordination failure is the real systemic risk.</li>
          <li><strong>Pre-crisis preparation.</strong> Emergency response that doesn't exist before crisis rarely works during one. Institutions are slow to build and expensive to replace.</li>
          <li><strong>Institutional restraint.</strong> We enable accountability through neutral infrastructure—not by regulating, controlling, or claiming authority over systems.</li>
          <li><strong>Independence matters.</strong> Oversight only works if all sides believe it's fair. Trust is harder to scale than technology.</li>
        </ul>
        <p style="margin: 16px 0; line-height: 1.6;">
          Alygn is publicly forming to address the institutional gap in AI governance before urgency removes options. We're building for legitimacy and durability, not speed or visibility.
        </p>
      `,
      cta: 'Learn more about Alygn',
      closing: 'We're interested in exploring how governance infrastructure can support your organization's work.'
    },
    
    institutional: {
      greeting: `Hi ${recipientName},`,
      subject: 'Institutional AI Governance',
      headline: 'The Real AI Risk is Coordination Failure',
      subheadline: 'Neutral Governance Infrastructure for Advanced Systems',
      intro: `When AI systems scale beyond individual control, coordination becomes the bottleneck. Traditional oversight breaks down when no single actor can credibly intervene alone.

Alygn is an independent institution focused on making accountability, emergency response, and cross-organization coordination actually work—before crisis conditions force fragmented outcomes.`,
      body: `
        <p style="margin: 16px 0; line-height: 1.6;"><strong>Core Principles:</strong></p>
        <ul style="margin: 16px 0; line-height: 1.8; padding-left: 24px;">
          <li><strong>Governance-first, not technology-first.</strong> Our value proposition is legitimacy, not technical systems. Any infrastructure exists only in service of coordination.</li>
          <li><strong>Separation of concerns.</strong> Clear boundaries between governance, oversight, and system operation. We support coordination—we don't control systems.</li>
          <li><strong>Independent review.</strong> Neutral frameworks are easier to challenge but harder to dismiss. Independence is insulation from capture.</li>
          <li><strong>Emergency coordination without standing control.</strong> Preparedness is about permission, not prediction. Crisis frameworks designed during crisis reflect panic, not judgment.</li>
        </ul>
        <p style="margin: 16px 0; line-height: 1.6;">
          The absence of trusted coordination mechanisms is itself a systemic risk. We're addressing this gap deliberately, with institutional restraint rather than claims of authority.
        </p>
      `,
      cta: 'Discuss institutional coordination',
      closing: 'Looking forward to exploring this with you.'
    }
  };

  const copy = copyVariants[variant] || copyVariants.governance;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${copy.subject}</title>
  <style>
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
    }
    .logo {
      width: 64px;
      height: 64px;
      margin: 0 auto 16px;
      border-radius: 8px;
      display: block;
    }
    .brand-name {
      font-size: 20px;
      font-weight: 600;
      color: #ffffff;
      margin: 0;
      letter-spacing: 0.5px;
    }
    .banner {
      width: 100%;
      max-height: 200px;
      object-fit: cover;
      display: block;
    }
    .content {
      padding: 32px 24px;
    }
    .headline {
      font-size: 28px;
      font-weight: 700;
      color: #0f172a;
      margin: 0 0 8px 0;
      line-height: 1.2;
    }
    .subheadline {
      font-size: 16px;
      color: #64748b;
      margin: 0 0 24px 0;
      font-weight: 500;
    }
    .greeting {
      font-size: 16px;
      color: #1f2937;
      margin: 0 0 16px 0;
      font-weight: 500;
    }
    .body-text {
      font-size: 15px;
      line-height: 1.6;
      color: #374151;
    }
    .body-text p {
      margin: 16px 0;
    }
    .body-text ul {
      margin: 16px 0;
      padding-left: 24px;
      line-height: 1.8;
    }
    .body-text li {
      margin: 8px 0;
    }
    .cta-button {
      display: inline-block;
      background-color: #0f172a;
      color: #ffffff;
      padding: 12px 32px;
      border-radius: 6px;
      text-decoration: none;
      font-weight: 500;
      font-size: 16px;
      margin: 24px 0;
      transition: background-color 0.2s;
    }
    .cta-button:hover {
      background-color: #1e293b;
    }
    .closing {
      margin: 24px 0 0 0;
      font-size: 15px;
      color: #374151;
    }
    .signature {
      margin-top: 32px;
      padding-top: 24px;
      border-top: 1px solid #e5e7eb;
      font-size: 14px;
      color: #6b7280;
    }
    .signature-name {
      font-weight: 600;
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
    .footer a {
      color: #0f172a;
      text-decoration: none;
      margin: 0 8px;
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div class="header">
      ${logoBase64 ? `<img src="data:image/jpeg;base64,${logoBase64}" alt="ALYGN Logo" class="logo">` : ''}
      <p class="brand-name">ALYGN</p>
    </div>

    <!-- Banner -->
    ${bannerBase64 ? `<img src="data:image/jpeg;base64,${bannerBase64}" alt="ALYGN Banner" class="banner">` : ''}

    <!-- Content -->
    <div class="content">
      <h1 class="headline">${copy.headline}</h1>
      <p class="subheadline">${copy.subheadline}</p>

      <p class="greeting">${copy.greeting}</p>

      <p class="body-text">${copy.intro}</p>

      <div class="body-text">${copy.body}</div>

      <a href="mailto:tanialeaidm@gmail.com" class="cta-button">${copy.cta}</a>

      <p class="closing">${copy.closing}</p>

      <div class="ps">This outreach was researched and drafted by our AI agent—because we practice what we preach.</div>

      <div class="signature">
        <p style="margin: 0 0 8px 0;">
          <span class="signature-name">Tania Lea</span><br>
          Founder & CEO, Alygn<br>
          <a href="mailto:tanialeaidm@gmail.com" style="color: #0f172a; text-decoration: none;">tanialeaidm@gmail.com</a>
        </p>
        <p style="margin: 8px 0 0 0; font-size: 13px; color: #9ca3af;">
          Team inquiries: <a href="mailto:contact@andler.dev" style="color: #0f172a;">contact@andler.dev</a>
        </p>
      </div>
    </div>

    <!-- Footer -->
    <div class="footer">
      <p style="margin: 0 0 12px 0;">© 2026 Alygn</p>
      <p style="margin: 0;">
        <a href="https://alygn.us">🌐 alygn.us</a>
        <a href="https://x.com/aialygn">𝕏 @aialygn</a>
        <a href="https://linkedin.com/company/alygn">💼 LinkedIn</a>
      </p>
    </div>
  </div>
</body>
</html>`;
}

module.exports = { generateEmailHTML };

// CLI usage
if (require.main === module) {
  const variant = process.argv[2] || 'governance';
  const recipientName = process.argv[3] || 'there';
  
  const html = generateEmailHTML(recipientName, variant);
  console.log(html);
  console.log(`\n✅ Generated ${variant} variant for ${recipientName}`);
  console.log('\nAvailable variants: governance, institutional');
  console.log('\nKey changes from v3:');
  console.log('  • Removed "Intention Marketplace" reference');
  console.log('  • Governance-first positioning (not SOS Protocol)');
  console.log('  • Institutional restraint tone (calm, non-promotional)');
  console.log('  • Language: "Supports coordination", not "Regulates"');
  console.log('  • Focus: Legitimacy, preparedness, coordination');
}
