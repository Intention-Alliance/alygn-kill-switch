/**
 * Event Projections Engine
 * 
 * CQRS read-model building from event streams.
 * Projections are async handlers that consume events to build
 * optimized read views.
 * 
 * Usage:
 *   const { Projection, ProjectionEngine } = require('./core/event-projections');
 *   
 *   class UserProjection extends Projection {
 *     async apply(event) { /* build read model *}
 *   }
 *   
 *   const engine = new ProjectionEngine(store);
 *   engine.register(new UserProjection());
 *   await engine.rebuild();
 */

import { EventEmitter } from 'events';

/**
 * Base projection class
 * 
 * Extend to create specific read models
 */
class Projection {
  constructor(name) {
    if (new.target === Projection) {
      throw new Error('Projection is abstract and cannot be instantiated directly');
    }
    
    this.name = name;
    this.state = {};
    this.lastProcessedPosition = 0;
    this.isRebuilding = false;
    this.eventHandlers = {};
    
    console.log(`[Projection] Initialized: ${name}`);
  }

  /**
   * Apply event to projection state - MUST be overridden
   * @param {Event} event 
   */
  async apply(event) {
    throw new Error('Subclasses must implement apply() method');
  }

  /**
   * Handle specific event type
   * @param {string} eventType 
   * @param {Function} handler 
   */
  on(eventType, handler) {
    this.eventHandlers[eventType] = handler;
  }

  /**
   * Process a single event
   * @param {Event} event 
   */
  async handle(event) {
    const handler = this.eventHandlers[event.type];
    if (handler) {
      await handler.call(this, event);
      this.lastProcessedPosition = Math.max(
        this.lastProcessedPosition,
        event.timestamp
      );
    }
  }

  /**
   * Get current projection state
   * @returns {Object}
   */
  getState() {
    return { ...this.state };
  }

  /**
   * Reset projection state
   */
  reset() {
    this.state = {};
    this.lastProcessedPosition = 0;
    console.log(`[Projection] ${this.name} reset`);
  }

  /**
   * Get projection metadata
   * @returns {Object}
   */
  getMetadata() {
    return {
      name: this.name,
      lastProcessedPosition: this.lastProcessedPosition,
      isRebuilding: this.isRebuilding,
      stateSize: JSON.stringify(this.state).length
    };
  }
}

/**
 * Projection engine for managing and rebuilding projections
 */
class ProjectionEngine extends EventEmitter {
  constructor(eventStore) {
    super();
    this.eventStore = eventStore;
    this.projections = new Map();
    this.isRebuilding = false;
    this.rebuildProgress = {
      total: 0,
      processed: 0,
      currentProjection: null
    };
    
    console.log('[ProjectionEngine] Initialized');
  }

  /**
   * Register a projection
   * @param {Projection} projection 
   */
  register(projection) {
    this.projections.set(projection.name, projection);
    console.log(`[ProjectionEngine] Registered projection: ${projection.name}`);
  }

  /**
   * Get a projection by name
   * @param {string} name 
   * @returns {Projection|null}
   */
  get(name) {
    return this.projections.get(name) || null;
  }

  /**
   * Subscribe projection to event bus
   * @param {Projection} projection 
   * @param {EventBus} eventBus 
   */
  subscribeToBus(projection, eventBus) {
    eventBus.subscribeAll(async (event) => {
      await projection.handle(event);
    });
    console.log(`[ProjectionEngine] Subscribed ${projection.name} to event bus`);
  }

  /**
   * Rebuild a single projection from event stream
   * @param {string} projectionName 
   * @param {Object} options 
   */
  async rebuildProjection(projectionName, options = {}) {
    const projection = this.projections.get(projectionName);
    if (!projection) {
      throw new Error(`Projection not found: ${projectionName}`);
    }

    console.log(`[ProjectionEngine] Rebuilding projection: ${projectionName}`);
    projection.isRebuilding = true;
    projection.reset();
    
    const events = this.eventStore.getAllEvents(options.afterTimestamp || 0);
    this.rebuildProgress = {
      total: events.length,
      processed: 0,
      currentProjection: projectionName
    };
    
    for (const event of events) {
      await projection.handle(event);
      this.rebuildProgress.processed++;
      
      // Emit progress for monitoring
      if (this.rebuildProgress.processed % 100 === 0) {
        this.emit('progress', { ...this.rebuildProgress });
      }
    }
    
    projection.isRebuilding = false;
    console.log(`[ProjectionEngine] Rebuilt ${projectionName}: ${events.length} events processed`);
    
    return {
      projection: projectionName,
      eventsProcessed: events.length,
      state: projection.getState()
    };
  }

  /**
   * Rebuild all projections
   * @param {Object} options 
   */
  async rebuildAll(options = {}) {
    console.log('[ProjectionEngine] Rebuilding all projections');
    this.isRebuilding = true;
    
    const results = [];
    for (const [name, projection] of this.projections) {
      const result = await this.rebuildProjection(name, options);
      results.push(result);
    }
    
    this.isRebuilding = false;
    console.log('[ProjectionEngine] All projections rebuilt');
    
    return results;
  }

  /**
   * Get status of all projections
   * @returns {Object[]}
   */
  getStatus() {
    const status = [];
    for (const [name, projection] of this.projections) {
      status.push({
        name,
        ...projection.getMetadata()
      });
    }
    return status;
  }

  /**
   * Clear all projections
   */
  clear() {
    for (const projection of this.projections.values()) {
      projection.reset();
    }
    console.log('[ProjectionEngine] All projections cleared');
  }
}

/**
 * Materialized view helper for common patterns
 */
class MaterializedView {
  constructor(name) {
    this.name = name;
    this.data = new Map();
    this.indices = new Map();
  }

  /**
   * Set item in view
   * @param {string} key 
   * @param {Object} value 
   */
  set(key, value) {
    this.data.set(key, value);
  }

  /**
   * Get item from view
   * @param {string} key 
   * @returns {Object|undefined}
   */
  get(key) {
    return this.data.get(key);
  }

  /**
   * Delete item from view
   * @param {string} key 
   */
  delete(key) {
    this.data.delete(key);
  }

  /**
   * Create index on field
   * @param {string} fieldName 
   */
  createIndex(fieldName) {
    const index = new Map();
    for (const [key, value] of this.data.entries()) {
      const indexValue = value[fieldName];
      if (!index.has(indexValue)) {
        index.set(indexValue, []);
      }
      index.get(indexValue).push(key);
    }
    this.indices.set(fieldName, index);
    console.log(`[MaterializedView] Created index on ${fieldName} for ${this.name}`);
  }

  /**
   * Query by indexed field
   * @param {string} fieldName 
   * @param {any} value 
   * @returns {Object[]}
   */
  queryByIndex(fieldName, value) {
    const index = this.indices.get(fieldName);
    if (!index) {
      throw new Error(`No index found for field: ${fieldName}`);
    }
    
    const keys = index.get(value) || [];
    return keys.map(key => this.data.get(key));
  }

  /**
   * Get all items
   * @returns {Object[]}
   */
  getAll() {
    return Array.from(this.data.values());
  }

  /**
   * Get count
   * @returns {number}
   */
  count() {
    return this.data.size;
  }

  /**
   * Clear view
   */
  clear() {
    this.data.clear();
    this.indices.clear();
  }
}

export { Projection, ProjectionEngine, MaterializedView };
