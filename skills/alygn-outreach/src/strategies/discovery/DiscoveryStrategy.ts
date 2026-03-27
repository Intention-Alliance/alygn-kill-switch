/**
 * DiscoveryStrategy - Abstract base class for discovery strategies
 */
import type { OutreachEntity } from '../../entities/OutreachEntity';

export interface IDiscoveryOptions {
  limit?: number;
  dryRun?: boolean;
  region?: string;
  [key: string]: unknown;
}

export abstract class DiscoveryStrategy {
  protected config: Record<string, unknown>;
  protected name: string;

  constructor(config: Record<string, unknown> = {}) {
    this.config = config;
    this.name = 'base-discovery';
  }

  /**
   * Discover entities
   */
  abstract discover(query: string, options?: IDiscoveryOptions): Promise<OutreachEntity[]>;

  /**
   * Get strategy name
   */
  getName(): string {
    return this.name;
  }
}

export default DiscoveryStrategy;
