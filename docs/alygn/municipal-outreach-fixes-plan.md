# Municipal Outreach Fixes — Wave 4 (2026-04-24)

**Date:** 2026-04-24  
**Priority:** P0-Critical  
**Impact:** 5 municipalities awaiting send, quality issues blocking approval

---

## Issues Identified

### 1. Pain Points in English (CRITICAL)
**Problem:** Email body is Spanish, but pain points listed in English
- Example: "Airport expansion coordination", "Retiree community services"
- Root cause: `MunicipalPersonalizationStrategy.ts` passes painPoints directly from Supabase without translation

**Fix Required:**
- Add Spanish translation step in personalization pipeline
- Options:
  - A: Translate at research phase (store Spanish painPoints in Supabase)
  - B: Translate at personalization phase (on-the-fly translation via Grok/LLM)
  - C: Hybrid (translate during research, fallback to on-the-fly if missing)

**Recommendation:** Option C — translate during research, cache in Supabase, fallback to on-the-fly

---

### 2. Email Typo in BCC (CRITICAL)
**Problem:** `outreach@alyygn.com` should be `outreach@alygn.com`
**Files affected:**
- `~/.agents/skills/alygn-outreach/src/lib/email/outreach-email-template.ts` (line ~100)
- `~/.openclaw/workspace/skills/alygn-outreach/src/lib/email/outreach-email-template.ts`
- `~/.agents/skills/alygn-outreach/src/lib/email/providers/SmartleadProvider.ts`
- `~/.agents/skills/alygn-outreach/src/strategies/sending/ContactFallbackStrategy.ts`
- `~/.openclaw/workspace/skills/alygn-outreach/src/lib/email/providers/SmartleadProvider.ts`
- `~/.openclaw/workspace/skills/alygn-outreach/src/strategies/sending/ContactFallbackStrategy.ts`

**Fix:** Replace all instances of `outreach@alyygn.com` with `outreach@alygn.com`

---

### 3. Generic Greetings (HIGH)
**Problem:** Using "Estimado/a Alcalde/sa" instead of actual mayor names
**Root cause:** `MunicipalPersonalizationStrategy.ts` doesn't check Supabase for mayor_name field

**Fix Required:**
- Query Supabase `municipalities.mayor_name` field
- Use actual name if available: "Estimado [Mayor Name], Alcalde de [Cantón]"
- Fallback to generic if not available

**Data available:** Alajuela has `Roberto Hernán Thompson Chacón` in Supabase

---

### 4. Draft Status Not Updated (MEDIUM)
**Problem:** `draftStatus` field remains "Not drafted" after personalization
**Root cause:** Strategy updates `status` to 'personalized' but doesn't update `draftStatus`

**Fix:** Add `draftStatus: "Personalized"` to entity update in `personalize()` method

---

## Files to Update

### `.agents/skills/alygn-outreach/`
1. `src/lib/email/outreach-email-template.ts` — Fix email typo
2. `src/strategies/personalization/MunicipalPersonalizationStrategy.ts` — Add mayor name lookup, draftStatus update
3. `src/strategies/research/MunicipalResearchStrategy.ts` — Add painPoints translation to Spanish
4. `src/lib/email/providers/SmartleadProvider.ts` — Fix email typo
5. `src/strategies/sending/ContactFallbackStrategy.ts` — Fix email typo

### `~/.openclaw/workspace/skills/alygn-outreach/`
Same files as above (workspace copy)

---

## Pipeline Flow Fix

**Current:**
```
Research (English painPoints) → Personalize (passes English) → Email (Spanish + English mix)
```

**Fixed:**
```
Research (English painPoints) → Translate to Spanish → Cache in Supabase → Personalize (uses Spanish) → Email (100% Spanish)
```

---

## Testing Checklist

- [ ] Pain points translated to Spanish in all 5 drafts
- [ ] BCC email corrected to `outreach@alygn.com`
- [ ] Alajuela greeting uses "Roberto Hernán Thompson Chacón"
- [ ] `draftStatus` updated to "Personalized" after personalization
- [ ] Dry-run test passes for all 5 municipalities
- [ ] Both `.agents/skills` and `~/.openclaw/workspace/skills` updated identically

---

## Execution Plan

### Phase 1: Fix Email Typo (15 min)
- Update all 6 files with correct email
- Test: grep confirms no `alyygn.com` remaining

### Phase 2: Add Mayor Name Lookup (30 min)
- Update `MunicipalPersonalizationStrategy.ts` to query `mayor_name`
- Test: Alajuela shows actual mayor name

### Phase 3: Add Pain Points Translation (45 min)
- Update `MunicipalResearchStrategy.ts` to translate painPoints
- Update `MunicipalPersonalizationStrategy.ts` to use Spanish painPoints
- Test: All 5 drafts have Spanish pain points

### Phase 4: Fix Draft Status (10 min)
- Add `draftStatus: "Personalized"` to personalization update
- Test: Wave file shows correct status

### Phase 5: Re-run Personalization (30 min)
- Re-run personalize phase for Wave 4
- Verify all fixes applied
- Submit for approval

---

**Total ETA:** 2-3 hours  
**Blocker:** None — can proceed immediately
