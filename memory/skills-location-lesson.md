# Skills Location - Critical Lesson (2026-03-13)

## ⚠️ IMPORTANT: Skills Are NOT in node_modules

**Correct Location:**
```
~/.openclaw/skills/           # Symlinked skills directory
└── [skill-name] -> /home/andler/.openclaw/workspace/skills/[skill-name]
```

**NOT in:**
```
~/.local/share/mise/installs/node/24.11.1/lib/node_modules/openclaw/skills/  # ❌ WRONG
```

## How to Find Skills

### Method 1: Check ~/.openclaw/skills/
```bash
ls -la ~/.openclaw/skills/
# Shows all skills with symlinks to workspace
```

### Method 2: Use openclaw skills list
```bash
openclaw skills list
# Lists all available skills with status
```

### Method 3: Check workspace skills directory
```bash
ls -la ~/.openclaw/workspace/skills/
# Shows actual skill directories
```

## Skills Structure

**Workspace skills** are symlinked from `~/.openclaw/skills/`:
```
~/.openclaw/skills/threejs-animation -> ~/.openclaw/workspace/skills/threejs-animation
~/.openclaw/skills/threejs-fundamentals -> ~/.openclaw/workspace/skills/threejs-fundamentals
~/.openclaw/skills/threejs-interaction -> ~/.openclaw/workspace/skills/threejs-interaction
~/.openclaw/skills/frontend-design -> ~/.openclaw/workspace/skills/frontend-design
~/.openclaw/skills/coding-agent -> ~/.local/share/mise/installs/node/24.11.1/lib/node_modules/openclaw/skills/coding-agent (bundled)
```

**Bundled skills** (from OpenClaw installation) live in node_modules:
- coding-agent
- github
- weather
- notion
- etc.

**Custom skills** (user-created) live in workspace:
- threejs-*
- frontend-design
- beautiful-prose
- algorithmic-art
- etc.

## Workflow Instruction

**When looking for skills:**
1. First check: `~/.openclaw/skills/` (symlinked directory)
2. Use: `openclaw skills list` (shows all available)
3. Don't assume: node_modules path (only bundled skills there)

**When spawning agents:**
- Reference skills by name (e.g., "threejs-animation")
- Agents automatically have access to workspace skills
- Skills are loaded from `~/.openclaw/workspace/skills/` via symlinks

## Lesson Learned

**Date:** 2026-03-13 18:08 CST  
**Context:** Three.js fix for landing page (nodes frozen, Transition error)  
**Mistake:** Looked in node_modules for Three.js skills  
**Correction:** Skills are in `~/.openclaw/` root (symlinked to workspace)

**Save this instruction:** Always check `~/.openclaw/skills/` first, not node_modules.

---

_Updated: 2026-03-13 18:08 CST_
