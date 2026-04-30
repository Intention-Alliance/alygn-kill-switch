# ALYGN Outreach — Implementation Plan
## Date: 2026-04-23
## Status: P0-Critical — Full System Fix Required

---

## Phase 0: Architecture Lock (COMPLETED ✅)

**Decision:** Supabase = Municipalities ONLY, Notion = VC ONLY
**Commit:** `66e9d1b` — Reverted `vc_research` Supabase table
**Verification:** ✅ No `vc_research` references in codebase

---

## Phase 1: Municipal Personalization (CRITICAL — Blocks All Outreach)

### Bug 1.1: Hardcoded "Tania" Greeting
**File:** `src/strategies/personalization/MunicipalPersonalizationStrategy.ts:24`
**Current:** `const recipientName = contact?.name || 'Tania';`
**Fix:** `const recipientName = contact?.name || \`Alcalde/sa de ${companyName}\`;`
**Verification:** Check wave-state.json entities have correct greeting after personalization

### Bug 1.2: Placeholder Value Proposition
**File:** `src/strategies/personalization/MunicipalPersonalizationStrategy.ts:103-108`
**Current:** 
```typescript
const population = (entity.typeData?.population as number) || 50000;
const province = (entity.typeData?.province as string) || 'su provincia';
```
**Fix:** Remove fallbacks — throw error if data missing, forcing research first
```typescript
const population = entity.typeData?.population;
const province = entity.typeData?.province;
if (!population || !province) {
  throw new Error(`Missing research data for ${entity.name}. Run research phase first.`);
}
```
**Verification:** Dry-run fails gracefully if research skipped

### Bug 1.3: Generic Contact Names in Research
**File:** `src/strategies/research/MunicipalResearchStrategy.ts`
**Current:** `generateKeyContacts()` returns "Gerente Municipal" / "Director de Tecnología"
**Fix:** Return null/empty array (no fake data). Add browser relay TODO for real extraction.
```typescript
private generateKeyContacts(municipalityName: string): Array<...> {
  // TODO: Browser relay to extract actual alcalde/síndico from municipal website
  return []; // No fake data
}
```
**Verification:** `decisionMakers` and `keyContacts` empty in wave-state (truthful)

### Bug 1.4: Greeting Uses Empty Contacts
**File:** `src/entities/MunicipalEntity.ts`
**Current:** `getPrimaryContact()` returns null if no contacts
**Fix:** Update `MunicipalPersonalizationStrategy` to handle null contact gracefully
```typescript
const contact = municipalEntity.getPrimaryContact();
const recipientName = contact?.name || \`Alcalde/sa de ${companyName}\`;
const recipientTitle = contact?.title || 'Edil';
```
**Verification:** Email greeting says "Estimado/a Alcalde/sa de [Municipality]"

---

## Phase 2: Research Data Persistence (CRITICAL)

### Bug 2.1: typeData Populated but Not Saved
**Evidence:** Wave-state.json shows `typeData.population: 60882` but `decisionMakers: []`
**Root Cause:** Research populates entity in memory, but Pipeline.saveState() doesn't persist typeData
**File:** `src/core/Pipeline.ts:saveState()`
**Fix:** Ensure `toJSON()` includes full `typeData` object
**Verification:** Load wave-state.json after research — verify typeData present

### Bug 2.2: Research Status Set Without Data Validation
**File:** `src/strategies/research/MunicipalResearchStrategy.ts`
**Current:** `entity.updateStatus('researched')` called even with minimal data
**Fix:** Add quality gate before setting status
```typescript
if (!entity.typeData.population || !entity.typeData.province) {
  throw new Error(`Research incomplete for ${entity.name}`);
}
entity.updateStatus('researched');
```
**Verification:** Only fully researched entities get "researched" status

---

## Phase 3: VC Research (CRITICAL)

