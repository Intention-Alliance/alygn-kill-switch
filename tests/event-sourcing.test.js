/**
 * Event Sourcing Framework Tests
 * 
 * Tests for:
 * - Event append and replay
 * - Snapshot save and restore
 * - Projection rebuild
 * - Aggregate state management
 * 
 * Run: npm test -- event-sourcing.test.js
 */

import { EventStore, AggregateRoot, EventBus } from '../core/event-sourcing.js';
import { Projection, ProjectionEngine, MaterializedView } from '../core/event-projections.js';
import { UserAggregate } from '../examples/event-sourcing/user-aggregate.js';
import { UserProjection } from '../examples/event-sourcing/user-projection.js';

describe('EventStore', () => {
  let store;

  beforeEach(() => {
    store = new EventStore();
  });

  afterEach(() => {
    store.clear();
  });

  describe('Event Append', () => {
    test('appends event with correct structure', () => {
      const event = store.append('agg-1', 'TestEvent', { data: 'value' });

      expect(event.type).toBe('TestEvent');
      expect(event.payload).toEqual({ data: 'value' });
      expect(event.aggregateId).toBe('agg-1');
      expect(event.version).toBe(1);
      expect(event.timestamp).toBeGreaterThan(0);
    });

    test('increments version for same aggregate', () => {
      store.append('agg-1', 'Event1', {});
      const event2 = store.append('agg-1', 'Event2', {});
      const event3 = store.append('agg-1', 'Event3', {});

      expect(event2.version).toBe(2);
      expect(event3.version).toBe(3);
    });

    test('maintains separate streams for different aggregates', () => {
      store.append('agg-1', 'Event1', {});
      store.append('agg-2', 'Event2', {});
      store.append('agg-1', 'Event3', {});

      const events1 = store.getEvents('agg-1');
      const events2 = store.getEvents('agg-2');

      expect(events1).toHaveLength(2);
      expect(events2).toHaveLength(1);
      expect(events1[0].version).toBe(1);
      expect(events1[1].version).toBe(2);
    });
  });

  describe('Event Retrieval', () => {
    test('gets all events for aggregate', () => {
      store.append('agg-1', 'Event1', {});
      store.append('agg-1', 'Event2', {});
      store.append('agg-1', 'Event3', {});

      const events = store.getEvents('agg-1');

      expect(events).toHaveLength(3);
      expect(events.map(e => e.version)).toEqual([1, 2, 3]);
    });

    test('filters events by fromVersion', () => {
      store.append('agg-1', 'Event1', {});
      store.append('agg-1', 'Event2', {});
      store.append('agg-1', 'Event3', {});

      const events = store.getEvents('agg-1', 2);

      expect(events).toHaveLength(2);
      expect(events[0].version).toBe(2);
    });

    test('gets events for multiple aggregates', () => {
      store.append('agg-1', 'Event1', {});
      store.append('agg-2', 'Event2', {});
      store.append('agg-1', 'Event3', {});

      const events = store.getEventsForAggregates(['agg-1', 'agg-2']);

      expect(events).toHaveLength(3);
    });

    test('gets all events globally', () => {
      store.append('agg-1', 'Event1', {});
      store.append('agg-2', 'Event2', {});

      const all = store.getAllEvents();

      expect(all).toHaveLength(2);
    });

    test('filters all events by timestamp', () => {
      const before = Date.now();
      store.append('agg-1', 'Event1', {});
      const after = Date.now();

      const filtered = store.getAllEvents(before);

      expect(filtered).toHaveLength(1);
      expect(filtered[0].timestamp).toBeGreaterThan(before);
    });
  });

  describe('Snapshots', () => {
    test('saves snapshot', () => {
      const state = { name: 'test', count: 42 };
      store.saveSnapshot('agg-1', 5, state);

      const snapshot = store.getSnapshot('agg-1');

      expect(snapshot).toBeTruthy();
      expect(snapshot.aggregateId).toBe('agg-1');
      expect(snapshot.version).toBe(5);
      expect(snapshot.state).toEqual(state);
    });

    test('returns null for missing snapshot', () => {
      const snapshot = store.getSnapshot('nonexistent');
      expect(snapshot).toBeNull();
    });

    test('updates snapshot on re-save', () => {
      store.saveSnapshot('agg-1', 5, { version: 5 });
      store.saveSnapshot('agg-1', 10, { version: 10 });

      const snapshot = store.getSnapshot('agg-1');
      expect(snapshot.version).toBe(10);
      expect(snapshot.state).toEqual({ version: 10 });
    });

    test('getCurrentVersion returns correct version', () => {
      store.append('agg-1', 'Event1', {});
      store.append('agg-1', 'Event2', {});
      store.append('agg-1', 'Event3', {});

      expect(store.getCurrentVersion('agg-1')).toBe(3);
      expect(store.getCurrentVersion('agg-2')).toBe(0);
    });
  });

  describe('Store Statistics', () => {
    test('returns accurate stats', () => {
      store.append('agg-1', 'Event1', {});
      store.append('agg-1', 'Event2', {});
      store.append('agg-2', 'Event3', {});
      store.saveSnapshot('agg-1', 2, {});

      const stats = store.getStats();

      expect(stats.totalEvents).toBe(3);
      expect(stats.totalAggregates).toBe(2);
      expect(stats.totalSnapshots).toBe(1);
      expect(stats.memoryUsage).toBeGreaterThan(0);
    });
  });
});

