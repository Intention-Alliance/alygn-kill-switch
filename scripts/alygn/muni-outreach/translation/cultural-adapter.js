/**
 * Cultural Adapter for Multi-Agent Translation System
 * 
 * Provides cultural context to Translator and Reviewer agents
 * Ensures communications are culturally appropriate, not just linguistically correct
 * 
 * Usage:
 *   node cultural-adapter.js --country=CR --content-type=email
 *   node cultural-adapter.js --country=FR --content-type=x-post
 */

import fs from "fs";
import path from "path";

// Load language config
const LANGUAGE_CONFIG_PATH = path.join(__dirname, '../discovery/language-config.json');

/**
 * Load cultural adapter data for a country
 */
function loadCulturalAdapter(countryCode) {
  const config = JSON.parse(fs.readFileSync(LANGUAGE_CONFIG_PATH, 'utf8'));
  const countryConfig = config.countries[countryCode];
  
  if (!countryConfig) {
    throw new Error(`Country ${countryCode} not found in language config`);
  }
  
  return {
    countryCode,
    countryName: countryConfig.name,
    primaryLanguage: countryConfig.primary_language,
    culturalAdapter: countryConfig.cultural_adapter || {},
    culturalNotes: countryConfig.cultural_notes || [],
    euRequirements: countryConfig.eu_requirements || null
  };
}

/**
 * Generate cultural context prompt for Translator agent
 */
function generateTranslatorPrompt(content, targetLanguage, culturalData) {
  const { culturalAdapter, countryName, culturalNotes } = culturalData;
  
  return `You are translating content for ${countryName} (${targetLanguage}).

**CULTURAL CONTEXT (CRITICAL FOR QUALITY):**

**Formality Level:** ${culturalAdapter.formality_level || 'medium'}
- Use ${culturalAdapter.address_style || 'appropriate formal address'}

**Communication Style:** ${culturalAdapter.communication_style || 'neutral'}
- ${culturalAdapter.relationship_building === 'important' ? 'Build relationship before business' : 'Get to the point'}
- ${culturalAdapter.time_orientation === 'flexible' ? 'Allow for flexible time perception' : 'Respect punctuality'}

**Hierarchy & Respect:** ${culturalAdapter.hierarchy_respect || 'medium'}
- Use titles: ${JSON.stringify(culturalAdapter.titles || {})}

**Taboo Topics (AVOID):** ${culturalAdapter.taboo_topics?.join(', ') || 'None specified'}
**Preferred Topics (EMPHASIZE):** ${culturalAdapter.preferred_topics?.join(', ') || 'None specified'}

**Business Etiquette:**
${culturalAdapter.business_etiquette?.map(item => `- ${item}`).join('\n') || '- Standard professional etiquette'}

**Email Norms:**
- Greeting required: ${culturalAdapter.email_norms?.greeting_required || true}
- Signature required: ${culturalAdapter.email_norms?.signature_required || true}
- Formal register: ${culturalAdapter.email_norms?.formal_register || false}
- Emoji usage: ${culturalAdapter.email_norms?.emoji_usage || 'never'}

**Cultural Notes:**
${culturalNotes.map(note => `- ${note}`).join('\n')}

**TRANSLATION REQUIREMENTS:**
1. Translate from English to ${targetLanguage}
2. Adapt culturally (not just literal translation)
3. Use appropriate formality level
4. Avoid taboo topics
5. Emphasize preferred topics where relevant
6. Follow email norms for ${countryName}

**ORIGINAL CONTENT:**
${content}

**OUTPUT FORMAT (JSON):**
{
  "original_text": "...",
  "translated_text": "...",
  "target_language": "${targetLanguage}",
  "cultural_adaptations": ["list specific adaptations made"],
  "formality_level_used": "${culturalAdapter.formality_level || 'medium'}",
  "titles_used": ["list titles used"],
  "taboo_topics_avoided": ["list any taboo topics that were in original"],
  "confidence_score": 0.0-1.0,
  "notes": "..."
}`;
}

/**
 * Generate cultural context prompt for Reviewer agent
 */
function generateReviewerPrompt(translation, original, culturalData) {
  const { culturalAdapter, countryName, culturalNotes } = culturalData;
  
  return `You are reviewing a translation for ${countryName}.

**CULTURAL QUALITY CRITERIA:**

**1. Formality Check:**
- Required level: ${culturalAdapter.formality_level || 'medium'}
- Address style: ${culturalAdapter.address_style || 'appropriate'}
- Closing style: ${culturalAdapter.closing_style || 'appropriate'}

**2. Communication Style:**
- Expected: ${culturalAdapter.communication_style || 'neutral'}
- Relationship building: ${culturalAdapter.relationship_building || 'standard'}
- Time orientation: ${culturalAdapter.time_orientation || 'standard'}

**3. Hierarchy & Titles:**
- Respect level: ${culturalAdapter.hierarchy_respect || 'medium'}
- Required titles: ${JSON.stringify(culturalAdapter.titles || {})}

**4. Cultural Sensitivity:**
- AVOID these topics: ${culturalAdapter.taboo_topics?.join(', ') || 'None'}
- PREFER these topics: ${culturalAdapter.preferred_topics?.join(', ') || 'None'}

**5. Business Etiquette:**
${culturalAdapter.business_etiquette?.map(item => `- ${item}`).join('\n') || '- Standard'}

**6. Email Norms:**
${Object.entries(culturalAdapter.email_norms || {}).map(([key, value]) => `- ${key}: ${value}`).join('\n') || '- Standard'}

**CULTURAL NOTES FOR ${countryName.toUpperCase()}:**
${culturalNotes.map(note => `- ${note}`).join('\n')}

**REVIEW TASK:**
1. Check if translation uses correct formality level
2. Verify appropriate titles are used
3. Ensure no taboo topics are present
4. Confirm communication style matches culture
5. Validate email norms are followed
6. Check for cultural adaptation (not just translation)

**ORIGINAL (English):**
${original}

**TRANSLATION (${culturalData.primaryLanguage}):**
${translation}

**OUTPUT FORMAT (JSON):**
{
  "review_status": "PASS|REJECT",
  "quality_score": 0.0-1.0,
  "cultural_fit_score": 0.0-1.0,
  "formality_check": {
    "passed": true|false,
    "issues": ["list any formality issues"]
  },
  "cultural_sensitivity_check": {
    "passed": true|false,
    "taboo_topics_found": ["list any taboo topics"],
    "preferred_topics_used": ["list preferred topics used"]
  },
  "titles_check": {
    "passed": true|false,
    "titles_used": ["list titles"],
    "titles_missing": ["list missing titles"]
  },
  "email_norms_check": {
    "passed": true|false,
    "issues": ["list email norm violations"]
  },
  "issues_found": ["list all issues"],
  "suggestions": ["list specific improvements"],
  "revision_required": true|false,
  "revision_notes": "detailed feedback for translator"
}`;
}

