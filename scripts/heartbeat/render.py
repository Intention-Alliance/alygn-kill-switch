#!/usr/bin/env python3
"""heartbeat/render.py — Render the dynamic section of HEARTBEAT.md from live state.

The HEARTBEAT.md file is split into two parts:

1. **Static protocol section** (top, manual): the tick protocol, channel
   routing, communication discipline, anti-patterns. This is human-edited
   and git-tracked. It's the operating manual for any agent picking up
   the heartbeat.

2. **Dynamic active-work section** (between markers, auto-rendered):
   current branches, workboard cards, active subagents, today's cost.
   This script regenerates it from live state on every run.

Markers:
  <!-- DYNAMIC_SECTION_START -->
  <!-- DYNAMIC_SECTION_END -->

The static section is preserved as-is. The dynamic section is replaced.
If markers are not present, the section is appended.

Usage:
  python3 scripts/heartbeat/render.py [--dry-run]

The script is intentionally minimal. It does not fail on missing state —
if a CLI command errors, that section is skipped silently. This makes
the heartbeat renderer robust to partial state (e.g. openclaw CLI not
installed, no workboard cards, no ledgers).

Replaces the 2026-07-20 task-hardcoded HEARTBEAT (which enumerated 3
specific workstreams) with a data-driven renderer.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

WORKSPACE = Path("/home/andlersrv/.openclaw/workspace")
HEARTBEAT = WORKSPACE / "HEARTBEAT.md"
START_MARKER = "<!-- DYNAMIC_SECTION_START -->"
END_MARKER = "<!-- DYNAMIC_SECTION_END -->"


def run(cmd: list[str], cwd: Path = WORKSPACE) -> str:
    """Run a command, return stdout. Empty string on error."""
    try:
        result = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=10)
        return result.stdout if result.returncode == 0 else ""
    except Exception:
        return ""


def git_info() -> tuple[str, list[str]]:
    """Return (current_branch, non_merged_branches)."""
    branch = run(["git", "rev-parse", "--abbrev-ref", "HEAD"]).strip()
    if not branch:
        branch = "(unknown)"
    out = run(["git", "branch", "--no-merged", "master", "--format", "%(refname:short)"])
    non_merged = [b.strip() for b in out.splitlines() if b.strip() and b.strip() != branch]
    return branch, non_merged


def workboard_cards() -> tuple[list[dict], list[dict], list[dict]]:
    """Return (ready, blocked, in_progress) cards from the workboard."""
    def fetch(status: str) -> list[dict]:
        out = run(["openclaw", "workboard", "list", "--json", "--status", status])
        if not out:
            return []
        try:
            data = json.loads(out)
            if isinstance(data, list):
                return data
            return data.get("cards", data.get("items", []))
        except Exception:
            return []

    return fetch("ready"), fetch("blocked"), fetch("in_progress")


def active_subagents() -> list[dict]:
    """Return active subagents (last 15 min)."""
    out = run(["openclaw", "subagents", "list", "--json", "--recent-minutes", "15"])
    if not out:
        return []
    try:
        data = json.loads(out)
        if isinstance(data, list):
            return data
        return data.get("subagents", data.get("items", []))
    except Exception:
        return []


def today_cost() -> float:
    """Sum today's cost across all ledger.jsonl files in .staging/."""
    total = 0.0
    staging = WORKSPACE / ".staging"
    if not staging.exists():
        return total
    today_prefix = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    for ledger in staging.rglob("ledger.jsonl"):
        try:
            for line in ledger.read_text().splitlines():
                if not line.strip():
                    continue
                row = json.loads(line)
                cost = row.get("cost_usd", 0)
                ts = row.get("ts", "")
                if isinstance(cost, (int, float)) and ts.startswith(today_prefix):
                    total += float(cost)
        except Exception:
            continue
    return total


def render() -> str:
    """Render the dynamic section as a markdown block."""
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    branch, non_merged = git_info()
    ready, blocked, in_progress = workboard_cards()
    active = active_subagents()
    cost = today_cost()

    lines: list[str] = []
    lines.append(f"_Auto-rendered at {now} on `{branch}`._")
    lines.append("")

    if non_merged:
        lines.append(f"### Active branches ({len(non_merged)} not merged into master)")
        for b in non_merged[:10]:
            lines.append(f"- `{b}`")
        lines.append("")
    else:
        lines.append("_No active branches (all merged into master)._")
        lines.append("")

    if ready or blocked or in_progress:
        lines.append("### Workboard")
        for status, cards in (("ready", ready), ("in_progress", in_progress), ("blocked", blocked)):
            if cards:
                lines.append(f"- **{status}** ({len(cards)})")
                for c in cards[:5]:
                    title = c.get("title", "(no title)")
                    card_id = c.get("id", "?")[:8]
                    lines.append(f"  - `{card_id}` {title}")
        lines.append("")
    else:
        lines.append("_Workboard: no ready / in-progress / blocked cards._")
        lines.append("")

    if active:
        lines.append(f"### Active subagents ({len(active)})")
        for sa in active[:5]:
            label = sa.get("label") or sa.get("taskName") or "(no label)"
            session_key = sa.get("sessionKey", "?")
            lines.append(f"- `{session_key}` {label}")
        lines.append("")
    else:
        lines.append("_No active subagents._")
        lines.append("")

    lines.append(f"### Today's cost: ${cost:.2f} of $1.00 daily cap")
    lines.append("")
    return "\n".join(lines)


def update_heartbeat(section: str) -> None:
    """Replace the dynamic section in HEARTBEAT.md between markers."""
    content = HEARTBEAT.read_text()
    pattern = re.compile(
        re.escape(START_MARKER) + r".*?" + re.escape(END_MARKER),
        re.DOTALL,
    )
    replacement = f"{START_MARKER}\n\n{section}\n{END_MARKER}"
    if pattern.search(content):
        new = pattern.sub(replacement, content)
    else:
        # No markers: append a new section at the end
        new = (
            content.rstrip()
            + f"\n\n---\n\n## 🔄 Auto-Generated Active Work\n\n{replacement}\n"
        )
    HEARTBEAT.write_text(new)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--dry-run", action="store_true", help="Print section without writing")
    args = parser.parse_args()

    section = render()
    if args.dry_run:
        print(section)
        return 0

    update_heartbeat(section)
    print(f"Updated {HEARTBEAT} ({len(section)} chars in dynamic section)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