describe('AggregateRoot', () => {
  class TestAggregate extends AggregateRoot {
    constructor(id) {
      super(id);
      this.state = { counter: 0, name: '' };
    }

    apply(event) {
      switch (event.type) {
        case 'Incremented':
          this.state.counter += event.payload.amount;
          break;
        case 'Named':
          this.state.name = event.payload.name;
          break;
      }
    }

    increment(amount = 1) {
      return this.record('Incremented', { amount });
    }

    setName(name) {
      return this.record('Named', { name });
    }
  }

  let store;
  let bus;

  beforeEach(() => {
    store = new EventStore();
    bus = new EventBus();
  });

  afterEach(() => {
    store.clear();
    bus.clear();
  });

  test('cannot instantiate abstract class', () => {
    expect(() => new AggregateRoot('test')).toThrow();
  });

  test('applies events to state', () => {
    const agg = new TestAggregate('test-1');
    agg.increment(5);
    agg.increment(3);

    expect(agg.getState().counter).toBe(8);
  });

  test('replays events to reconstruct state', () => {
    const agg1 = new TestAggregate('test-1');
    agg1.increment(5);
    agg1.setName('Test');
    agg1.commit(store, bus);

    const agg2 = new TestAggregate('test-1');
    const events = store.getEvents('test-1');
    agg2.replay(events);

    expect(agg2.getState().counter).toBe(5);
    expect(agg2.getState().name).toBe('Test');
    expect(agg2.version).toBe(2);
  });

  test('loads from store with replay', async () => {
    const agg1 = new TestAggregate('test-1');
    agg1.increment(10);
    agg1.commit(store, bus);

    const agg2 = new TestAggregate('test-1');
    await agg2.loadFromStore(store);

    expect(agg2.getState().counter).toBe(10);
  });

  test('loads from snapshot then replays remaining events', async () => {
    const agg1 = new TestAggregate('test-1');
    agg1.increment(5);
    agg1.commit(store, bus);

    // Manually save snapshot
    store.saveSnapshot('test-1', 1, { counter: 5, name: '' });

    // Add more events
    const agg1b = new TestAggregate('test-1');
    await agg1b.loadFromStore(store);
    agg1b.increment(3);
    agg1b.commit(store, bus);

    // Load with snapshot
    const agg2 = new TestAggregate('test-1');
    await agg2.loadFromStore(store);

    expect(agg2.getState().counter).toBe(8);
    expect(agg2.version).toBe(2);
  });

  test('commits events to store and bus', async () => {
    const agg = new TestAggregate('test-1');
    agg.increment(5);
    await agg.commit(store, bus);

    const events = store.getEvents('test-1');
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('Incremented');

    const busLog = bus.getEventLog();
    expect(busLog).toHaveLength(1);
  });

  test('marks for snapshot after threshold', () => {
    const agg = new TestAggregate('test-1');
    
    for (let i = 0; i < 100; i++) {
      agg.increment(1);
    }

    expect(agg.shouldSnapshot).toBe(true);
  });

  test('clears uncommitted events after commit', async () => {
    const agg = new TestAggregate('test-1');
    agg.increment(5);
    
    expect(agg.getUncommittedEvents()).toHaveLength(1);

    await agg.commit(store, bus);

    expect(agg.getUncommittedEvents()).toHaveLength(0);
  });
});

