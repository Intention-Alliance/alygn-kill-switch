# ADR-116: Feature Flag System

## Status
Proposed

## Context
We need to decouple deployment from release. Currently, pushing code to production makes the feature live immediately, which increases risk and prevents A/B testing or gradual rollouts.

## Decision
Implement a centralized Feature Flag System:
1. **Configuration Store**: A JSON/YAML based store (initially in a config file, migrating to a DB/Redis) to manage flag states.
2. **Runtime Evaluation**: A lightweight client library that evaluates flags without adding significant latency.
3. **Segmentation Engine**: Ability to enable flags based on user IDs, groups, or percentages (e.g., "10% of users in Costa Rica").
4. **Gradual Rollout**: Support for ramping up a feature from 1% to 100% over time.

## Consequences
- **Easier**: Safe rollouts, instant rollbacks (via flag toggle), and data-driven A/B testing.
- **More Difficult**: Increased code complexity (if/else blocks for flags); need for a cleanup process to remove stale flags.
