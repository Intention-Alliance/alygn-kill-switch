/**
 * ResearchStrategy - Base interface for research strategies
 */
import type { OutreachEntity } from '../entities/OutreachEntity.js';

export class ResearchStrategy {
  protected config: Record<string, unknown>;
  protected name: string;

  constructor(config: Record<string, unknown> = {}) {
    this.config = config;
    this.name = 'base-research';
  }
  
  /**
   * Research entity
   * @param entity - Entity to research
   * @returns Promise<Object> Research result with notes and context
   */
  async research(entity: OutreachEntity): Promise<{ success: boolean; research?: Record<string, unknown>; entity?: OutreachEntity; error?: string }> {
    throw new Error('Not implemented');
  }
  
  /**
   * Get strategy name
   */
  getName(): string {
    return this.name;
  }
}

export default ResearchStrategy;
