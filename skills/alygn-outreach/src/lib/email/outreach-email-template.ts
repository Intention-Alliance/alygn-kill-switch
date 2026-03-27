/**
 * ALYGN Outreach Email Template (Governance-First v4)
 * - Independent AI governance institution positioning
 * - Institutional restraint and neutral tone
 * - No product claims, no hype
 * - Focus: coordination, legitimacy, preparedness
 * - Updated: Mar 18, 2026 (removed bodyHtml parameter - template now generates ALL HTML internally)
 * 
 * Usage:
 *   import template from "./outreach-email-template.js";
 *   
 *   // For Municipalities (Spanish)
 *   const email = template.generateEmail({
 *     recipientName: 'Diego Miranda',
 *     companyName: 'San José',
 *     painPoints: ['AI accountability', 'coordinación institucional'],
 *     variant: 'governance',
 *     language: 'es',
 *     subject: 'Governance Infrastructure'
 *   });
 *   
 *   // For VCs (English)
 *   const email = template.generateEmailHTML({
 *     recipientName: 'Partner Name',
 *     companyName: 'Khosla Ventures',
 *     painPoints: ['AI safety', 'alignment'],
 *     variant: 'governance',
 *     language: 'en',
 *     subject: 'AI Governance Infrastructure'
 *   });
 */

import fs from "fs";
import path from "path";

// Logo embedding - Fallback to hosted URL if base64 fails
const hostedLogoUrl = 'https://res.cloudinary.com/andler-develops/image/upload/v1773687409/alygn/avatar_400x400-transparent_n4gey5.png';

/**
 * Generate email for Municipalities (Spanish)
 * @param {Object} params - Email parameters
 * @param {string} params.recipientName - Recipient name (e.g., "Diego Miranda")
 * @param {string} params.companyName - Municipality/canton name (e.g., "San José")
 * @param {string[]} params.painPoints - Array of pain points (e.g., ['AI accountability', 'coordinación'])
 * @param {string} params.variant - Email variant (governance|institutional|traiga)
 * @param {string} params.language - Language code ('es' for Spanish)
 * @param {string} params.subject - Email subject (used for mailto links)
 * @param {string} [params.ctaText] - Optional custom CTA button text
 * @param {string} [params.customPS] - Optional custom footer note
 * 
 * @returns {Object} { subject, html, text }
 */
export function generateEmail(params) {
  const {
    recipientName = 'there',
    companyName = '',
    painPoints = [],
    variant = 'governance',
    language = 'es',
    subject = '',
    ctaText = null,
    customPS = 'P.S.: Este mensaje fue generado con IA, verificado por humanos. Transparencia total en nuestros procesos.'
  } = params;

  const firstName = recipientName.split(' ')[0];
  // Self-contained: use hosted URL for logo (no external file dependency)
  const logoImg = `<img src="${hostedLogoUrl}" alt="ALYGN" style="width: 64px; height: 64px; border-radius: 4px; display: block;">`;

  // Template copy for municipalities (Spanish)
  const templates = {
    governance: {
      es: {
        intro: `Alygn es una institución independiente de gobernanza de IA enfocada en hacer que la rendición de cuentas, la supervisión y la coordinación sean viables para sistemas de IA avanzados que operan a escala global.<br><br>
A medida que los sistemas de IA superan a los actores individuales, la gobernanza no puede ser añadida retroactivamente. Existimos para apoyar la coordinación entre desarrolladores, operadores e instituciones públicas—sin centralizar el control ni afirmar autoridad.`,
        closing: 'Esperando explorar esto con usted.',
        cta: ctaText || 'Conozca más sobre Alygn',
        painPointsIntro: companyName 
          ? `Entendemos que ${companyName} enfrenta desafíos como:`
          : 'Entendemos que su organización enfrenta desafíos como:',
        customPS
      }
    },
    institutional: {
      es: {
        intro: `Cuando los sistemas de IA escalan más allá del control individual, la coordinación se convierte en el cuello de botella. La supervisión tradicional se desmorona cuando ningún actor individual puede intervenir de manera creíble por sí solo.<br><br>
Alygn es una institución independiente enfocada en hacer que la rendición de cuentas, la respuesta de emergencia y la coordinación entre organizaciones funcionen realmente—antes de que las condiciones de crisis impulsen resultados fragmentados.`,
        closing: 'Esperando explorar esto con usted.',
        cta: ctaText || 'Discutir coordinación institucional',
        painPointsIntro: companyName
          ? `Entendemos que ${companyName} enfrenta desafíos como:`
          : 'Entendemos que su organización enfrenta desafíos como:',
        customPS
      }
    },
    traiga: {
      es: {
        intro: `El TRAIGA Act (Tecnologías de Riesgo de Inteligencia Artificial de Gran Alcance) establece un marco regulatorio para sistemas de IA de alto riesgo.<br><br>
Como institución independiente de gobernanza de IA, Alygn puede apoyar a los municipios en la implementación práctica de estas salvaguardas—sin centralizar el control ni afirmar autoridad.`,
        closing: 'Esperando explorar esto con usted.',
        cta: ctaText || 'Conozca cómo podemos ayudar',
        painPointsIntro: companyName
          ? `Entendemos que ${companyName} enfrenta desafíos como:`
          : 'Entendemos que su organización enfrenta desafíos como:',
        customPS,
      }
    }
  };

  const copy = templates[variant]?.[language] || templates.governance.es;

  // Build mailto link
  const mailtoSubject = `RE: ${subject || 'ALYGN - AI Governance'}`;
  const mailtoBody = `Saludos, Tania.

Me interesa explorar cómo podemos apoyar${companyName ? ` a ${companyName}` : ''} con los desafíos de gobernanza de IA que enfrentan. ¿Podemos coordinar una llamada para discutir esto más a fondo?`;
  const mailtoLink = `mailto:tanialeaidm@gmail.com?subject=${encodeURIComponent(mailtoSubject)}&body=${encodeURIComponent(mailtoBody)}&Bcc=outreach@alyygn.com`;

  // Build pain points HTML
  const painPointsHtml = Array.isArray(painPoints) && painPoints.length > 0
    ? `<p style="margin: 16px 0; line-height: 1.6;">${copy.painPointsIntro}</p>
<ul style="margin: 16px 0; line-height: 1.8; padding-left: 24px;">
  ${painPoints.slice(0, 3).map(p => `<li>${typeof p === 'string' ? p.trim() : p}</li>`).join('')}
</ul>`
    : '';

  // Build HTML
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject || 'ALYGN - AI Governance'}</title>
  ${emailStyle}