### Bug 3.1: Always Uses Fallback/Mock Data
**File:** `src/strategies/research/VCResearchStrategy.ts`
**Current:** If no cache file and `USE_DIRECT_API !== 'true'`, returns `fallbackResearch()`
**Fix:** Remove silent fallback — require explicit opt-in for mock data
```typescript
if (process.env.USE_DIRECT_API !== 'true') {
  throw new Error('USE_DIRECT_API=true required for VC research. Set env var or use --deep-research flag.');
}
```
**Verification:** Dry-run with `USE_DIRECT_API=false` fails fast

### Bug 3.2: Cache Files Never Created
**Current:** Research writes request file to `/tmp/`, but no sub-agent processes it
**Fix:** Remove request-file pattern. Only support:
1. `USE_DIRECT_API=true` → Call Perplexity API directly
2. `--deep-research` flag → Spawn sub-agent for manual research
**Verification:** No `/tmp/vc-research-*-request.json` files left behind

---

## Phase 4: Email Logging & Verification (CRITICAL)

### Bug 4.1: sentAt Not Recorded on Send
**Evidence:** Emails sent (Gmail Sent folder shows 16) but `sentAt: null` in wave-state
**File:** `src/strategies/sending/SendingStrategy.ts`
**Fix:** After email API success, immediately:
1. Set `entity.sentAt = new Date().toISOString()`
2. Write to wave-state.json
3. Sync to Supabase `outreach_emails` table
**Verification:** IMAP check confirms email in Sent folder + wave-state has sentAt

### Bug 4.2: IMAP Verification Not Used
**File:** `src/strategies/sending/SendingStrategy.ts` (or new `ReplyTrackingStrategy.ts`)
**Fix:** After send, verify via IMAP before marking success
```typescript
// Post-send verification
const imapVerified = await verifyViaIMAP(entity.email, subject);
if (!imapVerified) {
  entity.batchStatus = 'pending_verification';
} else {
  entity.batchStatus = 'sent_verified';
}
```
**Verification:** Cross-reference wave-state with Gmail Sent folder

---

## Phase 5: Zero-Trust Verification Protocol

### For Every Fix:
1. **Read** the actual source file
2. **Identify** exact line causing bug
3. **Fix** only that line/logic
4. **Test** with dry-run
5. **Verify** output matches expected behavior
6. **Commit** with conventional format
7. **Report** to Discord with evidence

### Verification Checklist:
- [ ] Municipal greeting uses actual municipality name (not "Tania")
- [ ] Municipal value proposition uses real population/province (not placeholders)
- [ ] Research populates typeData before personalization
- [ ] VC research calls real API (not mock data)
- [ ] sentAt recorded immediately on email send
- [ ] IMAP verification confirms delivery
- [ ] Wave-state.json matches reality (Gmail Sent folder)
- [ ] Supabase synced for municipalities
- [ ] Notion updated for VC status

---

## Team Assignment

| Phase | Agent | Task | ETA |
|-------|-------|------|-----|
| 1.1-1.4 | Keridz (be-coder) | Fix municipal personalization | 30 min |
| 2.1-2.2 | Keridz (be-coder) | Fix research persistence | 30 min |
| 3.1-3.2 | Keridz (be-coder) | Fix VC research | 30 min |
| 4.1-4.2 | Keridz (be-coder) | Fix logging + IMAP | 45 min |
| All | Chanshuk (dev-lead) | Review + coordinate | 30 min |
| All | Nikaya (reviewer) | Verify each fix | 30 min |

**Total ETA:** 3 hours
**Start:** Now
**Report:** Every 30 min to Discord #annotations

---

## Files to Modify

1. `src/strategies/personalization/MunicipalPersonalizationStrategy.ts`
2. `src/strategies/research/MunicipalResearchStrategy.ts`
3. `src/strategies/research/VCResearchStrategy.ts`
4. `src/strategies/sending/SendingStrategy.ts`
5. `src/entities/MunicipalEntity.ts` (if needed)
6. `src/core/Pipeline.ts` (saveState verification)

---

**Report by:** Wobblus 🔧  
**Date:** 2026-04-23 10:30 CST  
**Status:** Implementation plan complete — awaiting team spawn
