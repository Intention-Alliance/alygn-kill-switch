/**
 * Event Sourcing Framework - Full Workflow Demo
 * 
 * Demonstrates:
 * - Creating aggregates
 * - Event sourcing and replay
 * - Snapshot optimization
 * - CQRS projections
 * - Event bus pub/sub
 * 
 * Run: node examples/event-sourcing/demo.js
 */

import { EventStore, AggregateRoot, EventBus } from '../../core/event-sourcing.js';
import { ProjectionEngine } from '../../core/event-projections.js';
import { UserAggregate } from './user-aggregate.js';
import { UserProjection } from './user-projection.js';

async function runDemo() {
  console.log('='.repeat(60));
  console.log('EVENT SOURCING FRAMEWORK DEMO');
  console.log('='.repeat(60));
  console.log();

  // Initialize core components
  const store = new EventStore({ snapshotInterval: 5 });
  const bus = new EventBus();
  const projectionEngine = new ProjectionEngine(store);

  // Register projection
  const userProjection = new UserProjection();
  projectionEngine.register(userProjection);
  projectionEngine.subscribeToBus(userProjection, bus);

  console.log();
  console.log('─'.repeat(60));
  console.log('STEP 1: Create Users');
  console.log('─'.repeat(60));

  // Create user 1
  const user1 = new UserAggregate('user-001');
  user1.create('alice@example.com', 'Alice Johnson', { role: 'admin' });
  await user1.commit(store, bus);

  // Create user 2
  const user2 = new UserAggregate('user-002');
  user2.create('bob@example.com', 'Bob Smith', { role: 'user' });
  await user2.commit(store, bus);

  // Create user 3
  const user3 = new UserAggregate('user-003');
  user3.create('carol@example.com', 'Carol White', { role: 'user' });
  await user3.commit(store, bus);

  console.log();
  console.log('Projection state after creating 3 users:');
  console.log('  Total users:', userProjection.getStats().totalUsers);
  console.log('  Active users:', userProjection.getStats().activeUsers);
  console.log();

  console.log('─'.repeat(60));
  console.log('STEP 2: Update Users');
  console.log('─'.repeat(60));

  // Update user 1
  const user1Reloaded = new UserAggregate('user-001');
  await user1Reloaded.loadFromStore(store);
  user1Reloaded.update({ name: 'Alice Johnson-Smith', metadata: { team: 'engineering' } });
  await user1Reloaded.commit(store, bus);

  // Change email for user 2
  const user2Reloaded = new UserAggregate('user-002');
  await user2Reloaded.loadFromStore(store);
  user2Reloaded.changeEmail('bob.smith@example.com');
  await user2Reloaded.commit(store, bus);

  console.log();
  console.log('User 1 after update:');
  console.log('  Name:', user1Reloaded.getInfo().name);
  console.log('  Version:', user1Reloaded.getInfo().version);
  console.log();

  console.log('─'.repeat(60));
  console.log('STEP 3: Suspend and Reactivate User');
  console.log('─'.repeat(60));

  // Suspend user 3
  const user3Reloaded = new UserAggregate('user-003');
  await user3Reloaded.loadFromStore(store);
  user3Reloaded.suspend('Policy violation');
  await user3Reloaded.commit(store, bus);

  console.log('User 3 suspended. Stats:');
  console.log('  Active users:', userProjection.getStats().activeUsers);
  console.log('  Suspended users:', userProjection.getStats().suspendedUsers);

  // Reactivate user 3
  const user3Again = new UserAggregate('user-003');
  await user3Again.loadFromStore(store);
  user3Again.reactivate();
  await user3Again.commit(store, bus);

  console.log('User 3 reactivated. Stats:');
  console.log('  Active users:', userProjection.getStats().activeUsers);
  console.log('  Suspended users:', userProjection.getStats().suspendedUsers);
  console.log();

  console.log('─'.repeat(60));
  console.log('STEP 4: Delete User');
  console.log('─'.repeat(60));

  // Delete user 2
  const user2Final = new UserAggregate('user-002');
  await user2Final.loadFromStore(store);
  user2Final.delete('User request');
  await user2Final.commit(store, bus);

  console.log('User 2 deleted. Final stats:');
  console.log('  Total users:', userProjection.getStats().totalUsers);
  console.log('  Active users:', userProjection.getStats().activeUsers);
  console.log('  Deleted users:', userProjection.getStats().deletedUsers);
  console.log();

  console.log('─'.repeat(60));
  console.log('STEP 5: Event Replay and Snapshot');
  console.log('─'.repeat(60));

  // Create a new user with many events to trigger snapshot
  const user4 = new UserAggregate('user-004');
  user4.create('dave@example.com', 'Dave Brown', {});
  await user4.commit(store, bus);

  // Generate multiple updates
  for (let i = 1; i <= 10; i++) {
    const user4Reloaded = new UserAggregate('user-004');
    await user4Reloaded.loadFromStore(store);
    user4Reloaded.update({ metadata: { updateCount: i } });
    await user4Reloaded.commit(store, bus);
  }

  console.log('User 4 after 10 updates:');
  console.log('  Version:', user4.getInfo().version);
  console.log('  Snapshot saved:', user4.shouldSnapshot ? 'No (will on next commit)' : 'Yes');
  
  // Check if snapshot was saved
  const snapshot = store.getSnapshot('user-004');
  console.log('  Snapshot exists:', !!snapshot);
  if (snapshot) {
    console.log('  Snapshot at version:', snapshot.version);
  }
  console.log();

  console.log('─'.repeat(60));
  console.log('STEP 6: Rebuild Projection from Event Stream');
  console.log('─'.repeat(60));

  // Simulate projection rebuild
  console.log('Rebuilding projection from scratch...');
  const rebuildResult = await projectionEngine.rebuildProjection('UserProjection');
  console.log('Rebuild complete:');
  console.log('  Events processed:', rebuildResult.eventsProcessed);
  console.log('  Users in projection:', userProjection.getAllUsers().length);
  console.log();

  console.log('─'.repeat(60));
  console.log('STEP 7: Query Read Models');
  console.log('─'.repeat(60));

  console.log('All users:');
  for (const user of userProjection.getAllUsers()) {
    console.log(`  - ${user.name} (${user.email}) - ${user.status}`);
  }
  console.log();

  console.log('Active users only:');
  for (const user of userProjection.getActiveUsers()) {
    console.log(`  - ${user.name} (${user.email})`);
  }
  console.log();

  console.log('Search by name "Alice":');
  const searchResults = userProjection.searchByName('Alice');
  for (const user of searchResults) {
    console.log(`  - ${user.name} (${user.email})`);
  }
  console.log();

  console.log('─'.repeat(60));
  console.log('STEP 8: Store Statistics');
  console.log('─'.repeat(60));

  const stats = store.getStats();
  console.log('Event Store:');
  console.log('  Total events:', stats.totalEvents);
  console.log('  Total aggregates:', stats.totalAggregates);
  console.log('  Total snapshots:', stats.totalSnapshots);
  console.log();

  console.log('Projection Status:');
  const projectionStatus = projectionEngine.getStatus();
  for (const status of projectionStatus) {
    console.log(`  - ${status.name}: v${status.lastProcessedPosition}, ${status.stateSize} bytes`);
  }
  console.log();

  console.log('─'.repeat(60));
  console.log('DEMO COMPLETE');
  console.log('─'.repeat(60));
  console.log();
  console.log('Key takeaways:');
  console.log('  ✓ Events are immutable and appended to store');
  console.log('  ✓ Aggregates reconstruct state by replaying events');
  console.log('  ✓ Snapshots optimize replay performance');
  console.log('  ✓ Projections build read models asynchronously (CQRS)');
  console.log('  ✓ Event bus enables pub/sub for real-time updates');
  console.log();
}

// Run demo
runDemo().catch(console.error);
