/**
 * Language Guard - Validates that content is in the expected language
 * 
 * Prevents English content from slipping into Spanish-language municipal data.
 * This is the B-001 regression guard: C-001 fixed the symptom, this prevents the disease.
 * 
 * Usage:
 *   import { assertSpanishContent, isSpanishPainPoint } from './lang-guard';
 *   
 *   // Validate pain points array
 *   assertSpanishPainPoints(['Complejidad de la transformación digital']); // ✅ passes
 *   assertSpanishPainPoints(['Digital transformation complexity']); // ❌ throws
 *   
 *   // Validate a single string
 *   isSpanishPainPoint('Recursos técnicos limitados'); // true
 *   isSpanishPainPoint('Limited technical resources'); // false
 */

/**
 * Common English pain points that have been found in the codebase.
 * These are the exact strings that C-001 fixed in fromCanton().
 * If any of these appear, they must be replaced with their Spanish equivalents.
 */
const ENGLISH_PAIN_POINT_PATTERNS: RegExp[] = [
  /\bdigital transformation\b/i,
  /\blimited technical resources\b/i,
  /\bcitizen service delivery\b/i,
  /\bdata governance and privacy\b/i,
  /\binter-agency coordination\b/i,
  /\bai accountability\b/i,
  /\bresource constraints\b/i,
  /\bservice delivery\b/i,
  /\bai governance\b/i,
  /\bdigital transformation complexity\b/i,
  /\bairport expansion coordination\b/i,
  /\bretiree community services\b/i,
  /\bagricultural transition\b/i,
  /\burban planning\b/i,
  /\binfrastructure modernization\b/i,
  /\btourism management\b/i,
  /\bpublic safety\b/i,
  /\bwater management\b/i,
  /\btransportation coordination\b/i,
  /\benvironmental compliance\b/i,
  /\bindustrial growth\b/i,
  /\brural development\b/i,
  /\bindustrial park development\b/i,
  /\binfrastructure\b/i,
  /\brural connectivity\b/i,
  /\bagricultural economy\b/i,
];

/**
 * Spanish pain points that should be used instead of English ones.
 * These are the canonical Spanish translations for CR municipal outreach.
 */
export const SPANISH_PAIN_POINTS: string[] = [
  'Complejidad de la transformación digital',
  'Recursos técnicos limitados',
  'Entrega de servicios ciudadanos',
  'Gobernanza de datos y privacidad',
  'Coordinación interinstitucional',
];

/**
 * Map of English → Spanish pain point translations
 */
const ENGLISH_TO_SPANISH: Record<string, string> = {
  'Digital transformation complexity': 'Complejidad de la transformación digital',
  'Limited technical resources': 'Recursos técnicos limitados',
  'Citizen service delivery': 'Entrega de servicios ciudadanos',
  'Data governance and privacy': 'Gobernanza de datos y privacidad',
  'Inter-agency coordination': 'Coordinación interinstitucional',
  'Digital transformation': 'Transformación digital',
  'AI accountability': 'Rendición de cuentas en IA',
  'Resource constraints': 'Restricciones de recursos',
  'Service delivery': 'Entrega de servicios',
  'AI governance': 'Gobernanza de IA',
  'Citizen services': 'Servicios ciudadanos',
  'Airport expansion coordination': 'Coordinación de expansión aeroportuaria',
  'Retiree community services': 'Servicios para comunidad de jubilados',
  'Agricultural transition': 'Transición agrícola',
  'Urban planning': 'Planificación urbana',
  'Infrastructure modernization': 'Modernización de infraestructura',
  'Tourism management': 'Gestión turística',
  'Public safety': 'Seguridad pública',
  'Water management': 'Gestión del agua',
  'Transportation coordination': 'Coordinación de transporte',
  'Environmental compliance': 'Cumplimiento ambiental',
  'Industrial growth': 'Crecimiento industrial',
  'Rural development': 'Desarrollo rural',
  'Industrial park development': 'Desarrollo de parque industrial',
  'Infrastructure': 'Infraestructura',
  'Rural connectivity': 'Conectividad rural',
  'Agricultural economy': 'Economía agrícola',
};

/**
 * Check if a single string contains English pain point patterns
 */
export function containsEnglishPainPoint(text: string): boolean {
  return ENGLISH_PAIN_POINT_PATTERNS.some(pattern => pattern.test(text));
}