/**
 * Get cultural adaptation checklist
 */
function getCulturalChecklist(countryCode) {
  const culturalData = loadCulturalAdapter(countryCode);
  const { culturalAdapter } = culturalData;
  
  return {
    country: culturalData.countryName,
    language: culturalData.primaryLanguage,
    checklist: [
      {
        criterion: 'Formality Level',
        required: culturalAdapter.formality_level,
        check: 'Verify appropriate formality in address and closing'
      },
      {
        criterion: 'Titles',
        required: Object.values(culturalAdapter.titles || {}).join(', '),
        check: 'Ensure proper titles are used for officials'
      },
      {
        criterion: 'Communication Style',
        required: culturalAdapter.communication_style,
        check: 'Match communication style to cultural expectations'
      },
      {
        criterion: 'Taboo Topics',
        avoid: culturalAdapter.taboo_topics?.join(', '),
        check: 'Ensure no taboo topics are mentioned'
      },
      {
        criterion: 'Preferred Topics',
        emphasize: culturalAdapter.preferred_topics?.join(', '),
        check: 'Incorporate preferred topics where relevant'
      },
      {
        criterion: 'Email Norms',
        norms: culturalAdapter.email_norms,
        check: 'Follow local email etiquette'
      },
      {
        criterion: 'Business Etiquette',
        etiquette: culturalAdapter.business_etiquette?.join(', '),
        check: 'Respect local business customs'
      }
    ]
  };
}

/**
 * CLI Entry Point
 */
if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  const args = process.argv.slice(2);
  
  const countryArg = args.find(a => a.startsWith('--country='));
  const contentTypeArg = args.find(a => a.startsWith('--content-type='));
  const actionArg = args.find(a => a.startsWith('--action='));
  
  if (!countryArg) {
    console.error('Usage: node cultural-adapter.js --country=CR [--content-type=email|x-post] [--action=info|prompt]');
    process.exit(1);
  }
  
  const countryCode = countryArg.split('=')[1];
  const contentType = contentTypeArg ? contentTypeArg.split('=')[1] : 'email';
  const action = actionArg ? actionArg.split('=')[1] : 'info';
  
  try {
    const culturalData = loadCulturalAdapter(countryCode);
    
    if (action === 'info') {
      console.log(`\n🌍 Cultural Adapter: ${culturalData.countryName} (${countryCode})`);
      console.log('='.repeat(60));
      console.log(`\n📋 Language: ${culturalData.primaryLanguage}`);
      console.log(`\n🎭 Formality Level: ${culturalData.culturalAdapter.formality_level || 'medium'}`);
      console.log(`\n💬 Communication Style: ${culturalData.culturalAdapter.communication_style || 'neutral'}`);
      console.log(`\n🏛️ Hierarchy Respect: ${culturalData.culturalAdapter.hierarchy_respect || 'medium'}`);
      console.log(`\n🚫 Taboo Topics: ${culturalData.culturalAdapter.taboo_topics?.join(', ') || 'None'}`);
      console.log(`\n✅ Preferred Topics: ${culturalData.culturalAdapter.preferred_topics?.join(', ') || 'None'}`);
      console.log(`\n📧 Email Norms:`);
      Object.entries(culturalData.culturalAdapter.email_norms || {}).forEach(([key, value]) => {
        console.log(`   - ${key}: ${value}`);
      });
      console.log(`\n📝 Cultural Notes:`);
      culturalData.culturalNotes.forEach(note => {
        console.log(`   - ${note}`);
      });
      
    } else if (action === 'prompt' && contentType === 'email') {
      const sampleContent = 'Dear Mayor, Our alliance enables coordination without centralization...';
      const translatorPrompt = generateTranslatorPrompt(sampleContent, culturalData.primaryLanguage, culturalData);
      console.log('\n🤖 Translator Agent Prompt:');
      console.log('='.repeat(60));
      console.log(translatorPrompt);
      
    } else if (action === 'checklist') {
      const checklist = getCulturalChecklist(countryCode);
      console.log('\n✅ Cultural Adaptation Checklist:');
      console.log('='.repeat(60));
      console.log(`Country: ${checklist.country}`);
      console.log(`Language: ${checklist.language}`);
      console.log('\nChecklist:');
      checklist.checklist.forEach((item, idx) => {
        console.log(`\n${idx + 1}. ${item.criterion}`);
        console.log(`   Required: ${item.required || item.avoid || item.emphasize}`);
        console.log(`   Check: ${item.check}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

export {
  loadCulturalAdapter,
  generateTranslatorPrompt,
  generateReviewerPrompt,
  getCulturalChecklist
};
