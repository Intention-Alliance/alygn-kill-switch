/**
 * ALYGN VC Outreach Email Template (Governance-First v4)
 * - Independent AI governance institution positioning
 * - Institutional restraint and neutral tone
 * - No product claims, no hype
 * - Focus: coordination, legitimacy, preparedness
 * - Updated: Feb 10, 2026 (context update)
 */

const fs = require('fs');
const path = require('path');

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

// HTML template builder (Governance-First v4)
function generateEmailHTML(recipientName = 'there', companyName = '', painPoints = '', variant = 'governance', useCid = false) {
  const logoPath = path.join(process.env.HOME, 'Downloads', 'avatar_400x400.jpg');
  const logoBase64 = getBase64Image(logoPath);

  // Logo embedding
  let logoImg = '';
  if (useCid) {
    logoImg = `<img src="cid:logo" alt="ALYGN" style="width: 40px; height: 40px; border-radius: 4px;">`;
  } else if (logoBase64) {
    logoImg = `<img src="data:image/jpeg;base64,${logoBase64}" alt="ALYGN" style="width: 40px; height: 40px; border-radius: 4px;">`;
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
      ps: 'This outreach was researched and drafted by our AI agent—because we practice what we preach.'
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
      ps: 'This outreach was researched and drafted by our AI agent—because we practice what we preach.'
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
    .header h2 {
      margin: 0 0 8px 0;
      font-size: 17px;
      font-weight: 400;
      color: #e0e7ff;
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
      <div class="logo">${logoImg}</div>
      <h1>${copy.headline}</h1>
      <h2>${copy.subheadline}</h2>
    </div>
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
      <p style="margin-top: 32px; font-size: 13px; color: #9ca3af;">
        — Wobblus<br>
        on behalf of ALYGN<br>
        <a href="https://alygn.us" style="color: #667eea; text-decoration: none;">alygn.us</a> | <a href="https://x.com/aialygn" style="color: #667eea; text-decoration: none;">@aialygn</a>
      </p>
      <p style="margin-top: 16px; font-size: 12px; color: #b6bbc7;">
        <em>${copy.ps}</em>
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

module.exports = { generateEmailHTML, loadSmtpConfig };
