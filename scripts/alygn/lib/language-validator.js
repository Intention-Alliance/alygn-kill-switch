/**
 * Language Validation for Alygn Outreach
 * Detects and validates email content language before sending
 * 
 * Usage:
 *   import { detectLanguage, validateLanguage } from './language-validator.js';
 *   
 *   const detected = detectLanguage(emailContent);
 *   const isValid = validateLanguage(emailContent, 'es'); // expects Spanish
 */

/**
 * Simple heuristic language detection
 * Checks for common Spanish vs English keywords
 * 
 * @param {string} text - Text to analyze
 * @returns {string} 'es' for Spanish, 'en' for English
 */
export function detectLanguage(text) {
  if (!text || typeof text !== 'string') {
    return 'unknown';
  }

  // Spanish keywords (common function words)
  const spanishKeywords = [
    'el', 'la', 'los', 'las', 'es', 'son', 'para', 'por',
    'que', 'de', 'del', 'al', 'un', 'una', 'unos', 'unas',
    'se', 'le', 'les', 'lo', 'la', 'me', 'te', 'nos', 'os',
    'con', 'sin', 'sobre', 'entre', 'hasta', 'desde',
    'muy', 'más', 'menos', 'tan', 'tanto', 'cuando', 'donde',
    'qué', 'cómo', 'cuál', 'quién', 'por qué', 'porque'
  ];

  // English keywords (common function words)
  const englishKeywords = [
    'the', 'is', 'are', 'for', 'to', 'and', 'of',
    'that', 'this', 'with', 'as', 'be', 'at', 'by',
    'an', 'a', 'it', 'he', 'she', 'they', 'we', 'you',
    'from', 'on', 'in', 'into', 'through', 'during',
    'very', 'more', 'less', 'so', 'such', 'when', 'where',
    'what', 'how', 'which', 'who', 'why', 'because'
  ];

  const lowerText = text.toLowerCase();
  
  // Count matches
  let spanishScore = 0;
  let englishScore = 0;

  for (const word of spanishKeywords) {
    // Use word boundary check for better accuracy
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    const matches = lowerText.match(regex);
    if (matches) {
      spanishScore += matches.length;
    }
  }

  for (const word of englishKeywords) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    const matches = lowerText.match(regex);
    if (matches) {
      englishScore += matches.length;
    }
  }

  // Determine language
  if (spanishScore === 0 && englishScore === 0) {
    return 'unknown';
  }

  return spanishScore > englishScore ? 'es' : 'en';
}

/**
 * Validate email content matches expected language
 * 
 * @param {Object} emailContent - Email content object
 * @param {string} emailContent.subject - Email subject
 * @param {string} emailContent.body - Email body (HTML or text)
 * @param {string} [expectedLang='es'] - Expected language code
 * @returns {Object} { valid: boolean, detected: string, warning?: string }
 */
export function validateLanguage(emailContent, expectedLang = 'es') {
  if (!emailContent || typeof emailContent !== 'object') {
    return {
      valid: false,
      detected: 'unknown',
      warning: 'Invalid email content object'
    };
  }

  const { subject = '', body = '' } = emailContent;
  const combinedText = `${subject} ${body}`;
  
  const detected = detectLanguage(combinedText);
  
  if (detected === 'unknown') {
    return {
      valid: true, // Don't block if we can't detect
      detected: 'unknown',
      warning: 'Language detection inconclusive - proceeding with send'
    };
  }

  if (detected !== expectedLang) {
    return {
      valid: false,
      detected,
      warning: `Language mismatch: expected ${expectedLang}, detected ${detected}`
    };
  }

  return {
    valid: true,
    detected
  };
}

/**
 * Validate email with detailed reporting
 * 
 * @param {Object} emailContent - Email content object
 * @param {string} expectedLang - Expected language code
 * @returns {Object} Detailed validation result
 */
export function validateLanguageDetailed(emailContent, expectedLang = 'es') {
  const { subject = '', body = '' } = emailContent;
  
  // Check subject and body separately
  const subjectLang = detectLanguage(subject);
  const bodyLang = detectLanguage(body);
  const combinedLang = detectLanguage(`${subject} ${body}`);
  
  const result = validateLanguage(emailContent, expectedLang);
  
  return {
    ...result,
    details: {
      subjectLanguage: subjectLang,
      bodyLanguage: bodyLang,
      combinedLanguage: combinedLang,
      expectedLanguage: expectedLang,
      subjectLength: subject.length,
      bodyLength: body.length
    }
  };
}

export default {
  detectLanguage,
  validateLanguage,
  validateLanguageDetailed
};
