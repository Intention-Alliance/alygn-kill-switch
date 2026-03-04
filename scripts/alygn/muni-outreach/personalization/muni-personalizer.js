/**
 * Municipal Personalization Script
 * Generates personalized outreach emails using Grok API
 * 
 * Context: Based on "Propuesta de Integración al Marco de Gobernanza Global de IA"
 * See: /docs/alygn/PROPUESTA-RESUMEN-CONTEXT.md
 * 
 * Usage:
 *   node muni-personalizer.js --input=/tmp/muni-cr-researched.json --mock
 */

const fs = require('fs');

const GROK_API_KEY = process.env.GROK_API_KEY;
const GROK_ENDPOINT = process.env.GROK_ENDPOINT || 'https://api.x.ai/v1';
const GROK_MODEL = process.env.GROK_MODEL || 'grok-4-1-fast-reasoning';
const MOCK_MODE = process.argv.includes('--mock');

// Email templates - 100% SPANISH (Costa Rica official language)
// CRITICAL: ALL communications MUST be in Spanish for Costa Rican municipalities
const TEMPLATES = {
  governance: {
    subject: 'Alianza Estratégica para la Salvaguarda Institucional - {municipality}',
    body: `Estimado/a Alcalde(sa) {mayor_name},

{municipality} está atravesando la misma transición hacia sistemas de Inteligencia Artificial Avanzada que operan a escala global y sistémica.

Estos sistemas no son simples herramientas de software, sino infraestructuras que alterarán la administración pública, la seguridad y la toma de decisiones en su gobierno local.

Alygn funciona como una capa de gobernanza y coordinación neutral—similar a como SWIFT permite coordinación financiera global sin ser un banco, o los organismos de aviación civil aseguran seguridad aérea sin operar aviones.

Nuestra alianza no es una contratación de servicios, sino un acto de defensa institucional que permite a {municipality}:

• Alineación Pre-Crisis: Adoptar protocolos de seguridad antes del despliegue de sistemas
• Interoperabilidad de Gobernanza: Supervisión bajo estándar único y neutral
• Protocolos de Emergencia 24/7: Canales de escalabilidad con Frontier Labs
• Mitigación de Riesgo de Responsabilidad: Diligencia debida demostrada

{personalized_pain_point}

La gobernanza legítima, no la tecnología, es la infraestructura que escala.

¿Estaría abierto/a a una conversación de 30 minutos sobre cómo Alygn convierte riesgos externos impredecibles en certidumbre institucional predecible para {municipality}?

Saludos cordiales,
{name}
Coordinación de Gobernanza de Alygn

--
Alygn: Infraestructura neutral de gobernanza de IA | Constituida en Texas, EE.UU.
@aialygn | Coordinación antes de crisis`
  },
  institutional: {
    subject: 'La Gobernanza no Puede Ser Improvisada Durante una Crisis',
    body: `Estimado/a Alcalde(sa) {mayor_name},

Los riesgos más difíciles de la IA no son técnicos—institucionales.

Cuando los sistemas de IA operan a escala, el fallo de coordinación entre departamentos y jurisdicciones se convierte en la amenaza sistémica. La gobernanza no puede ser improvisada en frontier scale.

Alygn es una institución independiente de gobernanza de IA, constituida en Texas, cuyo mandato fundamental es hacer operativa la rendición de cuentas, la supervisión y la coordinación de sistemas de IA avanzada.

Tres pilares que ofrecemos a {municipality}:

1. Neutralidad Estructural: No construimos modelos de IA ni operamos sistemas
2. Revisión Independiente: Vías de auditoría sin conflictos de interés
3. Coordinación de Emergencia Proactiva: Preparación antes de que las condiciones de fallo fuerzen resultados fragmentados

{personalized_local_context}

Como adoptante temprano, {municipality} tendrá la oportunidad de definir el estándar para municipalidades en {region}, en lugar de ser receptor de regulaciones impuestas.

¿Disponible para una conversación la próxima semana?

La legitimidad institucional es la infraestructura que perdura.

Saludos cordiales,
{name}
Coordinación Institucional de Alygn

--
Alygn: Soporta coordinación, habilita rendición de cuentas | Texas, EE.UU.
@aialygn | Permanencia institucional, no ciclos de lucro`
  }
};

