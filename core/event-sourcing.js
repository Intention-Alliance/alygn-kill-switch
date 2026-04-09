/**
 * Event Sourcing Framework
 * 
 * Core patterns:
 * - Event Store: Append-only log for all state changes
 * - Aggregate Root: Reconstructs state from event stream
 * - Event Bus: Publish/subscribe for event propagation
 * - Snapshots: Periodic state saves for performance
 * 
 * Usage:
 *   const { EventStore, AggregateRoot, EventBus } = require('./core/event-sourcing');
 *   
 *   const store = new EventStore();
 *   const bus = new EventBus();
 *   
 *   class UserAggregate extends AggregateRoot {
 *     apply(event) { /* handle event *}
 *   }
 */

import { EventEmitter } from 'events';

/**
 * Immutable event structure
 * @typedef {Object} Event
 * @property {string} type - Event type name
 * @property {Object} payload - Event data
 * @property {number} timestamp - Unix timestamp
 * @property {string} aggregateId - Associated aggregate ID
 * @property {number} version - Event version in stream
 */

/**
 * Snapshot structure for performance optimization
 * @typedef {Object} Snapshot
 * @property {string} aggregateId - Aggregate ID
 * @property {number} version - Event version at snapshot
 * @property {Object} state - Serialized state
 */

/**
 * Append-only event store
 * 
 * In-memory implementation with interface for Redis/Kafka persistence
 */
class EventStore {
  constructor(options = {}) {
    this.events = [];
    this.snapshots = new Map();
    this.aggregateStreams = new Map(); // aggregateId -> [eventIndices]
    this.options = {
      maxEventsInMemory: options.maxEventsInMemory || 100000,
      snapshotInterval: options.snapshotInterval || 100
    };
    
    console.log('[EventStore] Initialized', { 
      maxEventsInMemory: this.options.maxEventsInMemory,
      snapshotInterval: this.options.snapshotInterval 
    });
  }

  /**
   * Append event to store
   * @param {string} aggregateId 
   * @param {string} type 
   * @param {Object} payload 
   * @returns {Event}
   */
  append(aggregateId, type, payload) {
    const aggregateStream = this.aggregateStreams.get(aggregateId) || [];
    const version = aggregateStream.length + 1;
    
    const event = {
      id: `${aggregateId}-${version}`,
      type,
      payload,
      timestamp: Date.now(),
      aggregateId,
      version
    };
    
    this.events.push(event);
    aggregateStream.push(this.events.length - 1);
    this.aggregateStreams.set(aggregateId, aggregateStream);
    
    console.log(`[EventStore] Appended event: ${type} v${version} for ${aggregateId}`);
    return event;
  }

  /**
   * Get all events for an aggregate
   * @param {string} aggregateId 
   * @param {number} fromVersion - Optional: start from this version
   * @returns {Event[]}
   */
  getEvents(aggregateId, fromVersion = 1) {
    const indices = this.aggregateStreams.get(aggregateId) || [];
    return indices
      .map(idx => this.events[idx])
      .filter(event => event.version >= fromVersion);
  }

  /**
   * Get event stream for multiple aggregates (for projections)
   * @param {string[]} aggregateIds 
   * @returns {Event[]}
   */
  getEventsForAggregates(aggregateIds) {
    const events = [];
    for (const aggregateId of aggregateIds) {
      const indices = this.aggregateStreams.get(aggregateId) || [];
      for (const idx of indices) {
        events.push(this.events[idx]);
      }
    }
    return events.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Get all events (for global projections)
   * @param {number} afterTimestamp - Optional: filter by timestamp
   * @returns {Event[]}
   */
  getAllEvents(afterTimestamp = 0) {
    return this.events.filter(e => e.timestamp > afterTimestamp);
  }

  /**
   * Save snapshot for aggregate
   * @param {string} aggregateId 
   * @param {number} version 
   * @param {Object} state 
   */
  saveSnapshot(aggregateId, version, state) {
    this.snapshots.set(aggregateId, {
      aggregateId,
      version,
      state,
      timestamp: Date.now()
    });
    console.log(`[EventStore] Saved snapshot for ${aggregateId} at v${version}`);
  }

  /**
   * Get latest snapshot for aggregate
   * @param {string} aggregateId 
   * @returns {Snapshot|null}
   */
  getSnapshot(aggregateId) {
    return this.snapshots.get(aggregateId) || null;
  }

  /**
   * Get current version for aggregate
   * @param {string} aggregateId 
   * @returns {number}
   */
  getCurrentVersion(aggregateId) {
    const indices = this.aggregateStreams.get(aggregateId) || [];
    return indices.length;
  }

  /**
   * Clear all events (for testing)
   */
  clear() {
    this.events = [];
    this.snapshots.clear();
    this.aggregateStreams.clear();
    console.log('[EventStore] Cleared all data');
  }

  /**
   * Get store statistics
   * @returns {Object}
   */
  getStats() {
    return {
      totalEvents: this.events.length,
      totalAggregates: this.aggregateStreams.size,
      totalSnapshots: this.snapshots.size,
      memoryUsage: process.memoryUsage().heapUsed
    };
  }
}

/**
 * Base class for event-sourced aggregates
 * 
 * Extend this class to create domain aggregates
 */
class AggregateRoot {
  constructor(aggregateId) {
    if (new.target === AggregateRoot) {
      throw new Error('AggregateRoot is abstract and cannot be instantiated directly');
    }
    
    this.aggregateId = aggregateId;
    this.version = 0;
    this.state = {};
    this.uncommittedEvents = [];
    this.shouldSnapshot = false;
  }

