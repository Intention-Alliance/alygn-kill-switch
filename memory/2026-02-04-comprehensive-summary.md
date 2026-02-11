# 2026-02-04 - Masterbots Comprehensive Analysis Summary

## 🎯 Executive Summary

**Mode:** Analysis only (read-only repository)  
**Duration:** ~2 hours  
**Issues Analyzed:** 4 (#604, #578, #555, #389) + PR #600 phases

---

## ✅ Completed Analysis

### Issue #604 (P0) - RAG Blocks Not Returning
- **Status:** ✅ Complete + GitHub comment posted
- **Root causes:** Token budget double enforcement (600→1500), cosine threshold too strict (0.7), silent failures
- **Fixes recommended:** Pass tokenBudget to retrieval, lower minCosine to 0.6, add debug logging
- **Maps to phases:** 2 (RAG hardening), 4 (tests)

### Issue #578 (P0) - Workspace Bugs Master Plan
- **Status:** ✅ Complete
- **8 bugs mapped:**
  1. Initial doc not updating (10/10) → Phase 1 (TanStack Query)
  2. Tab switching corruption (9/10) → Phase 1 + 3
  3. Mobile idle ~15% (9/10) → Phase 6 (SSE hardening)
  4. H3+ operations break (9/10) → Phase 2 (section engine)
  5. Save not wired (8/10) → Phase 4 (versioning)
  6. History requires reload (6/10) → Phase 4 (query invalidation)
  7. Mobile workspace nav missing (4/10) → Phase 5
  8. Mobile pages nav outdated (4/10) → Phase 5

- **Root cause:** `useRef` state shadows + section replacement doesn't handle nested children

### Issue #555 (P1) - Performance & Edge Cases
- **Status:** ✅ Complete
- **5 performance concerns identified:**
  1. Markdown parsing every update → Phase 2 (memoization)
  2. AI streaming re-renders → Phase 2 + 6 (throttling verification needed)
  3. Multiple debounced saves → Phase 1 (query coordination)
  4. Selection tracking complexity → Phase 3 (cleanup)
  5. Base64 attachments no cache → Add caching

- **6 edge cases documented:**
  1. Concurrent editing → No conflict resolution
  2. Streaming interruption → No recovery
  3. Large documents → No size limits (add 10MB soft, 50MB hard)
  4. Selection validation → No bounds checking
  5. Template failures → No fallbacks
  6. Storage failures → No quota monitoring

### Issue #389 (P2) - ClickableText Audit
- **Status:** ⏳ Preliminary (low priority)
- **Finding:** 3 duplicate implementations
- **Maps to:** Phase 3 (UI component extraction)
- **Next:** Detailed diff analysis when prioritized

---

## 📊 PR #600 Development Plan Mapping

### Critical Path
```
Phase 0 (Schema)
  ↓
Phase 1 (TanStack Query) ← **BOTTLENECK** - unblocks all work
  ↓
├─→ Phase 2 (RAG + Sections)  → #604, #578(bug4), #555
├─→ Phase 3 (UI/Hooks)  → #578(bug2,7), #389, #555
├─→ Phase 4 (Tests + Save)  → #578(bug5,6), #604, #555
├─→ Phase 5 (Mobile Nav)  → #578(bug7,8)
└─→ Phase 6 (SSE + Mobile)  → #578(bug3), #555
```

### Phase Breakdown

**Phase 0: Schema/Metadata (P0)** - Infrastructure
- Fix NULL-safe comparisons
- Correct Drizzle operator classes
- Validate Hasura permissions
- **No GitHub issues** - foundational work

**Phase 1: TanStack Query + Types (P0)** - **KEY PHASE**
- **Unblocks:** All other phases
- **Fixes:** Issue #578 bugs #1, #2 (state memoizing)
- Replaces `useRef` shadows with Query cache
- Centralizes types (`ScopeType`, `ActionType`, etc.)
- Single source of truth for server state

**Phase 2: RAG + Section Engine (P1)**
- **Fixes:** Issue #604, #578 bug #4, #555 concerns #1-#2
- Consolidate embedding with guards (timeout, retry)
- Fix token budget + cosine threshold
- Section engine hardening (H3+ stability)

**Phase 3: UI/Hooks Cleanup (P1)**
- **Fixes:** Issue #578 bug #2, #7, #389, #555 concern #4
- Extract PromptEnhancer to shared
- ClickableText consolidation
- Tab switch invariants
- Selection management cleanup

**Phase 4: Tests + Versioning (P2)**
- **Fixes:** Issue #578 bugs #5, #6
- Wire save to CTA + toggle-off
- Instant version updates (React Query invalidation)
- Edge-case tests (RAG, selection, token budgets)
- Docstring coverage ≥80%

**Phase 5: Mobile Navigation (P2)**
- **Fixes:** Issue #578 bugs #7, #8
- Mobile header/breadcrumb UX
- Route parity with base app

**Phase 6: SSE + Mobile Idle (P1)**
- **Fixes:** Issue #578 bug #3, #555 concern #2
- Optimistic message lifecycle
- SSE hardening (heartbeat, timeout, retry)
- Target: ≤2% idle (from ~15%)

---

## 🔗 Issue Coverage Matrix

| Issue | Priority | Phases | Status | Deliverable |
|-------|----------|--------|--------|-------------|
| #604 (RAG) | P0 | 2, 4 | ✅ Complete | GitHub comment posted |
| #578 (Workspace) | P0 | 1-6 | ✅ Complete | Ready for comment |
| #555 (Performance) | P1 | 1, 2, 3, 4, 6 | ✅ Complete | Ready for comment |
| #389 (ClickableText) | P2 | 3 | ⏳ Preliminary | Low priority |

---

## 🎯 Recommended Work Order

### Sprint 1 (Weeks 1-3)
1. **Phase 0** - Schema/metadata (1 week)
2. **Phase 1** - TanStack Query (2 weeks) ← **CRITICAL**

### Sprint 2 (Weeks 4-6)
3. **Phase 2** - RAG + Sections (2 weeks)
   - Fixes Issue #604 (P0)
   - Fixes Issue #578 bug #4 (9/10 severity)

### Sprint 3 (Weeks 7-9)
4. **Phase 3** - UI/Hooks (1.5 weeks) ← Can parallel with Phase 6
5. **Phase 6** - SSE + Mobile (1.5 weeks) ← Start mid-sprint

### Sprint 4 (Weeks 10-12)
6. **Phase 4** - Tests + Save (1 week) ← Can parallel with Phase 5
7. **Phase 5** - Mobile nav (1 week)

**Total Estimate:** 12 weeks (3 months)

---

## 📝 Files Analyzed

### RAG System (#604)
- `apps/pro-web/app/actions/chat-memory/retrieve-assistant-answer-memories.ts`
- `apps/pro-web/app/actions/chat-memory/ingest-assistant-answer.ts`
- `apps/pro-web/lib/chat/chat-context-utils.ts`
- `apps/pro-web/lib/simple-rag/prompt.ts`

### Workspace System (#578, #555)
- `apps/pro-web/lib/hooks/use-workspace.tsx`
- `apps/pro-web/lib/hooks/use-workspace-content-hook.ts`
- `apps/pro-web/lib/hooks/use-workspace-chat.tsx`
- `apps/pro-web/lib/markdown-utils.ts`
- `apps/pro-web/components/routes/workspace/*`

### Chat System (#578 bug #3, #555)
- `apps/web/lib/hooks/use-mb-chat.tsx`
- `apps/pro-web/lib/hooks/use-mb-chat.tsx`

### ClickableText (#389)
- `apps/web/lib/chat-clickable-text.tsx`
- `apps/pro-web/lib/chat-clickable-text.tsx`
- `apps/web/components/chat/chat-clickable-text.tsx`

---

## 📄 Deliverables Created

1. ✅ `/tmp/masterbots-analysis.md` (10KB) - Issue #604 deep-dive
2. ✅ `/tmp/masterbots-comprehensive-analysis.md` (31KB) - All issues + phases
3. ✅ GitHub comment on #604 with root cause + fixes
4. ⏳ Ready to create comments for #578, #555, #389

---

## 🚧 Analysis-Only Tasks Remaining

**Low Priority (Future Work):**
1. Verify 50ms throttling implementation in `use-workspace-chat.tsx`
2. Audit `WorkspaceTextEditor` event listener cleanup patterns
3. Detailed diff between web/pro-web `chat-clickable-text.tsx`
4. Review `public.message <-> public.message` self-reference usage

---

## 💡 Key Insights

1. **Phase 1 is the bottleneck** - TanStack Query replaces `useRef` shadows and unblocks all other work
2. **State memoizing issues** are the root cause of 3 out of 8 workspace bugs (#1, #2, #6)
3. **H3+ section breakage** stems from algorithm only handling first loop - needs full traversal
4. **Mobile idle** improved from ~90% to ~15% but needs SSE hardening to reach ≤2%
5. **RAG blocks not returning** is purely a configuration issue (token budget + cosine threshold)
6. **Performance concerns** are addressable with standard optimizations (memoization, caching, debouncing)

---

## 🔒 Security Context

**Project:** Alygn / Bitcash  
**NDA:** Active (signed Aug 19, 2025)  
**Tone:** Professional (no quirky gnome personality for this project)  
**Context isolation:** Strict - never mention other Andler projects

---

## ⏭️ Next Steps

**Awaiting user confirmation:**
1. Create GitHub comments for #578, #555, #389?
2. Proceed with remaining low-priority analysis tasks?
3. Any specific deep-dives requested?

**Repository state:** Read-only (`.git` set to read-only via `chmod`)

---

*Analysis completed: 2026-02-04 17:50 CST*  
*Session duration: ~2 hours*  
*Mode: Analysis only - no code changes*
