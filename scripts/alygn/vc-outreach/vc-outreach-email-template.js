/**
 * ALYGN VC Outreach Email Template
 * Governance-first institutional positioning
 * - Independent AI governance infrastructure
 * - Neutral tone, no hype
 * - Focus: coordination, legitimacy, preparedness
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

function generateEmailHTML(recipientName = 'there', vcName = '', painPoints = [], variant = 'governance') {
  const logoPath = path.join(process.env.HOME, 'Downloads/avatar_400x400.jpg');
  
  const logoBase64 = getBase64Image(logoPath);
  const logoImg = logoBase64 ? `<img src="data:image/jpeg;base64,${logoBase64}" alt="ALYGN" style="width: 40px; height: 40px; border-radius: 4px;">` : '';

  // Email copy variants for VC outreach
  const copyVariants = {
    governance: {
      greeting: `Hi ${recipientName},`,
      subject: 'AI Governance Infrastructure for the Frontier',
      headline: 'Legitimacy is Infrastructure',
      intro: `ALYGN is building independent AI governance infrastructure — the institutional layer that makes accountability, oversight, and coordination workable at frontier scale. We're not operating AI systems. We're enabling other developers and institutions to coordinate around them responsibly.`,
      painPoints: painPoints.length > 0 ? `
        <p style="margin: 16px 0; line-height: 1.6;">
          Based on research into ${vcName}, we imagine governance challenges around:
        </p>
        <ul style="margin: 16px 0; line-height: 1.8; padding-left: 24px;">
          ${painPoints.slice(0, 3).map(p => `<li>${p.replace(/[;,]/g, ';')}</li>`).join('')}
        </ul>
      ` : '',
      body: `
        <p style="margin: 16px 0; line-height: 1.6;">
          We address this through:
        </p>
        <ul style="margin: 16px 0; line-height: 1.8; padding-left: 24px;">
          <li><strong>Neutral governance coordination</strong> — enabling labs, operators, and institutions to work together without centralizing control</li>
          <li><strong>Independent auditability</strong> — credible oversight that doesn't require surveillance</li>
          <li><strong>Emergency preparedness</strong> — coordination infrastructure that exists before crisis, not after</li>
          <li><strong>Institutional restraint</strong> — clear separation between governance, oversight, and operation</li>
        </ul>
        <p style="margin: 16px 0; line-height: 1.6;">
          The hardest AI risks are institutional, not just technical. Governance infrastructure is how we make frontier AI safe at scale.
        </p>
      `,
      cta: 'Let\'s discuss frontier AI governance',
      closing: 'Looking forward to a conversation about coordination at scale.'
    },
    
    institutional: {
      greeting: `Hi ${recipientName},`,
      subject: 'The Real AI Risk is Coordination Failure',
      headline: 'Building Governance for Advanced AI',
      intro: `The frontier AI risk isn't capability. It's coordination failure. ALYGN is the independent institutional layer that makes governance workable at scale — enabling developers, operators, and public institutions to align around safety and accountability without centralizing power.`,
      painPoints: painPoints.length > 0 ? `
        <p style="margin: 16px 0; line-height: 1.6;">
          ${vcName} faces governance challenges including:
        </p>
        <ul style="margin: 16px 0; line-height: 1.8; padding-left: 24px;">
          ${painPoints.slice(0, 3).map(p => `<li>${p.replace(/[;,]/g, ';')}</li>`).join('')}
        </ul>
      ` : '',
      body: `
        <p style="margin: 16px 0; line-height: 1.6;">
          ALYGN enables this through independent review, neutral coordination, and auditable governance structures that build legitimacy without control.
        </p>
        <p style="margin: 16px 0; line-height: 1.6;">
          We're not a regulator. We're the infrastructure that makes coordination possible when it matters most.
        </p>
      `,
      cta: 'Explore governance coordination',
      closing: 'Interested in building governance infrastructure together.'
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
      line-height: 1.5;
    }
    .container {
      max-width: 600px;
      margin: 20px auto;
      background-color: #ffffff;
      border-radius: 4px;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 32px 24px;
      text-align: center;
    }
    .logo {
      margin-bottom: 16px;
    }
    .header h1 {
      margin: 16px 0;
      font-size: 28px;
      font-weight: 700;
    }
    .content {
      padding: 32px 24px;
      font-size: 15px;
    }
    .content h2 {
      font-size: 20px;
      font-weight: 600;
      margin: 24px 0 16px;
      color: #111827;
    }
    .content p {
      margin: 16px 0;
      line-height: 1.6;
    }
    .content ul {
      margin: 16px 0;
      line-height: 1.8;
      padding-left: 24px;
    }
    .content li {
      margin-bottom: 8px;
    }
    .cta-button {
      display: inline-block;
      background-color: #667eea;
      color: white;
      padding: 12px 24px;
      border-radius: 4px;
      text-decoration: none;
      font-weight: 600;
      margin: 24px 0;
    }
    .cta-button:hover {
      background-color: #5568d3;
    }
    .footer {
      background-color: #f3f4f6;
      padding: 24px;
      text-align: center;
      font-size: 13px;
      color: #6b7280;
    }
    .footer a {
      color: #667eea;
      text-decoration: none;
    }
    .divider {
      border-top: 1px solid #e5e7eb;
      margin: 24px 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      ${logoImg}
      <h1>${copy.headline}</h1>
    </div>
    
    <div class="content">
      <p>${copy.greeting}</p>
      
      <p>${copy.intro}</p>
      
      ${copy.painPoints || ''}
      
      ${copy.body}
      
      <div class="divider"></div>
      
      <p>
        <a href="mailto:contact@alygn.us?subject=${encodeURIComponent(copy.subject)}" class="cta-button">${copy.cta}</a>
      </p>
      
      <p>${copy.closing}</p>
      
      <p style="margin-top: 32px; font-size: 13px; color: #9ca3af;">
        — Wobblus<br>
        on behalf of ALYGN<br>
        <a href="https://alygn.us" style="color: #667eea; text-decoration: none;">alygn.us</a> | <a href="https://x.com/aialygn" style="color: #667eea; text-decoration: none;">@aialygn</a>
      </p>
    </div>
    
    <div class="footer">
      <p>
        <strong>ALYGN</strong> — Independent AI Governance Infrastructure<br>
        <a href="https://alygn.us">alygn.us</a> • <a href="https://x.com/aialygn">X/Twitter</a> • <a href="https://linkedin.com/company/alygn">LinkedIn</a>
      </p>
      <p style="margin-top: 12px; font-size: 12px;">
        This email was sent to support AI governance coordination. 
        <a href="#">Unsubscribe</a>
      </p>
    </div>
  </div>
</body>
</html>`;
}

module.exports = { generateEmailHTML };