</head>
<body>
  <div class="container">
    ${buildHeader(logoImg)}
    <div class="content">
      <p class="greeting">Estimado/a ${recipientName}${companyName ? `, edil de ${companyName}` : ''},</p>
      <div class="body-content">
        <p>${copy.intro}</p>
        ${painPointsHtml}
      </div>
      <p class="closing">${copy.closing}</p>
      <a href="${mailtoLink}" class="cta-button">${copy.cta}</a>
      <p class="ps">${copy.customPS}</p>
    </div>
    ${buildFooter(variant)}
  </div>
</body>
</html>`;

  const text = generatePlainText(html);

  return {
    subject: subject || 'ALYGN - AI Governance',
    html: html.trim(),
    text
  };
}

/**
 * Generate email for VC Outreach (English)
 * @param {Object} params - Email parameters
 * @param {string} params.recipientName - Recipient name (e.g., "Partner Name")
 * @param {string} params.companyName - Company name (e.g., "Khosla Ventures")
 * @param {string[]} params.painPoints - Array of pain points (e.g., ['AI safety', 'alignment'])
 * @param {string} params.variant - Email variant (governance|institutional)
 * @param {string} params.language - Language code ('en' for English)
 * @param {string} params.subject - Email subject (used for mailto links)
 * @param {string} [params.customHook] - Custom hook text personalization to insert after intro
 * @param {string} [params.ctaText] - Optional custom CTA button text
 * @param {string} [params.customPS] - Optional custom footer note (Must include `"P.S.: "` prefix and suffix `". This message was AI-generated and verified by humans. Total transparency in our processes."` if provided)
 * @returns {Object} { subject, html, text }
 */
export function generateEmailHTML(params) {
  const {
    recipientName = 'there',
    companyName = '',
    painPoints = [],
    variant = 'governance',
    language = 'en',
    subject = '',
    ctaText = null,
    customPS = 'P.S.: This message was AI-generated and verified by humans. Total transparency in our processes.',
    customHook = null
  } = params;

  const firstName = recipientName ? recipientName.split(' ')[0] : 'there';
  // Self-contained: use hosted URL for logo (no external file dependency)
  const logoImg = `<img src="${hostedLogoUrl}" alt="ALYGN" style="width: 64px; height: 64px; border-radius: 4px; display: block;">`;

  // Template copy for VCs (English)
  const templates = {
    governance: {
      en: {
        intro: `Alygn is an independent AI governance institution focused on making accountability, oversight, and coordination workable for advanced AI systems operating at global scale.<br><br>
