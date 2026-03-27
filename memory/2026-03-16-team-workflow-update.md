# Team Workflow Update - 2026-03-16

## Changes Implemented

### 1. AGENTS.md Updated

**Added Code Review Pipeline section:**
- Two-stage review: Chanshuk (Dev Lead) → Nikaya (Reviewer)
- Clear handoffs and responsibilities
- Max 3 review cycles
- Fast feedback loop (15-30 min for Stage 1, 30-45 min for Stage 2)

**Key Rules:**
- Never skip Chanshuk (even for "small" changes)
- Clear handoffs through Wobblus (no direct agent-to-agent)
- Fast feedback loop
- Documentation requirements

### 2. Individual Agent Identity Files Created

**Gimglich_IDENTITY.md (FE Coder):**
- Role: Implementation engine
- Reports to: Wobblus, Chanshuk (for coordination)
- Workflow: Receive task → Implement → Mark "Ready for Review" → Wait for pipeline
- Standards: TypeScript strict, no `any`, proper disposal, conventional commits

**Chanshuk_IDENTITY.md (Dev Lead):**
- Role: Code quality gatekeeper (Stage 1)
- Reports to: Wobblus
- Responsibilities: Code quality review, functionality verification, integration check
- Duration: 15-30 minutes
- Output: Pass/Fail with specific feedback

**Nikaya_IDENTITY.md (Reviewer):**
- Role: Full quality gatekeeper (Stage 2)
- Reports to: Wobblus
- Responsibilities: UI/UX testing, standards compliance, security, performance
- Duration: 30-45 minutes
- Output: Score /100, Pass/Fail (85+ required)

### 3. Lobster Pipeline Created

**File:** `pipelines/agent-deployment.json`

**Pipeline Flow:**
1. Check active agents
2. Verify git state
3. Spawn coder (Gimglich)
4. Wait for completion
5. Acknowledge completion
6. Spawn Chanshuk (Stage 1 review)
7. Wait for completion
8. Check result:
   - Pass → Spawn Nikaya (Stage 2)
   - Fail → Route back to coder (max 3 cycles)
9. Spawn Nikaya (Stage 2 review)
10. Wait for completion
11. Check result:
    - Pass (85+) → Task complete
    - Fail → Route back to coder (max 3 cycles)
12. Notify completion or escalation

**Features:**
- Automatic polling for agent completion
- Conditional branching (pass/fail)
- Loop back for fixes (max 3 iterations)
- Escalation on max cycles reached
- Configurable timeouts and retries

## How It Works

### Before (Broken):
```
Gimglich completes task
        ↓
[Silence...]
        ↓
Gimglich asks user: "What next?"
        ↓
[FAILURE]
```

### After (Fixed):
```
Gimglich completes task
        ↓
Wobblus acknowledges + spawns Chanshuk
        ↓
Chanshuk reviews (15-30 min) → Reports Pass/Fail
        ↓
Wobblus routes: Pass → Nikaya, Fail → Gimglich
        ↓
Nikaya reviews (30-45 min) → Score /100
        ↓
Wobblus routes: Pass (85+) → Complete, Fail → Gimglich
        ↓
Task complete or escalate after 3 cycles
```

## Usage

### Manual (Current):
```javascript
// After Gimglich completes task
sessions_spawn({
  agentId: "dev-lead",
  label: "dev-lead:chanshuk-quality-review-task1",
  task: "WORKING DIRECTORY: [path]\n\nReview Gimglich's Task 1...",
  mode: "run",
  runTimeoutSeconds: 1800
})

// After Chanshuk passes
sessions_spawn({
  agentId: "reviewer",
  label: "reviewer:nikaya-full-review-task1",
  task: "WORKING DIRECTORY: [path]\n\nFull review of Task 1...",
  mode: "run",
  runTimeoutSeconds: 2700
})
```

### Lobster Pipeline (Future):
```bash
lobster run pipelines/agent-deployment.json --args '{"task_number": 1}'
```

## Success Metrics

- **Coder asks user for next steps:** 0 (should never happen)
- **First-pass review rate:** Target 70%+
- **Review turnaround:** Stage 1 <30 min, Stage 2 <45 min
- **Max cycles per task:** 3 (then escalate)

## Next Steps

1. ✅ AGENTS.md updated with pipeline
2. ✅ Individual agent identities created
3. ✅ Lobster pipeline configured
4. ⏳ Test pipeline with next task
5. ⏳ Iterate based on results

## Files Created/Modified

- `AGENTS.md` - Added Code Review Pipeline section
- `agents/Gimglich_IDENTITY.md` - FE Coder identity
- `agents/Chanshuk_IDENTITY.md` - Dev Lead identity
- `agents/Nikaya_IDENTITY.md` - Reviewer identity
- `pipelines/agent-deployment.json` - Lobster pipeline
- `memory/2026-03-16-agent-coordination.md` - Lesson learned

---

**The team now has clear roles, a defined pipeline, and automated coordination. No more agents asking the user for next steps.**
