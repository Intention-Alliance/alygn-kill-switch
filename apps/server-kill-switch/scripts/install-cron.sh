#!/usr/bin/env bash
# scripts/install-cron.sh — Register the 120-day audit archive cron (03:00 CST)
#
# Card 0e2f9fec / spec §10 / acceptance #12.
#
# This is idempotent: it only adds the line if it's not already present.
# Run as:  bash scripts/install-cron.sh
#
# To uninstall:  bash scripts/install-cron.sh --uninstall
# To preview:    bash scripts/install-cron.sh --dry-run

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# scripts/ lives at apps/server-kill-switch/scripts inside the worktree.
# Go up THREE levels to reach the worktree root, then add apps/server-kill-switch/scripts/archive-audit.ts.
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
ARCHIVE_SCRIPT="$REPO_ROOT/apps/server-kill-switch/scripts/archive-audit.ts"
# The data dir (sqlite db lives here, also where archive JSONLs go)
DATA_DIR="$REPO_ROOT/apps/server-kill-switch/data"

# Verify the script exists
if [ ! -f "$ARCHIVE_SCRIPT" ]; then
  echo "ERROR: $ARCHIVE_SCRIPT not found"
  exit 1
fi

# Cron line: 03:00 CST daily, run the archive with retention=120 days
# NOTE: cron uses the system's local time. We assume the system is set to
# America/Costa_Rica (CST, UTC-6). On systems where TZ is UTC, schedule for
# 09:00 UTC to land at 03:00 CST.
CRON_LINE="0 3 * * * cd $REPO_ROOT && DATA_DIR=$DATA_DIR bun run $ARCHIVE_SCRIPT --days 120 >> $DATA_DIR/archive-audit.log 2>&1"
CRON_TAG="# webhook-api-keys-archive (Card 0e2f9fec)"

MODE="${1:-install}"
case "$MODE" in
  --uninstall|uninstall|remove)
    echo "Uninstalling cron entry..."
    crontab -l 2>/dev/null | grep -v -F "$CRON_TAG" | grep -v -F "archive-audit.ts" | crontab -
    echo "Done."
    exit 0
    ;;
  --dry-run|dry-run)
    echo "DRY RUN — would add to crontab:"
    echo ""
    echo "$CRON_TAG"
    echo "$CRON_LINE"
    exit 0
    ;;
  install|--install|"")
    # Read existing crontab (if any)
    EXISTING=$(crontab -l 2>/dev/null || true)

    # Skip if already installed
    if echo "$EXISTING" | grep -q -F "$CRON_TAG"; then
      echo "Cron entry already installed (tag: $CRON_TAG). Nothing to do."
      echo ""
      echo "Current matching entries:"
      echo "$EXISTING" | grep -F "$CRON_TAG" || true
      exit 0
    fi

    # Append the new line
    {
      echo "$EXISTING"
      echo ""
      echo "$CRON_TAG"
      echo "$CRON_LINE"
    } | grep -v '^$' | crontab -

    echo "Installed cron entry:"
    echo ""
    echo "$CRON_TAG"
    echo "$CRON_LINE"
    echo ""
    echo "To verify:   crontab -l | grep archive-audit"
    echo "To uninstall: bash scripts/install-cron.sh --uninstall"
    exit 0
    ;;
  --help|-h|help)
    echo "Usage: bash scripts/install-cron.sh [--uninstall | --dry-run]"
    exit 0
    ;;
  *)
    echo "Unknown option: $MODE"
    echo "Usage: bash scripts/install-cron.sh [--uninstall | --dry-run]"
    exit 1
    ;;
esac
