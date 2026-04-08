# ADR-113: WebSocket Connection Pool

## Status
Proposed

## Context
Real-time communication is scaling, and we are seeing inefficiencies in how WebSocket connections are managed, leading to memory leaks and uneven load distribution.

## Decision
Implement a robust WebSocket Connection Pool:
1. **Pooling Strategy**: Use a centralized registry (Redis) to track which user is connected to which server node.
2. **Heartbeat Mechanism**: Implement a strict ping/pong keepalive to prune dead connections and prevent "ghost" sessions.
3. **Load Balancing**: Use a sticky-session or consistent-hashing approach at the gateway to distribute connections evenly.
4. **Graceful Shutdown**: Implement a drain period where the server notifies clients to reconnect before the process terminates.

## Consequences
- **Easier**: Better resource utilization, improved connection stability, and easier scaling of real-time features.
- **More Difficult**: Increased complexity in the gateway layer to handle session stickiness and state synchronization.
