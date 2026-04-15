/**
 * TemplatePartial — F-077
 * Reusable template partials/components for email templates.
 *
 * Features:
 *   Register, get, and list named partials
 *   Built-in partials: header, footer, cta-button, unsubscribe, signature
 *   Circular dependency detection when rendering partials
 *   Integrates with TemplateEngine via {{> partialName}} syntax
 *
 * TypeScript strict mode.
 */

import { TemplateEngine } from './TemplateEngine';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PartialDefinition {
  /** Unique name for the partial (e.g. "header", "cta-button"). */
  name: string;
  /** Template string that may contain {{var}} and {{> otherPartial}} syntax. */
  template: string;
  /** Optional description of what this partial renders. */
  description?: string;
  /** Default data to merge when rendering this partial. */
  defaults?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Built-in partials
// ---------------------------------------------------------------------------

const BUILT_IN_PARTIALS: PartialDefinition[] = [
  {
    name: 'header',
    description: 'Email header with logo and brand name',
    template: `<div class="header">
  <div class="header-brand">
    <h2 class="brand-name">{{brandName|ALYGN}}</h2>
    {{#if logoUrl}}<img src="{{logoUrl|r}}" alt="{{brandName|ALYGN}}" style="width: 64px; height: 64px; border-radius: 4px; display: block;">{{/if}}
  </div>
</div>`,
    defaults: {
      brandName: 'ALYGN',
      logoUrl: '',
    },
  },
  {
    name: 'footer',
    description: 'Email footer with social links and copyright',
    template: `<div class="footer">
  <p style="margin: 0 0 12px 0;">
    {{brandName|ALYGN}} - {{tagline|Independent AI Governance Institution}} | {{organization|Institutional Permanence}}<br>
    {{location|Texas, EE.UU.}} | {{year}} © All rights reserved.
  </p>
  {{#if socialLinks}}
  <p style="margin: 0; font-size: 14px;">
    {{#each socialLinks}}<a href="{{url|r}}" style="display: inline-block; margin: 0 8px;">{{label|r}}</a>{{#if @last}}{{else}} | {{/if}}{{/each}}
  </p>
  {{/if}}
</div>`,
    defaults: {
      brandName: 'ALYGN',
      tagline: 'Independent AI Governance Institution',
      organization: 'Institutional Permanence',
      location: 'Texas, EE.UU.',
      year: new Date().getFullYear().toString(),
    },
  },
  {
    name: 'cta-button',
    description: 'Call-to-action button with customizable text and URL',
    template: `<a href="{{url|r}}" class="cta-button" style="display: inline-block; background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: #ffffff !important; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 500; margin: 24px 0;">{{text|Learn more}}</a>`,
    defaults: {
      url: '#',
      text: 'Learn more',
    },
  },
  {
    name: 'unsubscribe',
    description: 'Unsubscribe link with preference center URL',
    template: `<div class="unsubscribe" style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e5e7eb; text-align: center; font-size: 12px; color: #9ca3af;">
  <p style="margin: 0;">You received this email because you expressed interest in AI governance.</p>
  <p style="margin: 8px 0 0 0;">
    {{#if preferenceUrl}}<a href="{{preferenceUrl|r}}" style="color: #6b7280; text-decoration: underline;">Update preferences</a> · {{/if}}<a href="{{unsubscribeUrl|r}}" style="color: #6b7280; text-decoration: underline;">Unsubscribe</a>
  </p>
</div>`,
    defaults: {
      preferenceUrl: '',
      unsubscribeUrl: '#',
    },
  },
  {
    name: 'signature',
    description: 'Email signature with name, title, and optional contact info',
    template: `<div class="signature" style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
  <p style="margin: 0; font-weight: 500; color: #1f2937;">{{name|r}}</p>
  {{#if title}}<p style="margin: 2px 0 0 0; font-size: 14px; color: #6b7280;">{{title|r}}</p>{{/if}}
  {{#if organization}}<p style="margin: 2px 0 0 0; font-size: 14px; color: #6b7280;">{{organization|r}}</p>{{/if}}
  {{#if email}}<p style="margin: 2px 0 0 0; font-size: 14px;"><a href="mailto:{{email|r}}" style="color: #6b7280;">{{email|r}}</a></p>{{/if}}
</div>`,
    defaults: {
      name: '',
      title: '',
      organization: '',
      email: '',
    },
  },
];

// ---------------------------------------------------------------------------
// TemplatePartial class
// ---------------------------------------------------------------------------

export class TemplatePartial {
  private partials: Map<string, PartialDefinition> = new Map();

  constructor() {
    // Register built-in partials
    for (const partial of BUILT_IN_PARTIALS) {
      this.partials.set(partial.name, { ...partial });
    }
  }

  /**
   * Register a new partial or overwrite an existing one.
   * Returns true if a partial was overwritten, false if newly registered.
   */
  register(definition: PartialDefinition): boolean {
    const existed = this.partials.has(definition.name);
    this.partials.set(definition.name, { ...definition });
    return existed;
  }

  /**
   * Get a partial definition by name.
   * Returns undefined if not found.
   */
  get(name: string): PartialDefinition | undefined {
    return this.partials.get(name);
  }

  /**
   * Get the template string for a partial.
   * Returns undefined if the partial doesn't exist.
   */
  getTemplate(name: string): string | undefined {
    return this.partials.get(name)?.template;
  }

  /**
   * List all registered partial names.
   */
  list(): string[] {
    return Array.from(this.partials.keys());
  }

  /**
   * List all partial definitions.
   */
  listAll(): PartialDefinition[] {
    return Array.from(this.partials.values());
  }

  /**
   * Check if a partial exists.
   */
  has(name: string): boolean {
    return this.partials.has(name);
  }

  /**
   * Remove a partial by name.
   * Returns true if the partial was found and removed, false otherwise.
   * Built-in partials can be removed (they're not protected).
   */
  remove(name: string): boolean {
    return this.partials.delete(name);
  }

  /**
   * Resolve a partial's template by rendering it with merged data.
   * Detects circular dependencies by tracking the resolution chain.
   * Enforces max partial nesting depth.
   *
   * @param name - Partial name to resolve
   * @param data - Data to merge with partial defaults
   * @param chain - Resolution chain for circular dependency detection (internal)
   * @returns Rendered template string with all tokens resolved
   * @throws Error if partial not found, circular dependency detected, or max depth exceeded
   */
  resolve(name: string, data: Record<string, unknown> = {}, chain: string[] = []): string {
    const partial = this.partials.get(name);
    if (!partial) {
      throw new Error(`TemplatePartial: partial "${name}" not found`);
    }

    // Circular dependency detection
    if (chain.includes(name)) {
      const cycle = [...chain, name].join(' → ');
      throw new Error(`TemplatePartial: circular dependency detected: ${cycle}`);
    }

    // Max depth check
    const MAX_PARTIAL_DEPTH = 10;
    if (chain.length >= MAX_PARTIAL_DEPTH) {
      throw new Error(`TemplatePartial: max partial depth (${MAX_PARTIAL_DEPTH}) exceeded at "${name}". Chain: ${chain.join(' → ')}`);
    }

    // Merge defaults with provided data (provided data takes precedence)
    const mergedData: Record<string, unknown> = {
      ...(partial.defaults ?? {}),
      ...data,
    };

    // Render the template using TemplateEngine
    const engine = new TemplateEngine(this);
    return engine.render(partial.template, mergedData, [...chain, name]);
  }

  /**
   * Get the defaults for a partial.
   * Returns empty object if partial doesn't exist.
   */
  getDefaults(name: string): Record<string, unknown> {
    return this.partials.get(name)?.defaults ?? {};
  }
}

// Singleton for convenience
export const templatePartial = new TemplatePartial();

export default TemplatePartial;