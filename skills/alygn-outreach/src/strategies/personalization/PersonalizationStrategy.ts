/**
 * PersonalizationStrategy - Base interface for personalization strategies
 */
import type { OutreachEntity } from '../entities/OutreachEntity.js';

interface PersonalizationResult {
  success: boolean;
  email?: {
    subject: string;
    html: string;
    text?: string;
  };
  subject?: string;
  draftId?: string;
  draftStatus?: string;
  entity?: OutreachEntity;
  error?: string;
}

export class PersonalizationStrategy {
  protected config: Record<string, unknown>;
  protected name: string;

  constructor(config: Record<string, unknown> = {}) {
    this.config = config;
    this.name = 'base-personalization';
  }
  
  /**
   * Personalize entity
   * @param entity - Entity to personalize
   * @returns Promise<Object> Personalization result with email content
   */
  async personalize(entity: OutreachEntity): Promise<PersonalizationResult> {
    throw new Error('Not implemented');
  }
  
  /**
   * Get strategy name
   */
  getName(): string {
    return this.name;
  }
}

export default PersonalizationStrategy;
