# ADR-112: API Gateway Rate Limiting

## Status
Proposed

## Context
Our APIs are vulnerable to abuse and "noisy neighbor" problems. A single client can overwhelm the system, impacting availability for all other users.

## Decision
Implement Rate Limiting at the API Gateway:
1. **Algorithm**: Use the **Token Bucket** algorithm to allow for short bursts of traffic while maintaining a steady average rate.
2. **Distributed State**: Use Redis to store counters and buckets, ensuring rate limits are enforced across all gateway instances.
3. **Multi-tier Quotas**: Define limits based on client identity (e.g., Anonymous: 10 req/min, Authenticated: 100 req/min, Premium: 1000 req/min).
4. **Burst Handling**: Allow a configurable "burst" capacity to handle legitimate spikes in traffic without immediate 429 responses.

## Consequences
- **Easier**: Protection against DoS attacks, fairer resource distribution, and predictable system load.
- **More Difficult**: Added latency for every request due to the Redis check; need for clear error messaging (429 Too Many Requests).
