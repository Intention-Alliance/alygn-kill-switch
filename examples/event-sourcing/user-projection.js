/**
 * User Projection - Read Model for User Queries
 * 
 * Builds optimized read views from user events.
 * Demonstrates:
 * - CQRS read model pattern
 * - Multiple view types (list, detail, stats)
 * - Index-based queries
 */

import { Projection, MaterializedView } from '../../core/event-projections.js';

class UserProjection extends Projection {
  constructor() {
    super('UserProjection');
    
    // Materialized views for different query patterns
    this.views = {
      users: new MaterializedView('users'),
      activeUsers: new MaterializedView('activeUsers'),
      stats: {
        totalUsers: 0,
        activeUsers: 0,
        suspendedUsers: 0,
        deletedUsers: 0,
        usersCreatedToday: 0,
        usersCreatedThisWeek: 0
      }
    };
    
    // Register event handlers
    this.on('UserCreated', this.handleUserCreated);
    this.on('UserUpdated', this.handleUserUpdated);
    this.on('UserEmailChanged', this.handleUserEmailChanged);
    this.on('UserSuspended', this.handleUserSuspended);
    this.on('UserReactivated', this.handleUserReactivated);
    this.on('UserDeleted', this.handleUserDeleted);
  }

  /**
   * Apply event to projection
   * @param {Object} event 
   */
  async apply(event) {
    await this.handle(event);
  }

  /**
   * Handle UserCreated event
   */
  handleUserCreated(event) {
    const userId = event.aggregateId;
    const user = {
      id: userId,
      email: event.payload.email,
      name: event.payload.name,
      status: 'active',
      createdAt: event.timestamp,
      updatedAt: event.timestamp,
      metadata: event.payload.metadata || {}
    };
    
    this.views.users.set(userId, user);
    this.views.activeUsers.set(userId, user);
    this.views.stats.totalUsers++;
    this.views.stats.activeUsers++;
    
    // Track daily/weekly stats
    const now = new Date(event.timestamp);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    if (event.timestamp >= today) {
      this.views.stats.usersCreatedToday++;
      this.views.stats.usersCreatedThisWeek++;
    }
    
    console.log(`[UserProjection] User created: ${userId} (${event.payload.email})`);
  }

  /**
   * Handle UserUpdated event
   */
  handleUserUpdated(event) {
    const userId = event.aggregateId;
    const user = this.views.users.get(userId);
    
    if (user) {
      if (event.payload.name) {
        user.name = event.payload.name;
      }
      if (event.payload.metadata) {
        user.metadata = { ...user.metadata, ...event.payload.metadata };
      }
      user.updatedAt = event.timestamp;
      
      this.views.users.set(userId, user);
      console.log(`[UserProjection] User updated: ${userId}`);
    }
  }

  /**
   * Handle UserEmailChanged event
   */
  handleUserEmailChanged(event) {
    const userId = event.aggregateId;
    const user = this.views.users.get(userId);
    
    if (user) {
      user.email = event.payload.newEmail;
      user.updatedAt = event.timestamp;
      this.views.users.set(userId, user);
      console.log(`[UserProjection] User email changed: ${userId} -> ${event.payload.newEmail}`);
    }
  }

  /**
   * Handle UserSuspended event
   */
  handleUserSuspended(event) {
    const userId = event.aggregateId;
    const user = this.views.users.get(userId);
    
    if (user) {
      user.status = 'suspended';
      user.updatedAt = event.timestamp;
      user.metadata.suspensionReason = event.payload.reason;
      
      this.views.users.set(userId, user);
      this.views.activeUsers.delete(userId);
      
      this.views.stats.activeUsers--;
      this.views.stats.suspendedUsers++;
      
      console.log(`[UserProjection] User suspended: ${userId}`);
    }
  }

  /**
   * Handle UserReactivated event
   */
  handleUserReactivated(event) {
    const userId = event.aggregateId;
    const user = this.views.users.get(userId);
    
    if (user) {
      user.status = 'active';
      user.updatedAt = event.timestamp;
      delete user.metadata.suspensionReason;
      
      this.views.users.set(userId, user);
      this.views.activeUsers.set(userId, user);
      
      this.views.stats.activeUsers++;
      this.views.stats.suspendedUsers--;
      
      console.log(`[UserProjection] User reactivated: ${userId}`);
    }
  }

  /**
   * Handle UserDeleted event
   */
  handleUserDeleted(event) {
    const userId = event.aggregateId;
    const user = this.views.users.get(userId);
    
    if (user) {
      user.status = 'deleted';
      user.updatedAt = event.timestamp;
      user.metadata.deletedAt = event.timestamp;
      user.metadata.deleteReason = event.payload.reason;
      
      this.views.users.set(userId, user);
      this.views.activeUsers.delete(userId);
      
      this.views.stats.activeUsers--;
      this.views.stats.deletedUsers++;
      
      console.log(`[UserProjection] User deleted: ${userId}`);
    }
  }

  /**
   * Get user by ID
   * @param {string} userId 
   * @returns {Object|null}
   */
  getUser(userId) {
    return this.views.users.get(userId) || null;
  }

  /**
   * Get all users
   * @returns {Object[]}
   */
  getAllUsers() {
    return this.views.users.getAll();
  }

  /**
   * Get active users only
   * @returns {Object[]}
   */
  getActiveUsers() {
    return this.views.activeUsers.getAll();
  }

  /**
   * Get users by status
   * @param {string} status 
   * @returns {Object[]}
   */
  getUsersByStatus(status) {
    const allUsers = this.views.users.getAll();
    return allUsers.filter(user => user.status === status);
  }

  /**
   * Get statistics
   * @returns {Object}
   */
  getStats() {
    return { ...this.views.stats };
  }

  /**
   * Search users by email
   * @param {string} emailPattern 
   * @returns {Object[]}
   */
  searchByEmail(emailPattern) {
    const allUsers = this.views.users.getAll();
    const pattern = emailPattern.toLowerCase();
    return allUsers.filter(user => 
      user.email.toLowerCase().includes(pattern)
    );
  }

  /**
   * Search users by name
   * @param {string} namePattern 
   * @returns {Object[]}
   */
  searchByName(namePattern) {
    const allUsers = this.views.users.getAll();
    const pattern = namePattern.toLowerCase();
    return allUsers.filter(user => 
      user.name.toLowerCase().includes(pattern)
    );
  }
}

export { UserProjection };
