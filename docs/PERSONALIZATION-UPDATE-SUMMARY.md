# Personalization Specs Update - Summary of Changes

**Date:** March 19, 2026
**Task:** Update Cron Prompt + Lobster Workflows with Personalization Specs
**Status:** ✅ Complete

---

## Files Updated

### 1. Cron Task Prompt (NEW)
**File:** `docs/alygn-outreach-cronjobs-PERSONALIZED.json`

**Added personalization specifications:**

#### Body Text Personalization (Both Campaigns)
- **Requirement:** Include 1-2 sentences connecting recipient's specific work to Alygn
- **VC Outreach:** Reference investments, thesis, or recent deals
  - Examples:
    - "Given your investment in Anthropic, you understand the coordination challenges AI labs face..."
    - "Your thesis on frontier tech aligns with our approach to governance infrastructure..."
- **Municipal Outreach:** Reference recent initiatives, digital governance projects, or public statements
  - Examples:
    - "Dado su liderazgo en la modernización de servicios digitales en San José, entiende la importancia de la coordinación institucional..."
    - "Su reciente anuncio sobre gobernanza digital alinea con nuestro enfoque en infraestructura de coordinación..."

#### PS Personalization Requirements

**VC Emails:**
- Reference specific partner background when available
- Examples:
  - "P.S.: I noticed you studied at Stanford GSB — your work on [topic] resonates with our coordination thesis."
  - "P.S.: Your Super Evolution thesis on [focus] directly aligns with how we think about institutional AI governance."
  - "P.S.: Having backed [Portfolio Company], you understand the governance infrastructure gap we're addressing."

**Municipal Emails (Spanish):**
- **Required P.D. section:**
  ```
  P.D.: Como pioneros en implementación de gobernanza de IA en Costa Rica, 
  su municipio tiene la oportunidad de liderar la región en coordinación 
  institucional. Este mensaje fue generado con IA y verificado por humanos.
  ```

---

### 2. VC Outreach Workflow
**File:** `.lobster/alygn-campaign.lobster`

**Changes:**
- Added **Phase 2: Research VCs for Personalization** (NEW)
  - Research recent investments (last 12 months)
  - Research investment thesis and focus areas
  - Research partner backgrounds (Stanford GSB, Super Evolution thesis, etc.)
  - Research portfolio companies in AI/governance/coordination

- Added **personalization section** to Phase 3 (Personalization)
  - Body text requirements with examples
  - PS section requirements with examples

- Added `personalization_specs` section at workflow level
  - `body_text` specifications
  - `ps_section` specifications

---

### 3. Municipal Outreach Workflow
**File:** `.lobster/muni-outreach.lobster`

**Changes:**
- Added **personalization specifications** to Phase 4 (Personalization)
  - Body text personalization (required)
    - Instructions for connecting work to Alygn
    - Examples in Spanish
  - PS section personalization (required)
    - Spanish P.D. section template

- Added `personalization_specs` section at workflow level
  - `body_text` specifications
  - `ps_section` specifications with full Spanish template

---

## Key Changes Summary

| Component | Body Personalization | PS Personalization |
|-----------|---------------------|-------------------|
| **Cron Task (VC)** | 1-2 sentences referencing investments/thesis/deals | Partner background references (Stanford GSB, Super Evolution) |
| **Cron Task (Muni)** | 1-2 sentences referencing initiatives/digital governance | Spanish P.D. section about pioneering AI governance |
| **Lobster VC** | Added to Phase 3 with research phase | Added to Phase 3 and workflow specs |
| **Lobster Muni** | Added to Phase 4 with examples | Added to Phase 4 and workflow specs |

---

## Implementation Notes

1. **Research Phase Required:** Both workflows now include explicit research phases before personalization to gather context for body text personalization

2. **Language Specificity:**
   - VC emails: English with partner-specific references
   - Municipal emails: Spanish with Costa Rica-specific context

3. **Verification:** All personalization content must be verified via Grok/Perplexity before inclusion

4. **Approval Gates:** Both workflows maintain human review gates before sending

---

## Next Steps

1. Update personalization scripts (`muni-personalizer.js`, `generate-vc-personalized.js`) to implement these requirements
2. Test personalization with sample data
3. Verify Spanish P.D. section renders correctly
4. Document personalization examples for future reference

---

**Deliverables Complete:**
- ✅ `docs/alygn-outreach-cronjobs-PERSONALIZED.json`
- ✅ `.lobster/alygn-campaign.lobster`
- ✅ `.lobster/muni-outreach.lobster`
- ✅ `PERSONALIZATION-UPDATE-SUMMARY.md` (this file)