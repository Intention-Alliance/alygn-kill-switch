# ADR-114: Event Sourcing

## Status
Proposed

## Context
For critical business domains, we need a perfect audit trail of every state change. Traditional CRUD operations overwrite state, losing the history of *how* the current state was reached.

## Decision
Implement Event Sourcing for core entities:
1. **Event Store**: An append-only log (e.g., Kafka or a specialized EventStoreDB) where every change is stored as an immutable event.
2. **Event Replay**: The ability to reconstruct the current state of an entity by replaying its event stream from the beginning.
3. **Snapshots**: Periodically save the state of an entity to avoid replaying thousands of events on every load.
4. **Projections**: Asynchronous processes that consume the event log to build read-optimized views (CQRS pattern).

## Consequences
- **Easier**: Perfect audit logs, "time-travel" debugging, and high-performance write operations.
- **More Difficult**: Increased complexity in data querying (requires projections); event schema evolution (versioning) becomes a challenge.