As AI systems outgrow individual actors, governance can't be retrofitted. We exist to support coordination across developers, operators, and public institutions—without centralizing control or asserting authority.`,
        closing: "We're interested in exploring how governance infrastructure can support your organization's work.",
        cta: ctaText || 'Learn more about Alygn',
        painPointsIntro: companyName
          ? `We understand ${companyName} faces challenges such as:`
          : 'We understand your organization faces challenges such as:',
        customPS,
      }
    },
    institutional: {
      en: {
        intro: `When AI systems scale beyond individual control, coordination becomes the bottleneck. Traditional oversight breaks down when no single actor can credibly intervene alone.<br><br>
Alygn is an independent institution focused on making accountability, emergency response, and cross-organization coordination actually work—before crisis conditions force fragmented outcomes.`,
        closing: 'Looking forward to exploring this with you.',
        cta: ctaText || 'Discuss institutional coordination',
        painPointsIntro: companyName
          ? `We understand ${companyName} faces challenges such as:`
          : 'We understand your organization faces challenges such as:',
        customPS,
      }
    }
  };

  const copy = templates[variant]?.[language] || templates.governance.en;

  // Build mailto link
  const mailtoSubject = `RE: ${subject || 'ALYGN - AI Governance'}`;
  const mailtoBody = `Greetings, Tania.

I am interested in exploring how we can support ${companyName || 'your organization'} with the AI governance challenges we both are facing. Can we coordinate a call to discuss this further?`;
  const mailtoLink = `mailto:tanialeaidm@gmail.com?subject=${encodeURIComponent(mailtoSubject)}&body=${encodeURIComponent(mailtoBody)}&Bcc=outreach@alyygn.com`;

  // Build custom hook HTML if provided
  const hookHtml = customHook ? `<p style="margin: 16px 0; line-height: 1.6; font-style: italic; color: #4b5563;">${customHook}</p>` : '';

  // Build pain points HTML
  const painPointsHtml = Array.isArray(painPoints) && painPoints.length > 0
    ? `<p style="margin: 16px 0; line-height: 1.6;">${copy.painPointsIntro}</p>
<ul style="margin: 16px 0; line-height: 1.8; padding-left: 24px;">
  ${painPoints.slice(0, 3).map(p => `<li>${typeof p === 'string' ? p.trim() : p}</li>`).join('')}
</ul>`
    : '';

  // Build HTML
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject || 'ALYGN - AI Governance'}</title>
  ${emailStyle}
</head>
<body>
  <div class="container">
    ${buildHeader(logoImg)}
    <div class="content">
      <p class="greeting">Hi ${firstName}${companyName ? ` at ${companyName}` : ''},</p>
      <div class="body-content">
        <p>${copy.intro}</p>
        ${hookHtml}
        ${painPointsHtml}
      </div>
      <p class="closing">${copy.closing}</p>
      <a href="${mailtoLink}" class="cta-button">${copy.cta}</a>
      <p class="ps">${copy.customPS}</p>
    </div>
    ${buildFooter(variant)}
  </div>
</body>
</html>`;

  const text = generatePlainText(html);

  return {
    subject: subject || 'ALYGN - AI Governance',
    html: html.trim(),
    text
  };
}

// Helper functions
function getBase64Image(imagePath) {
  try {
    if (fs.existsSync(imagePath)) {
      return fs.readFileSync(imagePath, 'base64').toString();
    }
  } catch (err) {
    console.error(`Failed to read image: ${imagePath}`, err.message);
  }
  return '';
}

function buildHeader(logoImg) {
  return `<div class="header">
  <div class="header-brand">
    <h2 class="brand-name">ALYGN</h2>
    ${logoImg}
  </div>
</div>`;
}

function buildFooter(variant) {
  const year = new Date().getFullYear();
  return `<div class="footer">
  <p style="margin: 0 0 12px 0;">
    Alygn - Independent AI Governance Institution | Institutional Permanence<br>
    Texas, EE.UU. | ${year} © All rights reserved.
  </p>
  <p style="margin: 0; font-size: 14px;">
    <a href="https://x.com/aialygn?utm_source=email&utm_medium=outreach&utm_campaign=${variant}" style="display: inline-block; margin: 0 8px;">𝕏 @aialygn</a> | 
    <a href="https://linkedin.com/company/alygn?utm_source=email&utm_medium=outreach&utm_campaign=${variant}" style="display: inline-block; margin: 0 8px;">💼 LinkedIn</a>
  </p>
</div>`;
}

function generatePlainText(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

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
    vertical-align: middle;
    gap: 12px;
    margin-left: auto;
    margin-right: auto;
  }
  .header-brand h2 {
    margin-top: auto;
    margin-bottom: auto;
  }
  .brand-name {
    color: #ffffff !important;
    font-size: 28px;
    font-weight: 700;
    margin: 0;
    letter-spacing: 2px;
    text-transform: uppercase;
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
  .closing {
    margin-top: 24px;
    font-size: 15px;
    color: #374151;
  }
  .cta-button {
    display: inline-block;
    background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
    color: #ffffff !important;
    text-decoration: none;
    padding: 12px 24px;
    border-radius: 6px;
    font-weight: 500;
    margin: 24px 0;
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

// Backwards compatibility exports
export { generateEmail as generateEmailForMunicipality, generateEmailHTML as generateEmailForVC };
export default { generateEmail, generateEmailHTML };
