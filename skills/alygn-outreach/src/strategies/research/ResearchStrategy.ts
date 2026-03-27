/**
 * ResearchStrategy - Abstract base class for research strategies
 */
import type { OutreachEntity } from '../../entities/OutreachEntity';

export interface IResearchResult {
  success: boolean;
  research: Record<string, unknown>;
  entity: OutreachEntity;
  error?: string;
}

export abstract class ResearchStrategy {
  protected config: Record<string, unknown>;
  protected name: string;

  constructor(config: Record<string, unknown> = {}) {
    this.config = config;
    this.name = 'base-research';
  }

  /**
   * Research entity
   */
  abstract research(entity: OutreachEntity): Promise<IResearchResult>;

  /**
   * Get strategy name
   */
  getName(): string {
    return this.name;
  }
}

export default ResearchStrategy;
