/**
 * StrategyRegistry - Factory pattern for managing type-specific strategies
 */
export class StrategyRegistry {
  private strategies: Map<string, Map<string, unknown>>;

  constructor() {
    this.strategies = new Map();
  }
  
  /**
   * Register a strategy for a type and action
   * @param type - Entity type ('vc' | 'municipal')
   * @param action - Action name ('discover' | 'validate' | 'research' | 'personalize' | 'send')
   * @param strategy - Strategy instance
   */
  register(type: string, action: string, strategy: unknown): void {
    if (!this.strategies.has(type)) {
      this.strategies.set(type, new Map());
    }
    this.strategies.get(type)!.set(action, strategy);
  }
  
  /**
   * Register a default strategy
   * @param action - Action name
   * @param strategy - Strategy instance
   */
  registerDefault(action: string, strategy: unknown): void {
    this.register('default', action, strategy);
  }
  
  /**
   * Get strategy for type and action
   * Falls back to default (type = 'default') if type-specific not found
   * @param type - Entity type
   * @param action - Action name
   * @returns Strategy instance or null
   */
  get(type: string, action: string): unknown | null {
    // Try type-specific first
    if (this.strategies.has(type)) {
      const typeStrategies = this.strategies.get(type)!;
      if (typeStrategies.has(action)) {
        return typeStrategies.get(action)!;
      }
    }
    
    // Fall back to default
    return this.getDefault(action);
  }
  
  /**
   * Get default strategy for action
   * @param action - Action name
   * @returns Strategy instance or null
   */
  getDefault(action: string): unknown | null {
    if (this.strategies.has('default')) {
      const defaultStrategies = this.strategies.get('default')!;
      if (defaultStrategies.has(action)) {
        return defaultStrategies.get(action)!;
      }
    }
    return null;
  }
  
  /**
   * Check if strategy exists
   * @param type - Entity type
   * @param action - Action name
   * @returns boolean
   */
  has(type: string, action: string): boolean {
    return this.get(type, action) !== null;
  }
  
  /**
   * Get all registered types
   * @returns string[]
   */
  getTypes(): string[] {
    return Array.from(this.strategies.keys()).filter((t: string) => t !== 'default');
  }
  
  /**
   * Get all actions for a type
   * @param type - Entity type
   * @returns string[]
   */
  getActions(type: string): string[] {
    if (this.strategies.has(type)) {
      return Array.from(this.strategies.get(type)!.keys());
    }
    return [];
  }
}

export default StrategyRegistry;
