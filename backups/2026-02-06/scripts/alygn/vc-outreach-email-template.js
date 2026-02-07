/**
 * ALYGN VC Outreach Email Template
 * Professional, minimalist, tech-forward design
 * Inspired by shadcn/ui but optimized for email
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

function generateEmailHTML(recipientName = 'there', variant = 'standard') {
  const logoPath = path.expandUser('~/Downloads/avatar_400x400.jpg');
  const bannerPath = path.expandUser('~/Downloads/banner-1500x500.jpeg');
  
  const logoBase64 = getBase64Image(logoPath);
  const bannerBase64 = getBase64Image(bannerPath);

  // Email copy variants for VC outreach (intelligent, warm, compelling)
  const copyVariants = {
    standard: {
      greeting: `Hi ${recipientName},`,
      subject: 'Building the Next Generation of AI Systems',
      headline: 'Humanizing Technology at Scale',
      intro: `We're building transformative AI infrastructure that bridges the gap between cutting-edge technology and genuine human value. At ALYGN (Intention Alliance), we believe the future of AI isn\'t about raw capability, it\'s about systems that amplify human potential while maintaining ethical integrity.`,
      body: `
        <p style="margin: 16px 0; line-height: 1.6;">
          Our platform enables organizations to deploy AI systems that are:
        </p>
        <ul style="margin: 16px 0; line-height: 1.8; padding-left: 24px;">
          <li><strong>Contextually intelligent</strong> — understanding nuance, intent, and real-world constraints</li>
          <li><strong>Operationally robust</strong> — built for production scale with measurable ROI</li>
          <li><strong>Ethically grounded</strong> — transparency and accountability by design</li>
          <li><strong>Human-centered</strong> — augmenting expertise, not replacing it</li>
        </ul>
        <p style="margin: 16px 0; line-height: 1.6;">
          We're already working with innovative organizations across fintech, enterprise AI, and developer tools. The market is moving fast, and the winners will be those who can deliver AI that actually solves business problems-not just demos.
        </p>
      `,
      cta: 'Let\'s explore what\'s possible',
      closing: 'Looking forward to a conversation.'
    },
    
    technical: {
      greeting: `Hi ${recipientName},`,
      subject: 'Enterprise AI Infrastructure: Context Engine Approach',
      headline: 'Solving the Real AI Gap',
      intro: `Most enterprise AI projects fail not because of model capability, but because systems lack contextual intelligence and operational reliability. ALYGN is solving this with a fundamentally different architecture—one that treats context engineering as first-class.`,
      body: `
        <p style="margin: 16px 0; line-height: 1.6;">
          Our platform includes:
        </p>
        <ul style="margin: 16px 0; line-height: 1.8; padding-left: 24px;">
          <li><strong>Dynamic context management</strong> — real-time reasoning over complex data graphs</li>
          <li><strong>Confidence-aware inference</strong> — uncertainty quantification for high-stakes decisions</li>
          <li><strong>Composable reasoning</strong> — building complex behaviors from modular, testable units</li>
          <li><strong>Audit trails & compliance</strong> — every decision is traceable and explainable</li>
        </ul>
        <p style="margin: 16px 0; line-height: 1.6;">
          Enterprise teams are tired of AI systems that work in notebooks but fail in production. We're building infrastructure that actually ships.
        </p>
      `,
      cta: 'Let\'s discuss your AI roadmap',
      closing: 'Excited to hear about your vision.'
    }
  };

  const copy = copyVariants[variant] || copyVariants.standard;

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
      <p class="subheadline">${copy.subject}</p>

      <p class="greeting">${copy.greeting}</p>

      <p class="body-text">${copy.intro}</p>

      <div class="body-text">${copy.body}</div>

      <a href="mailto:contact@andler.dev" class="cta-button">${copy.cta}</a>

      <p class="closing">${copy.closing}</p>

      <div class="signature">
        <p style="margin: 0 0 8px 0;">
          <span class="signature-name">Andler</span><br>
          Co-founder & CTO, ALYGN<br>
          <a href="mailto:contact@andler.dev" style="color: #0f172a; text-decoration: none;">contact@andler.dev</a>
        </p>
      </div>
    </div>

    <!-- Footer -->
    <div class="footer">
      <p style="margin: 0;">© 2026 Intention Alliance. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;
}

module.exports = { generateEmailHTML };
