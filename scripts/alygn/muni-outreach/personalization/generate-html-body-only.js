/**
 * Generate Engaging HTML Body Content ONLY (for injection into template)
 * 
 * This generates ONLY the middle content that gets injected between the
 * variant intro and the closing. The template handles:
 * - Greeting
 * - Variant intro (governance/institutional/traiga)
 * - Pain points (optional)
 * - THIS bodyHtml content
 * - Closing
 * - CTA
 * - Footer/PS
 * 
 * Usage:
 *   node generate-html-body-only.js --input=/tmp/muni-cr-personalized.json --output=/tmp/muni-cr-with-html.json
 */

import fs from "fs";

/**
 * Generates ONLY the middle HTML content for injection
 * No greeting, no intro, no closing, no signature - just the engaging middle content
 */
function generateBodyContentOnly(muni) {
  const { name, pain_points_spanish } = muni;
  
  // Get top 3 pain points
  const topPainPoints = (pain_points_spanish || []).slice(0, 3);
  
  // Value props as visual cards
  const valuePropsHtml = `
<div style="margin: 24px 0;">
  <p style="font-size: 15px; color: #374151; margin-bottom: 16px;">
    <strong>Nuestra alianza no es una contratación de servicios, sino un acto de defensa institucional que permite a ${name}:</strong>
  </p>
  
  <div style="margin: 16px 0;">
    <div style="display: inline-block; width: 48%; margin: 1%; background: #f8fafc; border-left: 3px solid #0f172a; padding: 16px; box-sizing: border-box; vertical-align: top;">
      <div style="font-size: 20px; margin-bottom: 8px;">🛡️</div>
      <div style="font-weight: 600; color: #0f172a; font-size: 14px; margin-bottom: 4px;">Alineación Pre-Crisis</div>
      <div style="color: #6b7280; font-size: 13px; line-height: 1.4;">Protocolos antes del despliegue</div>
    </div>
    <div style="display: inline-block; width: 48%; margin: 1%; background: #f8fafc; border-left: 3px solid #0f172a; padding: 16px; box-sizing: border-box; vertical-align: top;">
      <div style="font-size: 20px; margin-bottom: 8px;">🔗</div>
      <div style="font-weight: 600; color: #0f172a; font-size: 14px; margin-bottom: 4px;">Interoperabilidad</div>
      <div style="color: #6b7280; font-size: 13px; line-height: 1.4;">Estándar único y neutral</div>
    </div>
    <div style="display: inline-block; width: 48%; margin: 1%; background: #f8fafc; border-left: 3px solid #0f172a; padding: 16px; box-sizing: border-box; vertical-align: top;">
      <div style="font-size: 20px; margin-bottom: 8px;">🚨</div>
      <div style="font-weight: 600; color: #0f172a; font-size: 14px; margin-bottom: 4px;">Protocolos 24/7</div>
      <div style="color: #6b7280; font-size: 13px; line-height: 1.4;">Canales con Frontier Labs</div>
    </div>
    <div style="display: inline-block; width: 48%; margin: 1%; background: #f8fafc; border-left: 3px solid #0f172a; padding: 16px; box-sizing: border-box; vertical-align: top;">
      <div style="font-size: 20px; margin-bottom: 8px;">⚖️</div>
      <div style="font-weight: 600; color: #0f172a; font-size: 14px; margin-bottom: 4px;">Mitigación de Riesgo</div>
      <div style="color: #6b7280; font-size: 13px; line-height: 1.4;">Diligencia debida demostrada</div>
    </div>
  </div>
</div>`;

  // Pain points section
  const painPointsHtml = topPainPoints.length > 0 ? `
<div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 20px; margin: 24px 0; border-radius: 0 8px 8px 0;">
  <p style="margin: 0 0 12px 0; font-weight: 600; color: #92400e; font-size: 15px;">
    Desafíos específicos identificados en ${name}:
  </p>
  <table style="width: 100%; border-collapse: collapse;">
    <tbody>
      ${topPainPoints.map(p => `
        <tr>
          <td style="padding: 8px 0; vertical-align: top; width: 24px;">
            <span style="color: #0f172a; font-size: 18px;">•</span>
          </td>
          <td style="padding: 8px 0; color: #374151; font-size: 15px; line-height: 1.5;">
            ${p}
          </td>
        </tr>`).join('')}
    </tbody>
  </table>
</div>` : '';

  // Key quote
  const quoteHtml = `
<div style="text-align: center; margin: 28px 0; padding: 20px; border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb;">
  <p style="font-size: 18px; font-style: italic; color: #0f172a; margin: 0; line-height: 1.5;">
    "La gobernanza legítima, no la tecnología, es la infraestructura que escala."
  </p>
</div>`;

  // CTA - just the text part, template adds the button
  const ctaTextHtml = `
<p style="font-size: 15px; color: #374151; margin: 20px 0;">
  ¿Estaría abierto/a a una <strong>conversación de 15 minutos</strong> sobre cómo Alygn convierte riesgos externos impredecibles en certidumbre institucional predecible para ${name}?
</p>`;

  // Combine ONLY the middle content
  const bodyHtml = valuePropsHtml + painPointsHtml + quoteHtml + ctaTextHtml;
  
  // Plain text version for fallback
  const painPointsText = topPainPoints.map(p => `• ${p}`).join('\n');
  const bodyText = `Nuestra alianza no es una contratación de servicios, sino un acto de defensa institucional que permite a ${name}:

  • Alineación Pre-Crisis: Protocolos antes del despliegue
  • Interoperabilidad de Gobernanza: Estándar único y neutral  
  • Protocolos de Emergencia 24/7: Canales con Frontier Labs
  • Mitigación de Riesgo: Diligencia debida demostrada

${topPainPoints.length > 0 ? `Desafíos específicos identificados en ${name}:\n${painPointsText}\n\n` : ''}La gobernanza legítima, no la tecnología, es la infraestructura que escala.

¿Estaría abierto/a a una conversación de 15 minutos sobre cómo Alygn convierte riesgos externos impredecibles en certidumbre institucional predecible para ${name}?`;

  return { bodyText, bodyHtml };
}

