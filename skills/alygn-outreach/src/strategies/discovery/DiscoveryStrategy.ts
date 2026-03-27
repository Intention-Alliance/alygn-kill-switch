/**
 * DiscoveryStrategy - Base interface for discovery strategies
 */
import type { OutreachEntity } from '../entities/OutreachEntity.js';

export class DiscoveryStrategy {
  protected config: Record<string, unknown>;
  protected name: string;

  constructor(config: Record<string, unknown> = {}) {
    this.config = config;
    this.name = 'base-discovery';
  }
  
  /**
   * Discover entities
   * @param query - Search query
   * @param options - Discovery options
   * @returns Promise<OutreachEntity[]> Array of discovered entities
   */
  async discover(query: string, options: Record<string, unknown> = {}): Promise<OutreachEntity[]> {
    throw new Error('Not implemented');
  }
  
  /**
   * Get strategy name
   */
  getName(): string {
    return this.name;
  }
}

export default DiscoveryStrategy;