/**
 * Generates personalized emails for municipalities
 * @param {Array} municipalities - Researched municipalities
 * @param {boolean} mock - Use mock data
 * @returns {Promise<Array>} Municipalities with personalized emails
 */
async function personalizeOutreach(municipalities, mock = false) {
  console.log(`✍️  Generating personalized emails for ${municipalities.length} municipalities...`);
  
  if (mock || !GROK_API_KEY) {
    console.log('⚠️  Mock mode or no API key - using template-based personalization');
    return generateMockPersonalization(municipalities);
  }
  
  const personalized = [];
  
  for (const muni of municipalities) {
    try {
      const email = await generatePersonalizedEmail(muni);
      personalized.push({ ...muni, outreach: email });
    } catch (error) {
      console.error(`Error personalizing for ${muni.name}:`, error.message);
      personalized.push({
        ...muni,
        outreach_status: 'error',
        outreach_error: error.message
      });
    }
  }
  
  console.log(`✅ Personalized ${personalized.length} emails`);
  return personalized;
}

/**
 * Generates personalized email using Grok
 */
async function generatePersonalizedEmail(municipality) {
  // Choose variant based on municipality characteristics
  const variant = Math.random() > 0.5 ? 'governance' : 'institutional';
  const template = TEMPLATES[variant];
  
  // Use Grok to personalize pain points
  const prompt = buildPersonalizationPrompt(municipality, variant);
  
  const response = await fetch(`${GROK_ENDPOINT}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GROK_API_KEY}`
    },
    body: JSON.stringify({
      model: GROK_MODEL,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 500
    })
  });
  
  if (!response.ok) {
    throw new Error(`Grok API error: ${response.status}`);
  }
  
  const data = await response.json();
  const personalization = data.choices[0].message.content;
  
  // Fill template
  const body = template.body
    .replace('{mayor_name}', municipality.contacts?.mayor_name || 'Mayor')
    .replace('{municipality}', municipality.name)
    .replace('{personalized_pain_point}', personalization)
    .replace('{personalized_local_context}', personalization)
    .replace('{area}', 'technology governance')
    .replace('{name}', 'Alygn Team')
    .replace('{unsubscribe_link}', 'Click here to unsubscribe');
  
  return {
    variant,
    subject: template.subject.replace('{municipality}', municipality.name),
    body,
    generated_at: new Date().toISOString(),
    personalized_with: 'Grok'
  };
}

/**
 * Builds prompt for Grok personalization
 * Context: Propuesta de Integración al Marco de Gobernanza Global de IA
 */
function buildPersonalizationPrompt(municipality, variant) {
  return `Generate a personalized paragraph for a municipal outreach email based on Alygn's governance proposal.

**Municipality:** ${municipality.name}, ${municipality.country}
**Population:** ${municipality.population || 'N/A'}
**Region:** ${municipality.region || 'N/A'}
**Pain points:** ${(municipality.pain_points || []).join(', ') || 'None identified'}
**AI governance signals:** ${(municipality.ai_governance_signals || []).length > 0 ? 'Has existing AI initiatives' : 'No existing AI initiatives'}
**X/Twitter Handle:** ${municipality.x_handle || 'Not found'}

**Email variant:** ${variant}

${variant === 'governance' ? `
**GOVERNANCE FRAMEWORK:**
- Emphasize "coordination before crisis"
- Position as institutional defense, not service procurement
- Mention: SWIFT analogy (coordination without being operator)
- Highlight: Pre-crisis alignment, emergency protocols 24/7, liability mitigation
- Key phrase: "Governance legitimacy, not technology, is the infrastructure that scales"
` : `
**INSTITUTIONAL FRAMEWORK:**
- Emphasize: Institutional risks are harder than technical risks
- Position: Alygn as Texas-constituted independent institution
- Mention: Three pillars (Structural Neutrality, Independent Review, Proactive Emergency Coordination)
- Highlight: Early adopter advantage - define standards vs receive imposed regulations
- Key phrase: "Institutional legitimacy is the infrastructure that endures"
`}

**CONTEXT FROM X ENGAGEMENT:**
If municipality has X handle, reference recent engagement: "Following our recent conversation on X about [topic]..."

Write 2-3 sentences that:
1. Acknowledge their specific local context (region, population, challenges)
2. Connect to AI governance challenges using proposal language
3. Position Alygn as neutral coordination infrastructure (NOT consulting/tech provider)

**TONE:** Professional, institutional, non-promotional. Spanish or English based on country.`;
}

