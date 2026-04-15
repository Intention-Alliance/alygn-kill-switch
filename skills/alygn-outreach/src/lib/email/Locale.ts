/**
 * Locale — F-079
 * Locale-aware number and date formatting.
 *
 * Features:
 *   Locale code with fallback chain (e.g. "es-CR" → "es" → "en")
 *   formatNumber(value, options?) — Intl.NumberFormat wrapper
 *   formatDate(value, options?) — Intl.DateTimeFormat wrapper
 *   No external dependencies — uses built-in Intl APIs
 *
 * TypeScript strict mode.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LocaleOptions {
  /** Primary locale code (e.g. "es", "en", "es-CR"). */
  code: string;
  /** Fallback locale when primary doesn't have a translation. Defaults to "en". */
  fallback?: string;
}

export interface NumberFormatOptions extends Intl.NumberFormatOptions {
  /** Override locale for this specific call. */
  locale?: string;
}

export interface DateFormatOptions extends Intl.DateTimeFormatOptions {
  /** Override locale for this specific call. */
  locale?: string;
}

// ---------------------------------------------------------------------------
// Locale class
// ---------------------------------------------------------------------------

export class Locale {
  /** Primary locale code (e.g. "es", "en", "es-CR"). */
  readonly code: string;

  /** Fallback locale code. Defaults to "en". */
  readonly fallback: string;

  constructor(options: LocaleOptions) {
    this.fallback = options.fallback ?? 'en';
    this.code = options.code || this.fallback;
  }

  /**
   * Get the locale chain for translation lookup.
   * e.g. "es-CR" → ["es-CR", "es", "en"]
   *      "es"    → ["es", "en"]
   *      "en"    → ["en"]
   */
  get chain(): string[] {
    const chain: string[] = [this.code];

    // If code has a region (e.g. "es-CR"), add the language-only version
    if (this.code.includes('-')) {
      const languageOnly = this.code.split('-')[0];
      if (languageOnly !== this.code) {
        chain.push(languageOnly);
      }
    }

    // Add fallback if not already in chain
    if (this.fallback && !chain.includes(this.fallback)) {
      chain.push(this.fallback);
    }

    return chain;
  }

  /**
   * Format a number using Intl.NumberFormat.
   *
   * @param value - Number or numeric string to format
   * @param options - Intl.NumberFormatOptions + optional locale override
   * @returns Formatted number string
   */
  formatNumber(value: number | string, options?: NumberFormatOptions): string {
    const num = typeof value === 'string' ? Number(value) : value;
    if (Number.isNaN(num)) return String(value);

    const locale = options?.locale || this.code || this.fallback;
    // Destructure to separate our custom `locale` from Intl options
    const { locale: _locale, ...intlOptions } = options ?? {};
    return new Intl.NumberFormat(locale, intlOptions).format(num);
  }

  /**
   * Format a date using Intl.DateTimeFormat.
   *
   * @param value - Date, timestamp number, or ISO date string
   * @param options - Intl.DateTimeFormatOptions + optional locale override
   * @returns Formatted date string
   */
  formatDate(value: Date | number | string, options?: DateFormatOptions): string {
    let date: Date;
    if (value instanceof Date) {
      date = value;
    } else if (typeof value === 'number') {
      date = new Date(value);
    } else {
      date = new Date(value);
    }

    if (Number.isNaN(date.getTime())) return String(value);

    const locale = options?.locale || this.code || this.fallback;
    const { locale: _locale, ...intlOptions } = options ?? {};
    return new Intl.DateTimeFormat(locale, intlOptions).format(date);
  }

  /**
   * Check if this locale is the same language as another code.
   * "es-CR" and "es" share the same language.
   */
  sameLanguage(other: string): boolean {
    return this.code.split('-')[0] === other.split('-')[0];
  }

  /**
   * Get just the language part (e.g. "es-CR" → "es").
   */
  get language(): string {
    return this.code.split('-')[0];
  }

  /**
   * Create a Locale from a simple string code.
   */
  static fromCode(code: string, fallback?: string): Locale {
    return new Locale({ code, fallback });
  }
}

export default Locale;