describe('EventBus', () => {
  let bus;

  beforeEach(() => {
    bus = new EventBus();
  });

  afterEach(() => {
    bus.clear();
  });

  test('publishes to specific type subscribers', async () => {
    const handler = jest.fn();
    bus.subscribe('TestEvent', handler);

    await bus.publish({ type: 'TestEvent', data: 'test' });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].type).toBe('TestEvent');
  });

  test('publishes to all subscribers', async () => {
    const handler = jest.fn();
    bus.subscribeAll(handler);

    await bus.publish({ type: 'AnyEvent', data: 'test' });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('handles multiple subscribers', async () => {
    const handler1 = jest.fn();
    const handler2 = jest.fn();
    bus.subscribe('TestEvent', handler1);
    bus.subscribe('TestEvent', handler2);

    await bus.publish({ type: 'TestEvent', data: 'test' });

    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(1);
  });

  test('continues publishing when handler throws', async () => {
    const failingHandler = () => { throw new Error('Test error'); };
    const successHandler = jest.fn();
    
    bus.subscribe('TestEvent', failingHandler);
    bus.subscribe('TestEvent', successHandler);

    await bus.publish({ type: 'TestEvent', data: 'test' });

    expect(successHandler).toHaveBeenCalledTimes(1);
  });

  test('maintains event log', async () => {
    await bus.publish({ type: 'Event1', data: 'test1' });
    await bus.publish({ type: 'Event2', data: 'test2' });

    const log = bus.getEventLog();
    expect(log).toHaveLength(2);
    expect(log[0].type).toBe('Event1');
    expect(log[1].type).toBe('Event2');
  });
});

describe('UserAggregate (Integration)', () => {
  let store;
  let bus;

  beforeEach(() => {
    store = new EventStore();
    bus = new EventBus();
  });

  afterEach(() => {
    store.clear();
    bus.clear();
  });

  test('creates user with all fields', async () => {
    const user = new UserAggregate('user-1');
    user.create('test@example.com', 'Test User', { role: 'admin' });
    await user.commit(store, bus);

    const info = user.getInfo();
    expect(info.email).toBe('test@example.com');
    expect(info.name).toBe('Test User');
    expect(info.status).toBe('active');
    expect(info.metadata.role).toBe('admin');
  });

  test('updates user fields', async () => {
    const user = new UserAggregate('user-1');
    user.create('test@example.com', 'Test User');
    await user.commit(store, bus);

    const user2 = new UserAggregate('user-1');
    await user2.loadFromStore(store);
    user2.update({ name: 'Updated Name', metadata: { team: 'dev' } });
    await user2.commit(store, bus);

    expect(user2.getInfo().name).toBe('Updated Name');
    expect(user2.getInfo().metadata.team).toBe('dev');
  });

  test('changes email', async () => {
    const user = new UserAggregate('user-1');
    user.create('old@example.com', 'Test');
    await user.commit(store, bus);

    const user2 = new UserAggregate('user-1');
    await user2.loadFromStore(store);
    user2.changeEmail('new@example.com');
    await user2.commit(store, bus);

    expect(user2.getInfo().email).toBe('new@example.com');
  });

  test('suspends and reactivates user', async () => {
    const user = new UserAggregate('user-1');
    user.create('test@example.com', 'Test');
    await user.commit(store, bus);

    const user2 = new UserAggregate('user-1');
    await user2.loadFromStore(store);
    user2.suspend('Policy violation');
    await user2.commit(store, bus);

    expect(user2.getInfo().status).toBe('suspended');

    const user3 = new UserAggregate('user-1');
    await user3.loadFromStore(store);
    user3.reactivate();
    await user3.commit(store, bus);

    expect(user3.getInfo().status).toBe('active');
  });

  test('deletes user', async () => {
    const user = new UserAggregate('user-1');
    user.create('test@example.com', 'Test');
    await user.commit(store, bus);

    const user2 = new UserAggregate('user-1');
    await user2.loadFromStore(store);
    user2.delete('User request');
    await user2.commit(store, bus);

    expect(user2.getInfo().status).toBe('deleted');
    expect(user2.getInfo().metadata.deleteReason).toBe('User request');
  });

  test('prevents operations on deleted user', async () => {
    const user = new UserAggregate('user-1');
    user.create('test@example.com', 'Test');
    user.delete('Reason');
    await user.commit(store, bus);

    const user2 = new UserAggregate('user-1');
    await user2.loadFromStore(store);

    expect(() => user2.update({ name: 'New' })).toThrow('Cannot update deleted user');
    expect(() => user2.changeEmail('new@example.com')).toThrow('Cannot change email for deleted user');
  });
});