/**
 * Check if a single pain point string is valid Spanish
 * Returns true if the string does NOT match any English patterns
 */
export function isSpanishPainPoint(painPoint: string): boolean {
  return !containsEnglishPainPoint(painPoint);
}

/**
 * Translate an English pain point to Spanish if a known mapping exists
 * Returns the Spanish translation, or the original if no mapping found
 */
export function translatePainPoint(english: string): string {
  const trimmed = english.trim();
  for (const [eng, spa] of Object.entries(ENGLISH_TO_SPANISH)) {
    if (trimmed.toLowerCase() === eng.toLowerCase()) {
      return spa;
    }
  }
  return trimmed; // Return as-is if no mapping
}

/**
 * Translate an array of pain points, converting any English ones to Spanish
 */
export function translatePainPoints(painPoints: string[]): string[] {
  return painPoints.map(translatePainPoint);
}

/**
 * Validate that all pain points in an array are in Spanish
 * Throws an error if any English patterns are detected
 */
export function assertSpanishPainPoints(painPoints: string[], context: string = 'MunicipalEntity'): void {
  const englishItems: string[] = [];
  
  for (const pp of painPoints) {
    if (containsEnglishPainPoint(pp)) {
      englishItems.push(pp);
    }
  }
  
  if (englishItems.length > 0) {
    const suggestions = englishItems.map(e => `  "${e}" → "${translatePainPoint(e)}"`).join('\n');
    throw new Error(
      `[${context}] English pain points detected. Use Spanish equivalents:\n${suggestions}\n\n` +
      `This is a data integrity guard (B-001). If you need English content, use a different entity type.`
    );
  }
}

/**
 * Validate that a string field is in Spanish (basic heuristic)
 * Checks for common English-only words that shouldn't appear in Spanish content
 */
export function assertSpanishString(value: string, fieldName: string, context: string = 'MunicipalEntity'): void {
  // Skip null/empty
  if (!value) return;
  
  // Common English-only phrases that indicate English content
  const englishPhrases = [
    /\bsupport(s|ed|ing)? (municipal|city|local) (governance|AI)/i,
    /\bTRAIGA Act compliance/i,
    /\bdigital transformation\b/i,
  ];
  
  for (const pattern of englishPhrases) {
    if (pattern.test(value)) {
      throw new Error(
        `[${context}] English content detected in field "${fieldName}": "${value.substring(0, 80)}..."\n` +
        `Spanish content is required for municipal outreach.`
      );
    }
  }
}

/**
 * Validate a MunicipalEntity's typeData for Spanish content integrity
 * Comprehensive check across all string fields
 */
export function validateMunicipalSpanishIntegrity(typeData: {
  painPoints?: string[];
  procurementProcess?: string | null;
  departments?: Array<{ name: string; focus: string[] }>;
  initiatives?: Array<{ name: string; description: string }>;
}): { valid: boolean; violations: string[] } {
  const violations: string[] = [];
  
  // Check pain points
  if (typeData.painPoints) {
    for (const pp of typeData.painPoints) {
      if (containsEnglishPainPoint(pp)) {
        violations.push(`painPoint: "${pp}" → should be "${translatePainPoint(pp)}"`);
      }
    }
  }
  
  // Check procurement process
  if (typeData.procurementProcess && containsEnglishPainPoint(typeData.procurementProcess)) {
    violations.push(`procurementProcess: "${typeData.procurementProcess}"`);
  }
  
  // Check department names (should be Spanish for CR municipalities)
  if (typeData.departments) {
    for (const dept of typeData.departments) {
      if (containsEnglishPainPoint(dept.name)) {
        violations.push(`department.name: "${dept.name}"`);
      }
      for (const focus of dept.focus) {
        if (containsEnglishPainPoint(focus)) {
          violations.push(`department.focus: "${focus}" in "${dept.name}"`);
        }
      }
    }
  }
  
  // Check initiative names/descriptions
  if (typeData.initiatives) {
    for (const init of typeData.initiatives) {
      if (containsEnglishPainPoint(init.name)) {
        violations.push(`initiative.name: "${init.name}"`);
      }
      if (containsEnglishPainPoint(init.description)) {
        violations.push(`initiative.description: "${init.description}"`);
      }
    }
  }
  
  return {
    valid: violations.length === 0,
    violations
  };
}