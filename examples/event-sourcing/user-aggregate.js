/**
 * User Aggregate - Example Event-Sourced Entity
 * 
 * Demonstrates:
 * - Domain events for user lifecycle
 * - State reconstruction from events
 * - Business logic in apply() methods
 * 
 * Events:
 * - UserCreated
 * - UserUpdated
 * - UserEmailChanged
 * - UserDeleted
 */

import { AggregateRoot } from '../../core/event-sourcing.js';

class UserAggregate extends AggregateRoot {
  constructor(userId) {
    super(userId);
    this.state = {
      email: null,
      name: null,
      status: 'pending', // pending, active, suspended, deleted
      createdAt: null,
      updatedAt: null,
      metadata: {}
    };
  }

  /**
   * Apply event to state
   * @param {Object} event 
   */
  apply(event) {
    switch (event.type) {
      case 'UserCreated':
        this.state.email = event.payload.email;
        this.state.name = event.payload.name;
        this.state.status = 'active';
        this.state.createdAt = event.timestamp;
        this.state.updatedAt = event.timestamp;
        this.state.metadata = event.payload.metadata || {};
        break;
        
      case 'UserUpdated':
        this.state.name = event.payload.name ?? this.state.name;
        this.state.metadata = { 
          ...this.state.metadata, 
          ...event.payload.metadata 
        };
        this.state.updatedAt = event.timestamp;
        break;
        
      case 'UserEmailChanged':
        this.state.email = event.payload.newEmail;
        this.state.updatedAt = event.timestamp;
        break;
        
      case 'UserSuspended':
        this.state.status = 'suspended';
        this.state.updatedAt = event.timestamp;
        this.state.metadata.suspensionReason = event.payload.reason;
        break;
        
      case 'UserReactivated':
        this.state.status = 'active';
        this.state.updatedAt = event.timestamp;
        delete this.state.metadata.suspensionReason;
        break;
        
      case 'UserDeleted':
        this.state.status = 'deleted';
        this.state.updatedAt = event.timestamp;
        this.state.metadata.deletedAt = event.timestamp;
        this.state.metadata.deleteReason = event.payload.reason;
        break;
        
      default:
        console.warn(`[UserAggregate] Unknown event type: ${event.type}`);
    }
  }

  /**
   * Create a new user
   * @param {string} email 
   * @param {string} name 
   * @param {Object} metadata 
   */
  create(email, name, metadata = {}) {
    if (this.state.status !== 'pending') {
      throw new Error(`Cannot create user: already exists (status: ${this.state.status})`);
    }
    
    return this.record('UserCreated', {
      email,
      name,
      metadata
    });
  }

  /**
   * Update user details
   * @param {Object} updates 
   */
  update(updates) {
    if (this.state.status === 'deleted') {
      throw new Error('Cannot update deleted user');
    }
    
    return this.record('UserUpdated', {
      name: updates.name,
      metadata: updates.metadata
    });
  }

  /**
   * Change user email
   * @param {string} newEmail 
   */
  changeEmail(newEmail) {
    if (this.state.status === 'deleted') {
      throw new Error('Cannot change email for deleted user');
    }
    
    return this.record('UserEmailChanged', {
      oldEmail: this.state.email,
      newEmail
    });
  }

  /**
   * Suspend user
   * @param {string} reason 
   */
  suspend(reason) {
    if (this.state.status !== 'active') {
      throw new Error(`Cannot suspend user: status is ${this.state.status}`);
    }
    
    return this.record('UserSuspended', { reason });
  }

  /**
   * Reactivate suspended user
   */
  reactivate() {
    if (this.state.status !== 'suspended') {
      throw new Error(`Cannot reactivate user: status is ${this.state.status}`);
    }
    
    return this.record('UserReactivated', {});
  }

  /**
   * Delete user
   * @param {string} reason 
   */
  delete(reason) {
    if (this.state.status === 'deleted') {
      throw new Error('User already deleted');
    }
    
    return this.record('UserDeleted', { reason });
  }

  /**
   * Get user info
   * @returns {Object}
   */
  getInfo() {
    return {
      id: this.aggregateId,
      ...this.state,
      version: this.version
    };
  }
}

export { UserAggregate };