describe('Projection', () => {
  class TestProjection extends Projection {
    constructor() {
      super('TestProjection');
      this.state = { count: 0, items: [] };
      this.on('ItemAdded', this.handleItemAdded);
      this.on('ItemRemoved', this.handleItemRemoved);
    }

    handleItemAdded(event) {
      this.state.count++;
      this.state.items.push(event.payload);
    }

    handleItemRemoved(event) {
      this.state.count = Math.max(0, this.state.count - 1);
      this.state.items = this.state.items.filter(i => i.id !== event.payload.id);
    }
  }

  let projection;

  beforeEach(() => {
    projection = new TestProjection();
  });

  test('handles events through handle()', async () => {
    await projection.handle({ type: 'ItemAdded', payload: { id: '1', name: 'Item 1' } });
    await projection.handle({ type: 'ItemAdded', payload: { id: '2', name: 'Item 2' } });

    const state = projection.getState();
    expect(state.count).toBe(2);
    expect(state.items).toHaveLength(2);
  });

  test('tracks last processed position', async () => {
    const event = { type: 'ItemAdded', payload: {}, timestamp: 12345 };
    await projection.handle(event);

    expect(projection.lastProcessedPosition).toBe(12345);
  });

  test('resets state', async () => {
    await projection.handle({ type: 'ItemAdded', payload: { id: '1' } });
    projection.reset();

    const state = projection.getState();
    expect(state.count).toBe(0);
    expect(state.items).toHaveLength(0);
    expect(projection.lastProcessedPosition).toBe(0);
  });

  test('returns metadata', async () => {
    await projection.handle({ type: 'ItemAdded', payload: { id: '1' } });

    const metadata = projection.getMetadata();
    expect(metadata.name).toBe('TestProjection');
    expect(metadata.lastProcessedPosition).toBeGreaterThan(0);
    expect(metadata.isRebuilding).toBe(false);
  });
});

describe('ProjectionEngine', () => {
  let store;
  let engine;

  beforeEach(() => {
    store = new EventStore();
    engine = new ProjectionEngine(store);
  });

  class TestProjection extends Projection {
    constructor() {
      super('TestProjection');
      this.state = { events: [] };
      this.on('TestEvent', (event) => {
        this.state.events.push(event);
      });
    }
  }

  test('registers projections', () => {
    const proj = new TestProjection();
    engine.register(proj);

    expect(engine.get('TestProjection')).toBe(proj);
    expect(engine.get('NonExistent')).toBeNull();
  });

  test('rebuilds projection from event stream', async () => {
    // Add events to store
    store.append('agg-1', 'TestEvent', { data: 1 });
    store.append('agg-1', 'TestEvent', { data: 2 });
    store.append('agg-2', 'TestEvent', { data: 3 });

    const proj = new TestProjection();
    engine.register(proj);

    const result = await engine.rebuildProjection('TestProjection');

    expect(result.eventsProcessed).toBe(3);
    expect(proj.getState().events).toHaveLength(3);
  });

  test('rebuilds all projections', async () => {
    store.append('agg-1', 'TestEvent', { data: 1 });

    const proj1 = new TestProjection();
    const proj2 = new TestProjection();
    engine.register(proj1);
    engine.register(proj2);

    const results = await engine.rebuildAll();

    expect(results).toHaveLength(2);
    expect(proj1.getState().events).toHaveLength(1);
    expect(proj2.getState().events).toHaveLength(1);
  });

  test('returns projection status', async () => {
    const proj = new TestProjection();
    engine.register(proj);

    const status = engine.getStatus();
    expect(status).toHaveLength(1);
    expect(status[0].name).toBe('TestProjection');
  });

  test('emits progress during rebuild', async () => {
    // Add many events
    for (let i = 0; i < 150; i++) {
      store.append('agg-1', 'TestEvent', { i });
    }

    const proj = new TestProjection();
    engine.register(proj);

    const progressHandler = jest.fn();
    engine.on('progress', progressHandler);

    await engine.rebuildProjection('TestProjection');

    // Should emit at least once (at 100 events)
    expect(progressHandler).toHaveBeenCalled();
  });
});

