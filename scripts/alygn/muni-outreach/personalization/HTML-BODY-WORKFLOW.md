# Municipal Outreach HTML Body Generation Workflow

## Overview
This workflow generates engaging HTML email content for municipal outreach while respecting the `outreach-email-template.js` structure.

## Template Structure

The `outreach-email-template.js` handles:
1. **Header** - Logo + branding
2. **Greeting** - "Estimado/a [FirstName], Alcalde de [Municipality]"
3. **Variant Intro** - Based on variant (governance/institutional/traiga)
4. **Pain Points** - Optional bullet list (if provided)
5. **bodyHtml** - **CUSTOM CONTENT INJECTED HERE**
6. **Closing** - "Esperando explorar esto con usted."
7. **CTA Button** - Mailto link
8. **Footer** - Links + AI transparency

## Workflow Steps

### Step 1: Personalize Base Data
```bash
node scripts/alygn/muni-outreach/personalization/muni-personalizer.js \
  --input=/tmp/muni-cr-researched.json \
  --output=/tmp/muni-cr-personalized.json
```

**Output:** JSON with:
- `outreach.body` - plain text
- `outreach.subject`
- `outreach.variant`
- Municipality data (pain points, etc.)

### Step 2: Generate HTML Body Content (MIDDLE SECTION ONLY)
```bash
node scripts/alygn/muni-outreach/personalization/generate-html-body-only.js \
  --input=/tmp/muni-cr-personalized.json \
  --output=/tmp/muni-cr-with-html.json
```

**Prompt for AI/Generator:**
```
Generate ONLY the middle HTML content for municipal outreach emails.

DO NOT include:
- Greeting
- Introduction about Alygn
- Closing remarks
- Signature
- Call-to-action button
- Footer

DO include:
- Value proposition cards (4 cards with icons)
- Municipality-specific pain points (highlighted box)
- Key quote
- CTA text (but NOT the button)

The template handles the greeting, intro, closing, button, and footer.
We only need the engaging middle content.
```

**Output JSON structure:**
```json
{
  "outreach": {
    "body": "plain text fallback",
    "bodyHtml": "<div style=\"margin: 24px 0;\">...</div>",
    "subject": "...",
    "variant": "governance",
    "has_html": true
  }
}
```

### Step 3: Test Generation (DRY-RUN)
```bash
node scripts/alygn/muni-outreach/personalization/test-email-generation.js \
  --input=/tmp/muni-cr-with-html.json
```

**Verifies:**
- ✓ Greeting present
- ✓ Variant intro present
- ✓ Body content injected
- ✓ Closing present
- ✓ CTA button present
- ✓ Footer present
- ✓ No duplicate content

### Step 4: Send Emails (WHEN READY - NEW BATCH)
```bash
node scripts/alygn/muni-outreach/sending/email-sender-smtp-v2.js \
  --input=/tmp/muni-cr-with-html.json \
  --approved
```

## Key Files

| File | Purpose |
|------|---------|
| `generate-html-body-only.js` | Creates middle HTML content only |
| `test-email-generation.js` | Dry-run verification |
| `email-sender-smtp-v2.js` | Actual sending (uses bodyHtml if present) |
| `outreach-email-template.js` | Template wrapper (handles greeting/closing) |

## Critical Rules

1. **bodyHtml = middle content only** - No greeting/closing
2. **body = plain text fallback** - For email clients without HTML
3. **template handles structure** - Don't duplicate in bodyHtml
4. **Always test first** - Run dry-run before any live send
5. **painPoints optional** - Template adds them if provided
6. **variant determines intro** - governance/institutional/traiga

## Example Output Structure

```html
<!-- Template generates: -->
<div class="container">
  <div class="header">ALYGN + Logo</div>
  <div class="content">
    <p class="greeting">Estimado/a José, Alcalde de Liberia,</p>
    
    <!-- Variant intro (template) -->
    <p>Alygn es una institución independiente...</p>
    
    <!-- INJECTED bodyHtml STARTS HERE -->
    <div style="margin: 24px 0;">
      <p><strong>Nuestra alianza no es...</strong></p>
      <!-- Value props, pain points, quote, CTA text -->
    </div>
    <!-- INJECTED bodyHtml ENDS HERE -->
    
    <!-- Template generates: -->
    <p>Esperando explorar esto con usted.</p>
    <a class="cta-button">Conozca más...</a>
    <p class="ps">P.D.: Esta comunicación...</p>
  </div>
  <div class="footer">...</div>
</div>
```

## Troubleshooting

**Duplicate content?**
- Check that bodyHtml doesn't include greeting/closing
- Template adds those automatically

**Missing pain points?**
- painPoints parameter must be passed to generateEmail()
- Currently set to empty string in sender

**Plain text fallback?**
- body field used for text-only email clients
- Should be plain text, not HTML

## Lobster Workflow

```yaml
name: muni-html-body
steps:
  - id: personalize
    command: muni-personalizer.js
    
  - id: generate-html
    command: generate-html-body-only.js
    prompt: "Generate middle HTML content only, no greeting/closing"
    
  - id: test
    command: test-email-generation.js
    dry_run: true
    
  - id: send
    command: email-sender-smtp-v2.js
    requires_approval: true
    # Only for NEW batches, not same recipients
```

---
**Created:** 2026-03-18
**Status:** ✅ Tested and verified
**Next:** Ready for new batch of municipalities
