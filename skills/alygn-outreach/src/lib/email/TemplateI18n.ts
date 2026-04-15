/**
 * TemplateI18n — F-079
 * Internationalization for email templates.
 *
 * Features:
 *   Register translations per locale (key → string with {param} placeholders)
 *   t(key, locale, params) — translate with fallback chain
 *   Built-in en/es email phrases for outreach
 *   Integrates with TemplateEngine via {{t key}}, {{locale}}, {{formatNumber}}, {{formatDate}}
 *
 * TypeScript strict mode. No external dependencies.
 */

import { Locale } from './Locale';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Translation value: string with optional {param} placeholders. */
export type TranslationValue = string;

/** Translation map: key → translated string. */
export type TranslationMap = Record<string, TranslationValue>;

/** Params for interpolation in translated strings. */
export type TranslateParams = Record<string, string | number>;

// ---------------------------------------------------------------------------
// Built-in translations (en/es)
// ---------------------------------------------------------------------------

const BUILT_IN_EN: TranslationMap = {
  // Greetings
  'email.greeting': 'Hello {name},',
  'email.greeting.formal': 'Dear {name},',
  'email.greeting.informal': 'Hi {name}',

  // Closings
  'email.closing': 'Best regards,',
  'email.closing.warm': 'Warm regards,',
  'email.closing.formal': 'Sincerely,',

  // Common phrases
  'email.subject.followUp': 'Following up on our conversation',
  'email.subject.introduction': 'Introduction — {organization}',
  'email.subject.partnership': 'Partnership opportunity — {organization}',
  'email.subject.aiGovernance': 'AI Governance — {topic}',
  'email.body.intro': 'I hope this message finds you well.',
  'email.body.interested': 'I would love to schedule a brief call to discuss how we can collaborate on {topic}.',
  'email.body.learnMore': 'I would be happy to provide more details about our work in {area}',
  'email.body.nextStep': 'Would you be available for a brief call this week?',
  'email.body.thankYou': 'Thank you for your time and consideration.',

  // Unsubscribe
  'email.unsubscribe': 'Unsubscribe',
  'email.unsubscribe.reason': 'You received this email because you expressed interest in AI governance.',
  'email.preferences': 'Update preferences',

  // CTA
  'email.cta.learnMore': 'Learn more',
  'email.cta.scheduleCall': 'Schedule a call',
  'email.cta.reply': 'Reply to this email',

  // Footer
  'email.footer.rights': 'All rights reserved.',
  'email.footer.sentBy': 'Sent by {organization}',

  // Locale
  'locale.name': 'English',
};

const BUILT_IN_ES: TranslationMap = {
  // Greetings
  'email.greeting': 'Hola {name},',
  'email.greeting.formal': 'Estimado/a {name},',
  'email.greeting.informal': 'Hola {name},',

  // Closings
  'email.closing': 'Saludos cordiales,',
  'email.closing.warm': 'Un cordial saludo,',
  'email.closing.formal': 'Atentamente,',

  // Common phrases
  'email.subject.followUp': 'Seguimiento de nuestra conversación',
  'email.subject.introduction': 'Presentación — {organization}',
  'email.subject.partnership': 'Oportunidad de colaboración — {organization}',
  'email.subject.aiGovernance': 'Gobernanza de IA — {topic}',
  'email.body.intro': 'Espero que este mensaje le encuentre bien.',
  'email.body.interested': 'Me encantaría programar una breve llamada para discutir cómo podemos colaborar en {topic}.',
  'email.body.learnMore': 'Estaré encantado de proporcionar más detalles sobre nuestro trabajo en {area}',
  'email.body.nextStep': '¿Estaría disponible para una breve llamada esta semana?',
  'email.body.thankYou': 'Gracias por su tiempo y consideración.',

  // Unsubscribe
  'email.unsubscribe': 'Cancelar suscripción',
  'email.unsubscribe.reason': 'Recibió este correo porque expresó interés en la gobernanza de IA.',
  'email.preferences': 'Actualizar preferencias',

  // CTA
  'email.cta.learnMore': 'Más información',
  'email.cta.scheduleCall': 'Programar una llamada',
  'email.cta.reply': 'Responder a este correo',

  // Footer
  'email.footer.rights': 'Todos los derechos reservados.',
  'email.footer.sentBy': 'Enviado por {organization}',

  // Locale
  'locale.name': 'Español',
};

// ---------------------------------------------------------------------------
// TemplateI18n class
// ---------------------------------------------------------------------------

export class TemplateI18n {
  /** Translations per locale code. */
  private translations: Map<string, TranslationMap> = new Map();

  /** Default locale for rendering. */
  private defaultLocale: Locale;

  constructor(defaultLocaleCode: string = 'en', defaultFallback?: string) {
    this.defaultLocale = new Locale({
      code: defaultLocaleCode,
      fallback: defaultFallback ?? 'en',
    });

    // Register built-in translations
    this.register('en', BUILT_IN_EN);
    this.register('es', BUILT_IN_ES);
  }

  /**
   * Register translations for a locale.
   * Merges with existing translations for that locale (new keys overwrite).
   */
  register(localeCode: string, translations: TranslationMap): void {
    const existing = this.translations.get(localeCode) ?? {};
    this.translations.set(localeCode, { ...existing, ...translations });
  }

  /**
   * Translate a key with locale fallback chain.
   *
   * Lookup order: locale → locale language → fallback → fallback language → key itself
   *
   * @param key - Translation key (e.g. "email.greeting")
   * @param locale - Locale code or Locale instance
   * @param params - Parameters for {param} interpolation
   * @returns Translated and interpolated string
   */
  t(key: string, locale?: string | Locale, params?: TranslateParams): string {
    const loc = typeof locale === 'string'
      ? Locale.fromCode(locale, this.defaultLocale.fallback)
      : (locale ?? this.defaultLocale);

    // Build lookup chain from Locale
    const chain = loc.chain;

    // Try each locale in the chain
    for (const code of chain) {
      const map = this.translations.get(code);
      if (map && key in map) {
        return this.interpolate(map[key], params);
      }
    }

    // Key not found — return visible [missing: key] marker
    console.warn(`TemplateI18n: missing translation key "${key}" for locale chain [${chain.join(', ')}]`);
    return `[missing: ${key}]`;
  }

  /**
   * Check if a translation key exists for a given locale.
   */
  has(key: string, localeCode: string): boolean {
    const loc = Locale.fromCode(localeCode, this.defaultLocale.fallback);
    for (const code of loc.chain) {
      const map = this.translations.get(code);
      if (map && key in map) return true;
    }
    return false;
  }

  /**
   * List all registered locale codes.
   */
  listLocales(): string[] {
    return Array.from(this.translations.keys());
  }

  /**
   * Get all translations for a specific locale code.
   */
  getTranslations(localeCode: string): TranslationMap {
    return this.translations.get(localeCode) ?? {};
  }

  /**
   * Get the default Locale instance.
   */
  getDefaultLocale(): Locale {
    return this.defaultLocale;
  }

  /**
   * Set the default locale.
   */
  setDefaultLocale(code: string, fallback?: string): void {
    this.defaultLocale = new Locale({ code, fallback: fallback ?? 'en' });
  }

  /**
   * Interpolate {param} placeholders in a translation string.
   * Uses single braces to avoid conflict with TemplateEngine's {{}} syntax.
   */
  private interpolate(template: string, params?: TranslateParams): string {
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (match, key: string) => {
      if (key in params) return String(params[key]);
      return match;
    });
  }
}

export default TemplateI18n;