describe('UserProjection (Integration)', () => {
  let projection;

  beforeEach(() => {
    projection = new UserProjection();
  });

  test('builds user list from events', async () => {
    await projection.handle({
      type: 'UserCreated',
      aggregateId: 'user-1',
      payload: { email: 'a@test.com', name: 'A' },
      timestamp: Date.now()
    });

    await projection.handle({
      type: 'UserCreated',
      aggregateId: 'user-2',
      payload: { email: 'b@test.com', name: 'B' },
      timestamp: Date.now()
    });

    expect(projection.getAllUsers()).toHaveLength(2);
    expect(projection.getStats().totalUsers).toBe(2);
  });

  test('updates user on UserUpdated event', async () => {
    await projection.handle({
      type: 'UserCreated',
      aggregateId: 'user-1',
      payload: { email: 'a@test.com', name: 'A' },
      timestamp: Date.now()
    });

    await projection.handle({
      type: 'UserUpdated',
      aggregateId: 'user-1',
      payload: { name: 'Updated A' },
      timestamp: Date.now()
    });

    const user = projection.getUser('user-1');
    expect(user.name).toBe('Updated A');
  });

  test('handles suspend and reactivate', async () => {
    await projection.handle({
      type: 'UserCreated',
      aggregateId: 'user-1',
      payload: { email: 'a@test.com', name: 'A' },
      timestamp: Date.now()
    });

    await projection.handle({
      type: 'UserSuspended',
      aggregateId: 'user-1',
      payload: { reason: 'test' },
      timestamp: Date.now()
    });

    expect(projection.getStats().activeUsers).toBe(0);
    expect(projection.getStats().suspendedUsers).toBe(1);

    await projection.handle({
      type: 'UserReactivated',
      aggregateId: 'user-1',
      timestamp: Date.now()
    });

    expect(projection.getStats().activeUsers).toBe(1);
    expect(projection.getStats().suspendedUsers).toBe(0);
  });

  test('searches by name', async () => {
    await projection.handle({
      type: 'UserCreated',
      aggregateId: 'user-1',
      payload: { email: 'a@test.com', name: 'Alice' },
      timestamp: Date.now()
    });

    await projection.handle({
      type: 'UserCreated',
      aggregateId: 'user-2',
      payload: { email: 'b@test.com', name: 'Bob' },
      timestamp: Date.now()
    });

    const results = projection.searchByName('Ali');
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Alice');
  });

  test('searches by email', async () => {
    await projection.handle({
      type: 'UserCreated',
      aggregateId: 'user-1',
      payload: { email: 'alice@test.com', name: 'Alice' },
      timestamp: Date.now()
    });

    const results = projection.searchByEmail('@test.com');
    expect(results).toHaveLength(1);
  });
});

describe('MaterializedView', () => {
  let view;

  beforeEach(() => {
    view = new MaterializedView('test');
  });

  test('stores and retrieves items', () => {
    view.set('key1', { id: 'key1', name: 'Test' });
    
    const item = view.get('key1');
    expect(item.name).toBe('Test');
  });

  test('deletes items', () => {
    view.set('key1', { id: 'key1' });
    view.delete('key1');
    
    expect(view.get('key1')).toBeUndefined();
  });

  test('creates and queries index', () => {
    view.set('1', { id: '1', status: 'active' });
    view.set('2', { id: '2', status: 'active' });
    view.set('3', { id: '3', status: 'inactive' });

    view.createIndex('status');

    const active = view.queryByIndex('status', 'active');
    expect(active).toHaveLength(2);
  });

  test('throws on missing index', () => {
    view.set('1', { id: '1' });
    
    expect(() => view.queryByIndex('status', 'active')).toThrow();
  });

  test('returns all items', () => {
    view.set('1', { id: '1' });
    view.set('2', { id: '2' });

    expect(view.getAll()).toHaveLength(2);
  });

  test('returns count', () => {
    expect(view.count()).toBe(0);
    
    view.set('1', {});
    view.set('2', {});
    
    expect(view.count()).toBe(2);
  });
});