  /**
   * Apply event to state - MUST be overridden
   * @param {Event} event 
   */
  apply(event) {
    throw new Error('Subclasses must implement apply() method');
  }

  /**
   * Replay events to reconstruct state
   * @param {Event[]} events 
   */
  replay(events) {
    for (const event of events) {
      this.apply(event);
      this.version = event.version;
    }
    console.log(`[AggregateRoot] Replayed ${events.length} events for ${this.aggregateId}, now at v${this.version}`);
  }

  /**
   * Load from event store with snapshot optimization
   * @param {EventStore} store 
   */
  async loadFromStore(store) {
    const snapshot = store.getSnapshot(this.aggregateId);
    let fromVersion = 1;
    
    if (snapshot) {
      this.state = { ...snapshot.state };
      this.version = snapshot.version;
      fromVersion = snapshot.version + 1;
      console.log(`[AggregateRoot] Loaded snapshot for ${this.aggregateId} at v${snapshot.version}`);
    }
    
    const events = store.getEvents(this.aggregateId, fromVersion);
    if (events.length > 0) {
      this.replay(events);
    }
    
    return this;
  }

  /**
   * Record a new event (not yet committed)
   * @param {string} type 
   * @param {Object} payload 
   */
  record(type, payload) {
    const event = {
      type,
      payload,
      aggregateId: this.aggregateId,
      version: this.version + 1
    };
    
    this.apply(event);
    this.version++;
    this.uncommittedEvents.push(event);
    
    // Mark for snapshot if threshold reached
    if (this.version % 100 === 0) {
      this.shouldSnapshot = true;
    }
    
    console.log(`[AggregateRoot] Recorded event: ${type} for ${this.aggregateId}`);
    return event;
  }

  /**
   * Get uncommitted events
   * @returns {Event[]}
   */
  getUncommittedEvents() {
    return [...this.uncommittedEvents];
  }

  /**
   * Commit events to store
   * @param {EventStore} store 
   * @param {EventBus} bus 
   */
  async commit(store, bus) {
    for (const event of this.uncommittedEvents) {
      store.append(this.aggregateId, event.type, event.payload);
      if (bus) {
        await bus.publish(event);
      }
    }
    
    if (this.shouldSnapshot) {
      store.saveSnapshot(this.aggregateId, this.version, { ...this.state });
      this.shouldSnapshot = false;
      console.log(`[AggregateRoot] Saved snapshot for ${this.aggregateId}`);
    }
    
    this.uncommittedEvents = [];
  }

  /**
   * Get current state
   * @returns {Object}
   */
  getState() {
    return { ...this.state };
  }
}

/**
 * Event bus for publish/subscribe pattern
 */
class EventBus extends EventEmitter {
  constructor() {
    super();
    this.subscribers = new Map();
    this.eventLog = [];
    console.log('[EventBus] Initialized');
  }

  /**
   * Subscribe to event type
   * @param {string} eventType 
   * @param {Function} handler 
   */
  subscribe(eventType, handler) {
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, []);
    }
    this.subscribers.get(eventType).push(handler);
    console.log(`[EventBus] Subscribed to ${eventType}`);
  }

  /**
   * Subscribe to all events
   * @param {Function} handler 
   */
  subscribeAll(handler) {
    this.on('**', handler);
    console.log('[EventBus] Subscribed to all events');
  }

  /**
   * Publish event to subscribers
   * @param {Event} event 
   */
  async publish(event) {
    this.eventLog.push(event);
    
    // Emit to specific type subscribers
    const handlers = this.subscribers.get(event.type) || [];
    for (const handler of handlers) {
      try {
        await handler(event);
      } catch (error) {
        console.error(`[EventBus] Error in handler for ${event.type}:`, error);
      }
    }
    
    // Emit to wildcard
    this.emit('**', event);
    this.emit(event.type, event);
    
    console.log(`[EventBus] Published event: ${event.type}`);
  }

  /**
   * Get event log
   * @returns {Event[]}
   */
  getEventLog() {
    return [...this.eventLog];
  }

  /**
   * Clear event log
   */
  clear() {
    this.eventLog = [];
    this.removeAllListeners();
    this.subscribers.clear();
  }
}

export { EventStore, AggregateRoot, EventBus };
