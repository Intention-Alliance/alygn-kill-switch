# Agent Session Cleanup Policy

## Problem
Agent sessions accumulate over time, potentially using significant compute resources.

## Current State
- **Total session files:** 23 JSON files
- **Sessions older than 7 days:** To be determined
- **Sessions older than 30 days:** To be determined

## Cleanup Policy

### Sessions to Delete
- Sessions older than 30 days (stale)
- Sessions with no activity in 7+ days (inactive)
- Failed/errored sessions (outdated)

### Sessions to Keep
- Active sessions (recent activity)
- Sessions with important results (last 7 days)

## Implementation

### Manual Cleanup
```bash
# List sessions older than 30 days
find ~/.openclaw -name "*.json" -path "*sessions*" -type f -mtime +30

# Delete sessions older than 30 days
find ~/.openclaw -name "*.json" -path "*sessions*" -type f -mtime +30 -delete

# List sessions older than 7 days
find ~/.openclaw -name "*.json" -path "*sessions*" -type f -mtime +7

# Delete sessions older than 7 days (excluding last 7)
find ~/.openclaw -name "*.json" -path "*sessions*" -type f -mtime +7 -delete
```

### Automated Cleanup (Future)
Add to crontab:
```bash
# Daily cleanup of sessions older than 30 days
0 2 * * * find ~/.openclaw -name "*.json" -path "*sessions*" -type f -mtime +30 -delete
```

## Safety Checks
- Always list before deleting
- Check for important results before cleanup
- Keep logs of deleted sessions (optional)

## Metrics to Track
- Total sessions before/after cleanup
- Disk space recovered
- Number of active sessions retained

---

**Created:** 2026-04-08
**Author:** Wobblus 🔧
**Related:** Issue #157 (if created)