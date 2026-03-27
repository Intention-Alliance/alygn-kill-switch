/**
 * Generate Engaging HTML Body for Municipal Outreach
 * Creates rich HTML content with visual elements, highlighting specific pain points
 * 
 * Usage:
 *   node generate-html-body.js --input=/tmp/muni-cr-personalized.json --output=/tmp/muni-cr-with-html.json
 */

import fs from "fs";

const MOCK_MODE = process.argv.includes('--mock');

/**
 * Generates engaging HTML body for a municipality
 * @param {Object} muni - Municipality data with pain points
 * @returns {Object} { bodyText, bodyHtml }
 */
function generateHtmlBody(muni) {
  const { name, province, population, mayor_name, pain_points_spanish, alygn_relevance, contacts } = muni;
  const mayorName = mayor_name || 'Alcalde/Alcaldesa';
  const firstName = mayorName.split(' ')[0];
  
  // Get top 3 pain points for highlighting
  const topPainPoints = (pain_points_spanish || []).slice(0, 3);
  const painPointsList = topPainPoints.length > 0 
    ? topPainPoints.map(p => `• ${p}`).join('\n')
    : '• Desafíos de gobernanza municipal\n• Coordinación interinstitucional\n• Preparación para tecnologías emergentes';

  // Get top 2 Alygn relevance points
  const topRelevance = (alygn_relevance || []).slice(0, 2);
  
  // Plain text version (for fallback)
  const bodyText = `Estimado/a ${mayorName},

${name} está atravesando una transición crítica hacia sistemas de Inteligencia Artificial que operarán a escala municipal y regional.

Estos sistemas no son simples herramientas de software—son infraestructuras que alterarán la administración pública, la seguridad y la toma de decisiones.

Alygn funciona como una capa de gobernanza y coordinación neutral, similar a como SWIFT permite coordinación financiera global sin ser un banco.

Nuestra alianza no es una contratación de servicios, sino un acto de defensa institucional que permite a ${name}:

  • Alineación Pre-Crisis: Protocolos antes del despliegue
  • Interoperabilidad de Gobernanza: Estándar único y neutral  
  • Protocolos de Emergencia 24/7: Canales con Frontier Labs
  • Mitigación de Riesgo: Diligencia debida demostrada

Desafíos específicos de ${name}:
${painPointsList}

La gobernanza legítima, no la tecnología, es la infraestructura que escala.

¿Estaría abierto/a a una conversación de 15 minutos sobre cómo Alygn convierte riesgos externos impredecibles en certidumbre institucional predecible?

Saludos cordiales,
Tania Lea
Directora de Operaciones, Alygn`;

  // Rich HTML version with visual elements
  const painPointsHtml = topPainPoints.map(p => `
            <tr>
              <td style="padding: 8px 0; vertical-align: top; width: 24px;">
                <span style="color: #0f172a; font-size: 18px;">•</span>
              </td>
              <td style="padding: 8px 0; color: #374151; font-size: 15px; line-height: 1.5;">
                ${p}
              </td>
            </tr>`).join('');

  const alygnValueProps = [
    { icon: '🛡️', title: 'Alineación Pre-Crisis', desc: 'Protocolos antes del despliegue de sistemas' },
    { icon: '🔗', title: 'Interoperabilidad', desc: 'Estándar único y neutral de gobernanza' },
    { icon: '🚨', title: 'Protocolos 24/7', desc: 'Canales de escalabilidad con Frontier Labs' },
    { icon: '⚖️', title: 'Mitigación de Riesgo', desc: 'Diligencia debida demostrada' }
  ].map(prop => `
          <div style="display: inline-block; width: 48%; margin: 1%; background: #f8fafc; border-left: 3px solid #0f172a; padding: 16px; box-sizing: border-box; vertical-align: top;">
            <div style="font-size: 24px; margin-bottom: 8px;">${prop.icon}</div>
            <div style="font-weight: 600; color: #0f172a; font-size: 14px; margin-bottom: 4px;">${prop.title}</div>
            <div style="color: #6b7280; font-size: 13px; line-height: 1.4;">${prop.desc}</div>
          </div>`).join('');

  const bodyHtml = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1f2937; line-height: 1.6;">
  
  <!-- Opening -->
  <p style="font-size: 16px; margin-bottom: 20px;">
    <strong>Estimado/a ${mayorName},</strong>
  </p>
  
  <p style="font-size: 15px; color: #374151; margin-bottom: 20px;">
    ${name} está atravesando una <strong>transición crítica</strong> hacia sistemas de Inteligencia Artificial que operarán a escala municipal y regional.
  </p>
  
  <!-- Highlight Box -->
  <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: #ffffff; padding: 20px; border-radius: 8px; margin: 24px 0;">
    <p style="margin: 0; font-size: 15px; line-height: 1.6;">
      <strong>Estos sistemas no son simples herramientas de software</strong>—son infraestructuras que alterarán la administración pública, la seguridad y la toma de decisiones en su gobierno local.
    </p>
  </div>
  
  <!-- Alygn Explanation -->
  <p style="font-size: 15px; color: #374151; margin: 20px 0;">
    <strong>Alygn</strong> funciona como una capa de gobernanza y coordinación <em>neutral</em>—similar a como SWIFT permite coordinación financiera global sin ser un banco, o los organismos de aviación civil aseguran seguridad aérea sin operar aviones.
  </p>
  
  <!-- Value Proposition -->
  <div style="margin: 24px 0;">
    <p style="font-size: 15px; color: #374151; margin-bottom: 16px;">
      <strong>Nuestra alianza no es una contratación de servicios, sino un acto de defensa institucional que permite a ${name}:</strong>
    </p>
    
    <div style="margin: 16px 0;">
      ${alygnValueProps}
    </div>
  </div>
  
  <!-- Pain Points Section -->
  ${topPainPoints.length > 0 ? `
  <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 20px; margin: 24px 0; border-radius: 0 8px 8px 0;">
    <p style="margin: 0 0 12px 0; font-weight: 600; color: #92400e; font-size: 15px;">
      Desafíos específicos identificados en ${name}:
    </p>
    <table style="width: 100%; border-collapse: collapse;">
      <tbody>
        ${painPointsHtml}
      </tbody>
    </table>
  </div>` : ''}
  
  <!-- Key Quote -->
  <div style="text-align: center; margin: 28px 0; padding: 20px; border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb;">
    <p style="font-size: 18px; font-style: italic; color: #0f172a; margin: 0; line-height: 1.5;">
      "La gobernanza legítima, no la tecnología, es la infraestructura que escala."
    </p>
  </div>
  
  <!-- CTA -->
  <p style="font-size: 15px; color: #374151; margin: 20px 0;">
    ¿Estaría abierto/a a una <strong>conversación de 15 minutos</strong> sobre cómo Alygn convierte riesgos externos impredecibles en certidumbre institucional predecible para ${name}?
  </p>
  
  <!-- Signature -->
  <div style="margin-top: 28px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
    <p style="margin: 0; font-size: 15px; color: #1f2937;">
      Saludos cordiales,<br><br>
      <strong>Tania Lea</strong><br>
      <span style="color: #6b7280; font-size: 14px;">Directora de Operaciones, Alygn</span>
    </p>
  </div>
  
  <!-- AI Transparency -->
  <p style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 13px; color: #9ca3af; font-style: italic;">
    P.D.: Esta comunicación fue asistida por IA y revisada por humanos. Transparencia total en nuestros procesos.
  </p>
  
</div>`;

  return { bodyText, bodyHtml };
}

/**
 * Process all municipalities and add HTML bodies
 */
function processMunicipalities(inputFile, outputFile) {
  console.log(`🔧 Processing municipalities from ${inputFile}...\n`);
  
  const data = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
  const municipalities = data.municipalities || data;
  
  const processed = municipalities.map((muni, index) => {
    const { bodyText, bodyHtml } = generateHtmlBody(muni);
    
    console.log(`✅ ${muni.name}: Generated HTML body (${bodyHtml.length} chars)`);
    
    return {
      ...muni,
      outreach: {
        ...muni.outreach,
        body: bodyText,
        bodyHtml: bodyHtml,
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
  console.log(`   With HTML: ${processed.filter(m => m.outreach?.bodyHtml).length}`);
  
  return output;
}

// CLI usage
if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  const args = process.argv.slice(2);
  
  const inputArg = args.find(a => a.startsWith('--input='));
  const outputArg = args.find(a => a.startsWith('--output='));
  
  if (!inputArg) {
    console.error('Usage: node generate-html-body.js --input=/path/to/personalized.json [--output=file.json]');
    console.error('');
    console.error('Example:');
    console.error('  node generate-html-body.js --input=/tmp/muni-cr-personalized.json --output=/tmp/muni-cr-with-html.json');
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

export { generateHtmlBody, processMunicipalities };
