# PATH_VERIFICATION.md — alygn-outreach Skill Path Consistency

**Generated:** 2026-03-27 17:45 CST
**Task:** Verify Skill Path Consistency between lobster workflow references and filesystem layout

---

## 1. Filesystem Reality

| Path | Exists | Inode | Is Symlink |
|---|---|---|---|
| `$HOME/.agents/skills/alygn-outreach` | ✅ Yes | 3485739 | No |
| `$HOME/.openclaw/workspace/skills/alygn-outreach` | ✅ Yes | 3362246 | No |

**These are two completely separate directories** — different inodes, not symlinked, not hardlinked.

### Key Differences Between the Two

| Item | `.agents/skills/alygn-outreach` | `.openclaw/workspace/skills/alygn-outreach` |
|---|---|---|
| `docs/DEPLOYMENT.md` | Mar 27 16:35 (older) | Mar 27 17:21 (newer — 46 min ahead) |
| `data/` | ✅ Exists (dry-run/, sent-emails.json, state/, supabase/) | ✅ Exists (same contents) |
| `.git/` | ❌ No | ❌ No |
| `reports/` | ❌ No | ❌ No |

The **only meaningful difference** detected: `docs/DEPLOYMENT.md` in the workspace is newer. All other files appear synchronized.

---

## 2. Lobster File References

All lobster files consistently reference:

```
$HOME/.agents/skills/alygn-outreach
```

Files referencing this path:
- `alygn-muni-outreach.lobster`
- `alygn-muni-outreach-wave.lobster`
- `alygn-vc-outreach.lobster`
- `alygn-vc-outreach-wave.lobster`

**No lobster file references the workspace path** (`$HOME/.openclaw/workspace/skills/alygn-outreach`).

---

## 3. Production vs Development Determination

| Role | Path |
|---|---|
| **Production (referenced by workflows)** | `$HOME/.agents/skills/alygn-outreach` |
| **Development (active work/updates)** | `$HOME/.openclaw/workspace/skills/alygn-outreach` |

**Problem:** The development directory (`workspace/skills/`) has the newer `DEPLOYMENT.md` (17:21 vs 16:35), meaning documentation updates are happening in the workspace but the lobster workflows execute code in `.agents/skills/`. These two directories are **not synchronized**.

---

## 4. State & Persistence Locations

| Directory | Location | Purpose |
|---|---|---|
| `data/state/` | Both dirs (identical, empty) | Pipeline state |
| `data/dry-run/` | Both dirs (identical) | Dry-run output logs |
| `data/sent-emails.json` | Both dirs (identical, 4493 bytes) | Sent email records |
| `data/supabase/` | Both dirs (identical) | Supabase config |
| `reports/` | Neither — does not exist | — |

State appears to be **duplicated across both paths** but not actively synchronized. The `data/` subdirectories are identical between both locations.

---

## 5. Recommendations

### Option A — Adopt Workspace as Single Source of Truth (Recommended)

1. **Make `$HOME/.openclaw/workspace/skills/alygn-outreach` the canonical path**
2. **Update all lobster files** to reference it instead of `.agents/skills/alygn-outreach`
3. **Create a deploy step** in the workflow or aMakefile that copies/syncs to `.agents/skills/` if needed for execution
4. Or: **replace** `.agents/skills/alygn-outreach` with a symlink to the workspace dir

### Option B — Adopt `.agents/skills/` as Production, Keep Workspace as Git-less Dev Copy

1. **Keep lobster files pointing to `.agents/skills/`** (no change needed)
2. **Establish a sync mechanism** from workspace → `.agents/skills/` for production pushes
3. **Consider adding git to the skill** for proper version control
4. **Document the two-path model** so it's clear which is which

### Option C — Merge into One Path

1. **Delete one copy** and symlink/repoint the other
2. `rm -rf $HOME/.agents/skills/alygn-outreach && ln -s $HOME/.openclaw/workspace/skills/alygn-outreach $HOME/.agents/skills/alygn-outreach`

---

## 6. Immediate Action Items

1. **Choose a canonical path** — currently ambiguous
2. **Update lobster paths** if switching to workspace path (see command below)
3. **Add `.git/`** to the skill for version control
4. **Decide on sync strategy** — rsync, hardlink, or Makefile deploy step

### Command to Update All Lobster References (if adopting workspace path)

```bash
sed -i 's|\$HOME/\.agents/skills/alygn-outreach|$HOME/.openclaw/workspace/skills/alygn-outreach|g' \
  ~/.openclaw/workspace/.lobster/alygn-muni-outreach.lobster \
  ~/.openclaw/workspace/.lobster/alygn-muni-outreach-wave.lobster \
  ~/.openclaw/workspace/.lobster/alygn-vc-outreach.lobster \
  ~/.openclaw/workspace/.lobster/alygn-vc-outreach-wave.lobster
```

---

## 7. Summary

- **Lobster files → `$HOME/.agents/skills/alygn-outreach`** (production path, as deployed)
- **Active development → `$HOME/.openclaw/workspace/skills/alygn-outreach`** (has newer docs)
- **Both have identical `data/`** — state persistence works but is duplicated
- **No git** in either location — code is not version-controlled
- **Root cause:** Development happens in workspace, but workflows execute from `.agents/skills/`, and nothing syncs them