/**
 * Process all municipalities and add body content
 */
function processMunicipalities(inputFile, outputFile) {
  console.log(`🔧 Processing municipalities from ${inputFile}...\n`);
  
  const data = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
  const municipalities = data.municipalities || data;
  
  const processed = municipalities.map((muni) => {
    const { bodyText, bodyHtml } = generateBodyContentOnly(muni);
    
    console.log(`✅ ${muni.name}: Generated body content (${bodyHtml.length} chars)`);
    
    return {
      ...muni,
      outreach: {
        ...muni.outreach,
        body: bodyText,      // Plain text fallback
        bodyHtml: bodyHtml,  // Rich HTML content (middle section only)
        has_html: true,
        generated_at: new Date().toISOString()
      }
    };
  });
  
  const output = {
    generated_at: new Date().toISOString(),
    count: processed.length,
    municipalities: processed
  };
  
  fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));
  console.log(`\n💾 Saved to ${outputFile}`);
  console.log(`\n📊 Summary:`);
  console.log(`   Total: ${processed.length} municipalities`);
  console.log(`   With bodyHtml: ${processed.filter(m => m.outreach?.bodyHtml).length}`);
  
  return output;
}

// CLI usage
if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  const args = process.argv.slice(2);
  
  const inputArg = args.find(a => a.startsWith('--input='));
  const outputArg = args.find(a => a.startsWith('--output='));
  
  if (!inputArg) {
    console.error('Usage: node generate-html-body-only.js --input=/path/to/personalized.json [--output=file.json]');
    console.error('');
    console.error('Example:');
    console.error('  node generate-html-body-only.js --input=/tmp/muni-cr-personalized.json --output=/tmp/muni-cr-with-html.json');
    process.exit(1);
  }
  
  const inputFile = inputArg.split('=')[1];
  const outputFile = outputArg ? outputArg.split('=')[1] : '/tmp/muni-cr-with-html.json';
  
  try {
    processMunicipalities(inputFile, outputFile);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

export { generateBodyContentOnly, processMunicipalities };
