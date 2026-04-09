# Agent Session Cleanup Policy

## Overview

Agent sessions accumulate over time in `~/.openclaw/agents/{agent-name}/sessions/`. This document defines the cleanup policy to manage disk usage while preserving active work.

## Session Lifecycle

### Session Creation
- Sessions are created when agents spawn sub-agents or start persistent sessions
- Each session is stored as a `.jsonl` file with a unique UUID
- Active sessions are locked with a `.lock` file

### Session Aging Policy

| Age | Status | Action |
|-----|--------|--------|
| < 1 day | Active | Keep - in use |
| 1-7 days | Review | May be stale, review before deletion |
| 7-30 days | Stale | Delete automatically |
| > 30 days | Old | Delete immediately |

## Cleanup Schedule

### Automated Cleanup
- **Schedule:** Daily at 3:00 AM (EOD)
- **Command:** `cleanup-sessions.sh 7` (removes sessions > 7 days old)
- **Location:** `~/.openclaw/workspace/scripts/system/cleanup-sessions.sh`

### Manual Cleanup
```bash
# Clean sessions older than 7 days
~/.openclaw/workspace/scripts/system/cleanup-sessions.sh 7

# Clean sessions older than 30 days (aggressive)
~/.openclaw/workspace/scripts/system/cleanup-sessions.sh 30

# Dry run (show what would be deleted)
find ~/.openclaw/agents -name "*.jsonl" -type f -mtime +7
```

## Preserving Important Sessions

To preserve a session beyond the cleanup threshold:

1. **Active sessions** - Sessions with `.lock` files are automatically excluded
2. **Rename pattern** - Add `.preserve` suffix to keep permanently:
   ```bash
   mv session-file.jsonl session-file.jsonl.preserve
   ```
3. **Move to backup** - Copy to a backup location outside the agents directory

## Session Directory Structure

```
~/.openclaw/agents/
├── main/sessions/
│   ├── sessions.json          # Session index (never delete)
│   ├── *.jsonl.lock           # Lock files (never delete)
│   └── <uuid>.jsonl          # Individual session files
├── devops/sessions/
├── architect/sessions/
└── ...
```

## Files Excluded from Cleanup

- `sessions.json` - Session index/database
- `*.lock` - Lock files for active sessions
- `*.reset.*` - Reset session backups
- `*.deleted.*` - Deleted session markers
- `*.checkpoint.*` - Checkpoint files

## Current Storage Usage

As of cleanup (2026-04-08):
- **Sessions removed:** 169 (> 7 days old)
- **Remaining sessions:** 145
- < 1 day old (active): 24
- 1-7 days old (review): 72

## Cron Configuration

**Note:** This system uses systemd timers instead of cron.

### Systemd Timer (Active ✅)
```bash
# Files created:
~/.config/systemd/user/session-cleanup.service
~/.config/systemd/user/session-cleanup.timer

# Status check:
systemctl --user list-timers --all | grep session

# Manual trigger:
systemctl --user start session-cleanup.service
```

### Cron (if preferred)
```bash
# Clean up sessions older than 7 days, daily at 3 AM
0 3 * * * /home/andlersrv/.openclaw/workspace/scripts/system/cleanup-sessions.sh 7 >> /var/log/session-cleanup.log 2>&1
```

## Related Documentation

- OpenClaw Agent Documentation
- Session Management in agent/README.md
