# Agent Coordination Lesson - 2026-03-16

## Problem Identified

Gimglich had to ask Andler directly for next steps because Wobblus didn't provide continuous coordination. The workflow broke down:

1. Gimglich completed Task 1 (commit `0fa62a7`)
2. Nikaya reviewed and gave feedback (score 55/100, FAIL)
3. Gimglich fixed issues but they sat uncommitted for 26+ minutes
4. Gimglich asked Andler "what should I do next?"
5. **FAILURE:** Wobblus should have provided next steps immediately

## Root Cause

- Wobblus was spawning check-in tasks instead of providing continuous reaction
- No explicit "next steps" given after task completion
- Agents left idle waiting for direction

## Solution Implemented

Updated AGENTS.md with **Agent Reaction Workflow**:

### Key Rules:
1. **Acknowledge Every Completion** - Respond immediately, don't leave hanging
2. **Provide Next Steps Explicitly** - Be specific: task name, scope, ETA
3. **If Agent Asks for Next Steps** - This is a FAILURE of coordination
4. **Spawn Follow-ups When Needed** - Never leave an agent idle
5. **Track Active Agents** - Check git, ping silent agents

### Workflow:
```
Agent Completes Task
        ↓
Reports to Wobblus (completion event)
        ↓
Wobblus ACKNOWLEDGES + Provides Next Steps
        ↓
Agent Continues (or asks clarifying questions)
        ↓
Repeat
```

## Updated IDENTITY.md

Added correct team check protocol:
1. Check `subagents list` first
2. If active sessions → use `sessions_send`
3. If no active sessions → check git/files for evidence
4. If no evidence → spawn check-in task

## Prevention

- Use `mode: "session"` with `thread: true` for ongoing work
- Check git status regularly for uncommitted work
- Provide immediate reaction to every completion
- Never make an agent ask the user for next steps