/**
 * Generates mock personalization (template-based)
 */
function generateMockPersonalization(municipalities) {
  return municipalities.map((muni, index) => {
    const variant = index % 2 === 0 ? 'governance' : 'institutional';
    const template = TEMPLATES[variant];
    
    const painPoint = muni.pain_points?.[0] || 'emerging technology governance';
    const personalizedText = `${muni.name} is well-positioned to lead on ${painPoint.toLowerCase()}, given its commitment to public service innovation and citizen-centric governance.`;
    
    const body = template.body
      .replace('{mayor_name}', muni.contacts?.mayor_name || 'Mayor')
      .replace('{municipality}', muni.name)
      .replace('{personalized_pain_point}', personalizedText)
      .replace('{personalized_local_context}', personalizedText)
      .replace('{area}', 'public service innovation')
      .replace('{name}', 'Alygn Team')
      .replace('{unsubscribe_link}', 'Click here to unsubscribe');
    
    return {
      ...muni,
      outreach: {
        variant,
        subject: template.subject.replace('{municipality}', muni.name),
        body,
        generated_at: new Date().toISOString(),
        personalized_with: 'Template (mock)',
        mock: true
      },
      outreach_status: 'ready'
    };
  });
}

/**
 * Saves personalized emails
 */
function saveResults(municipalities, outputFile) {
  const output = {
    personalized_at: new Date().toISOString(),
    count: municipalities.length,
    ready_count: municipalities.filter(m => m.outreach_status !== 'error').length,
    municipalities
  };
  
  fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));
  console.log(`💾 Saved to ${outputFile}`);
  
  return output;
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  
  const inputArg = args.find(a => a.startsWith('--input='));
  const outputArg = args.find(a => a.startsWith('--output='));
  
  if (!inputArg) {
    console.error('Usage: node muni-personalizer.js --input=/path/to/researched.json [--output=file.json] [--mock]');
    process.exit(1);
  }
  
  const inputFile = inputArg.split('=')[1];
  const outputFile = outputArg ? outputArg.split('=')[1] : '/tmp/muni-personalized.json';
  
  try {
    const data = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
    const municipalities = data.municipalities || data;
    
    personalizeOutreach(municipalities, MOCK_MODE)
      .then(personalized => {
        saveResults(personalized, outputFile);
        
        console.log('\n📊 Personalization Summary:');
        console.log(`   Total: ${personalized.length}`);
        console.log(`   Ready: ${personalized.filter(m => m.outreach_status !== 'error').length}`);
        console.log(`   Governance variant: ${personalized.filter(m => m.outreach?.variant === 'governance').length}`);
        console.log(`   Institutional variant: ${personalized.filter(m => m.outreach?.variant === 'institutional').length}`);
      })
      .catch(error => {
        console.error('❌ Error:', error.message);
        process.exit(1);
      });
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

module.exports = {
  personalizeOutreach,
  generatePersonalizedEmail,
  TEMPLATES
};
