/**
 * PersonalizationStrategy - Abstract base class for personalization strategies
 */
import type { OutreachEntity } from '../../entities/OutreachEntity';

export interface IPersonalizationResult {
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

export abstract class PersonalizationStrategy {
  protected config: Record<string, unknown>;
  protected name: string;

  constructor(config: Record<string, unknown> = {}) {
    this.config = config;
    this.name = 'base-personalization';
  }

  /**
   * Personalize entity
   */
  abstract personalize(entity: OutreachEntity): Promise<IPersonalizationResult>;

  /**
   * Get strategy name
   */
  getName(): string {
    return this.name;
  }
}

export default PersonalizationStrategy;
