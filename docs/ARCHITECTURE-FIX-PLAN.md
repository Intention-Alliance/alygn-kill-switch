# Alygn Outreach Architecture Fix Plan

**Author:** Hugrukal 📐 (Software Architect)  
**Date:** March 18, 2026  
**Status:** Proposed  
**Scope:** VC Outreach + Municipal Outreach (Costa Rica Pilot)

---

## Executive Summary

This document outlines the architectural fixes required to resolve critical issues in the Alygn outreach system:

1. **Email Validation Missing** - Found emails aren't verified before database insertion
2. **Template Conflicts** - `bodyHtml` parameter creates structural conflicts with internal template logic
3. **Research Persistence Failing** - Deep research results not properly saving to Supabase/Notion
4. **Test/Production Mismatch** - Inconsistent temp file naming patterns

---

## Current Architecture Problems

### Problem 1: Email Validation Missing

**Current State:**
- `automated-vc-discovery.js` finds VCs via web search
- `muni-discovery.js` finds municipality contacts
- Emails extracted but **never validated** before database insertion
- Invalid emails cause bounce rates, sender reputation damage

**Impact:**
- High bounce rates damage email deliverability
- Smartlead/SMTP provider penalties
- Manual cleanup required

### Problem 2: Template Interface Conflict

**Current State (outreach-email-template.js):**

```javascript
// CURRENT - CONFLICTED INTERFACE
function generateEmail(params) {
  const {
    recipientName,      // ✓ Used
    municipality,       // ✓ Used
    subject,            // ✓ Used
    bodyHtml,           // ❌ CONFLICT - Injected into template but template ALSO has
                        //    greeting, intro, closing, CTA, footer hardcoded
    bodyText,           // ✓ Used
    variant,            // ✓ Used
    footer,             // ✓ Used
    useCid              // ✓ Used
  } = params;
  
  // Template generates:
  // 1. Greeting (Estimado/a ${firstName})
  // 2. Variant intro (governance|institutional|traiga)
  // 3. Pain points
  // 4. **INJECTS bodyHtml here** ← CONFLICT
  // 5. Closing
  // 6. CTA button
  // 7. Footer
}
```

**The Conflict:**

The Lobster workflow `.lobster/muni-html-body.lobster` attempts to generate "middle HTML only":

```yaml
id: "generate-html-body"
description: "Generate HTML body content (MIDDLE SECTION ONLY)"
prompt: "Generate ONLY the middle HTML content. NO greeting, NO intro about Alygn..."
```

But `muni-html-body.lobster` expects this middle section to be passed as `bodyHtml`, creating a **circular dependency** where:
- Template expects `bodyHtml` to fill the "middle"
- Generator is told to not generate greeting/intro/closing
- Template ALSO generates those sections
- Result: **duplicate content** or **missing sections**

**Evidence from `muni-html-body.lobster`:**
```javascript
validates: [
  "greeting_present",          // Template provides
  "variant_intro_present",     // Template provides
  "body_content_injected",     // bodyHtml parameter
  "closing_present",           // Template provides
  "cta_button_present",        // Template provides
  "footer_present",            // Template provides
  "no_duplicate_content"       // Current: FALSE (conflict exists)
]
```

### Problem 3: Research Persistence Failing

**Current State:**

```javascript
// automated-vc-discovery.js
async function addVCToNotion(vcData) {
  // Builds properties object
  const properties = {
    'Name': { title: [{ text: { content: vcData.name } }] },
    'Status': { select: { name: 'Not contacted' } },
    'Relevance Score': { number: vcData.relevanceScore }
  };
  
  // Attempts to save to Notion...
  await notion.pages.create({
    parent: { database_id: CONFIG.databaseId },
    properties
  });
}
```

**Issues:**
1. **No transaction rollback** - Partial saves leave orphaned data
2. **No validation before save** - Invalid data fails silently
3. **No deduplication** - `vcExists()` check but race conditions possible
4. **Supabase sync missing** - VC research → Notion only, no Supabase
5. **Municipal research** → Supabase only, no Notion sync

**File Pattern Inconsistency:**

Current scattered pattern:
```
/tmp/muni-cr-discovered.json     # ✓ Follows pattern
/tmp/muni-cr-researched.json     # ✓ Follows pattern
/tmp/muni-cr-verified.json       # ✓ Follows pattern
/tmp/muni-cr-personalized.json   # ✓ Follows pattern
/tmp/muni-cr-approved.json       # ✓ Follows pattern
/drafts/draft-{pageId}.json      # ❌ WRONG - scattered in subdir
output/vc-outreach/drafts/       # ❌ WRONG - another location
```

---

## Proposed Architecture Fixes

### 1. New Module Structure (Dependency Injection)

#### 1.1 Provider Interface Pattern

```
┌─────────────────────────────────────────────────────────────┐
│                  EmailProvider (Interface)                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  + send(email: EmailPayload): Promise<Result>         │   │
│  │  + validateConfig(): Promise<boolean>               │   │
│  │  + getProviderName(): string                        │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              △
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│  SMTPProvider │    │SmartleadProvider│   │SendGridProvider│
│  (current)    │    │   (new)        │    │   (future)    │
└───────────────┘    └───────────────┘    └───────────────┘
```

#### 1.2 Provider Factory Pattern

```javascript
// /scripts/alygn/lib/email/providers/EmailProvider.js
export class EmailProvider {
  async send(payload) { throw new Error('Not implemented'); }
  async validateConfig() { throw new Error('Not implemented'); }
  getName() { throw new Error('Not implemented'); }
}

// /scripts/alygn/lib/email/providers/SMTPProvider.js
export class SMTPProvider extends EmailProvider {
  constructor(config) {
    super();
    this.config = config;
    this.transporter = nodemailer.createTransport({...});
  }
  
  async send(payload) {
    const result = await this.transporter.sendMail({...payload});
    return { success: true, messageId: result.messageId };
  }
  
  getName() { return 'smtp'; }
}

// /scripts/alygn/lib/email/providers/SmartleadProvider.js
export class SmartleadProvider extends EmailProvider {
  constructor(apiKey) {
    super();
    this.apiKey = apiKey;
  }
  
  async send(payload) {
    const response = await fetch('https://api.smartlead.ai/v1/campaigns/send', {
      method: 'POST',
      headers: { 'X-API-Key': this.apiKey },
      body: JSON.stringify(payload)
    });
    return { success: response.ok, messageId: data.message_id };
  }
  
  getName() { return 'smartlead'; }
}

// /scripts/alygn/lib/email/EmailProviderFactory.js
export class EmailProviderFactory {
  static create(type, config) {
    switch(type) {
      case 'smtp': return new SMTPProvider(config);
      case 'smartlead': return new SmartleadProvider(config.apiKey);
      case 'sendgrid': return new SendGridProvider(config.apiKey);
      default: throw new Error(`Unknown provider: ${type}`);
    }
  }
}
```

#### 1.3 New Directory Structure

```
/scripts/alygn/
├── lib/
│   └── email/
│       ├── providers/
│       │   ├── EmailProvider.js       # Interface
│       │   ├── SMTPProvider.js          # SMTP implementation
│       │   ├── SmartleadProvider.js     # Smartlead API
│       │   └── SendGridProvider.js      # Future
│       ├── EmailProviderFactory.js      # Factory
│       ├── EmailService.js              # Orchestrator
│       └── validators/
│           ├── EmailValidator.js        # Interface
│           ├── ZeroBounceValidator.js     # ZeroBounce API
│           └── RegexMXValidator.js        # Fallback regex + MX lookup
├── vc-outreach/
│   └── email/
│       └── email-sender.js              # Uses EmailService
└── muni-outreach/
    └── sending/
        └── email-sender.js              # Uses EmailService
```

### 2. Fixed Template Interface (No bodyHtml Conflict)

#### 2.1 Simplified Template Contract

**BEFORE (Conflicted):**
```javascript
// Template has hardcoded: greeting, intro, closing, CTA, footer
// BUT also accepts bodyHtml that gets injected in the "middle"
// Result: Unclear boundaries, duplicate content risk

generateEmail({
  recipientName: 'Diego',
  municipality: 'San José',
  subject: '...',
  bodyHtml: '<p>Custom content...</p>',  // ❌ CONFLICTS with template structure
  variant: 'governance'
});
```

**AFTER (Clean Interface):**
```javascript
// Template owns ALL HTML structure
// Caller provides DATA, not HTML

generateEmail({
  // Required
  recipientName: 'Diego Miranda',
  companyName: 'San José',              // municipality OR companyName
  
  // Optional content sections
  painPoints: ['AI accountability', 'coordinación institucional'],
  customValueProposition: null,         // Optional: replaces default value cards
  
  // Configuration
  variant: 'governance',                // 'governance' | 'institutional' | 'traiga'
  language: 'es',                       // 'es' | 'en'
  
  // Metadata (not HTML)
  subject: 'AI Governance Infrastructure',  // Used in mailto: link
  ctaText: null,                        // Optional: override CTA button text
  footerNote: null,                     // Optional: P.S. text
  
  // NO bodyHtml parameter
});
```

#### 2.2 Template Internal Structure (Template Controls All HTML)

```javascript
function generateEmail(params) {
  const {
    recipientName,
    companyName,
    painPoints = [],
    customValueProposition = null,
    variant = 'governance',
    language = 'en',
    subject = '',
    ctaText = null,
    footerNote = null
  } = params;

  // 1. Generate header (logo, branding)
  const header = buildHeader();
  
  // 2. Generate greeting (Estimado/a ${firstName})
  const greeting = buildGreeting(recipientName, companyName, language);
  
  // 3. Generate variant intro (governance|institutional|traiga)
  const intro = buildVariantIntro(variant, language);
  
  // 4. Generate pain points section (if provided)
  const painPointsSection = painPoints.length > 0 
    ? buildPainPointsSection(painPoints, companyName, language)
    : '';
  
  // 5. Generate value proposition (custom or default cards)
  const valueProposition = customValueProposition 
    ? customValueProposition
    : buildDefaultValueCards(variant, language);
  
  // 6. Generate closing
  const closing = buildClosing(variant, language);
  
  // 7. Generate CTA button
  const cta = buildCTA({ variant, subject, language, customText: ctaText });
  
  // 8. Generate footer
  const footer = buildFooter({ variant, customNote: footerNote, language });
  
  // ASSEMBLE: Template controls ALL structure
  const html = `
    ${emailStyles}
    <div class="container">
      ${header}
      <div class="content">
        ${greeting}
        <div class="intro">${intro}</div>
        ${painPointsSection}
        <div class="value-prop">${valueProposition}</div>
        <div class="closing">${closing}</div>
        ${cta}
        ${footer}
      </div>
    </div>
  `;
  
  return {
    subject: getSubject(variant, language),
    html,
    text: generatePlainText(html)  // Auto-generated
  };
}
```

#### 2.3 Template Variants Definition

```javascript
const TEMPLATES = {
  governance: {
    es: {
      intro: `Alygn es una institución independiente de gobernanza de IA...`,
      closing: 'Esperando explorar esto con usted.',
      cta: 'Conozca más sobre Alygn',
      valueCards: [
        { title: 'Rendición de cuentas', desc: '...' },
        { title: 'Supervisión', desc: '...' },
        { title: 'Coordinación', desc: '...' },
        { title: 'Preparación', desc: '...' }
      ]
    },
    en: {
      // English variant
    }
  },
  institutional: {
    es: {
      intro: `Cuando los sistemas de IA escalan más allá del control individual...`,
      // ...
    }
  },
  traiga: {
    es: {
      intro: `El TRAIGA Act establece un marco regulatorio...`,
      // ...
    }
  }
};
```

### 3. Email Validation Integration Points

#### 3.1 Validation Strategy

```
┌─────────────────────────────────────────────────────────────┐
│                  Email Validation Pipeline                   │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Phase 1: Regex Validation (Fast, Local)                    │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/              │   │
│  │  Catches: syntax errors, missing @, invalid chars   │   │
│  │  Cost: Free | Latency: <1ms                         │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              │ Pass                      │ Fail
              ▼                           ▼
┌─────────────────────────┐    ┌─────────────────────────┐
│  Phase 2: MX Lookup      │    │  REJECT: Invalid format │
│  (DNS Validation)        │    │  Log: format_error      │
│  ┌───────────────────┐ │    └─────────────────────────┘
│  │  Query DNS for MX  │ │
│  │  records for domain│ │
│  │  Catches: fake     │ │
│  │  domains, typos    │ │
│  │  Cost: Free | ~50ms│ │
│  └───────────────────┘ │
└─────────────────────────┘
              │
    ┌─────────┴─────────┐
    │ Pass              │ Fail
    ▼                   ▼
┌─────────────────────────┐    ┌─────────────────────────┐
│  Phase 3: ZeroBounce   │    │  REJECT: No MX records  │
│  (API Validation)        │    │  Log: no_mx_records     │
│  ┌───────────────────┐ │    └─────────────────────────┘
│  │  API: /v1/validate│ │
│  │  Catches:         │ │
│  │  - catch-all      │ │
│  │  - disposable     │ │
│  │  - invalid        │ │
│  │  - unknown        │ │
│  │  Cost: $0.002/req │ │
│  └───────────────────┘ │
└─────────────────────────┘
              │
    ┌─────────┴─────────┐
    │ Valid             │ Risky/Invalid
    ▼                   ▼
┌─────────────────────────┐    ┌─────────────────────────┐
│  APPROVED: Add to DB    │    │  REJECT: Flag reason    │
│  Status: verified       │    │  Log: bounce_risk       │
└─────────────────────────┘    └─────────────────────────┘
```

#### 3.2 Validation Integration Points

**Point A: VC Discovery Pipeline**

```javascript
// /scripts/alygn/vc-outreach/core/automated-vc-discovery.js

import { EmailValidatorFactory } from '../../lib/email/validators/EmailValidatorFactory.js';

const validator = EmailValidatorFactory.create('zerobounce', {
  apiKey: process.env.ZEROBOUNCE_API_KEY,
  fallback: 'regex-mx'  // Fallback if API unavailable
});

async function validateAndAddVC(vcData) {
  // Step 1: Extract email from research
  const email = vcData.contacts?.primaryEmail;
  
  if (!email) {
    return { status: 'skipped', reason: 'no_email' };
  }
  
  // Step 2: Validate
  const validation = await validator.validate(email);
  
  // validation.result: 'valid' | 'invalid' | 'risky' | 'unknown'
  // validation.details: { catch_all, disposable, role_based, ... }
  
  if (validation.result === 'valid') {
    // Step 3: Add to database with verified status
    await addVCToNotion({
      ...vcData,
      email: email,
      emailStatus: 'verified',
      verifiedAt: new Date().toISOString(),
      validationSource: 'zerobounce'
    });
    
    return { status: 'added', email, validation };
  } else {
    // Step 4: Log rejection for analysis
    await logRejectedEmail(vcData.name, email, validation);
    
    return { status: 'rejected', email, reason: validation.result };
  }
}
```

**Point B: Municipal Discovery Pipeline**

```javascript
// /scripts/alygn/muni-outreach/discovery/verify-emails.js

import { EmailValidatorFactory } from '../../lib/email/validators/EmailValidatorFactory.js';

const validator = EmailValidatorFactory.create('zerobounce');

async function verifyMunicipalEmails(municipalities) {
  const results = {
    verified: [],
    rejected: [],
    errors: []
  };
  
  for (const muni of municipalities) {
    const emails = extractEmails(muni.contacts);
    
    for (const email of emails) {
      try {
        const validation = await validator.validate(email);
        
        if (validation.result === 'valid') {
          results.verified.push({
            municipality: muni.name,
            email,
            confidence: validation.confidence_score
          });
        } else {
          results.rejected.push({
            municipality: muni.name,
            email,
            reason: validation.result,
            details: validation.details
          });
        }
      } catch (error) {
        results.errors.push({ municipality: muni.name, email, error: error.message });
      }
      
      // Rate limit: 100 req/sec for ZeroBounce free tier
      await sleep(10);
    }
  }
  
  return results;
}
```

#### 3.3 Validator Implementation

```javascript
// /scripts/alygn/lib/email/validators/ZeroBounceValidator.js

export class ZeroBounceValidator {
  constructor(config) {
    this.apiKey = config.apiKey;
    this.baseUrl = 'https://api.zerobounce.net/v2';
  }
  
  async validate(email) {
    const response = await fetch(
      `${this.baseUrl}/validate?api_key=${this.apiKey}&email=${encodeURIComponent(email)}`
    );
    
    const data = await response.json();
    
    return {
      result: this.mapStatus(data.status),  // valid | invalid | risky | unknown
      confidence: data.confidence_score || 0,
      details: {
        catchAll: data.catch_all === 'true',
        disposable: data.disposable === 'true',
        roleBased: data.role_based === 'true',
        freeDomain: data.free_domain === 'true',
        didYouMean: data.did_you_mean || null
      },
      raw: data
    };
  }
  
  mapStatus(zbStatus) {
    const mapping = {
      'valid': 'valid',
      'invalid': 'invalid',
      'catch-all': 'risky',
      'unknown': 'unknown',
      'spamtrap': 'invalid',
      'abuse': 'invalid',
      'do_not_mail': 'invalid'
    };
    return mapping[zbStatus] || 'unknown';
  }
}

// /scripts/alygn/lib/email/validators/RegexMXValidator.js

export class RegexMXValidator {
  async validate(email) {
    // Step 1: Regex validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return { result: 'invalid', reason: 'regex_failed' };
    }
    
    // Step 2: MX lookup
    const domain = email.split('@')[1];
    const hasMX = await this.checkMX(domain);
    
    if (!hasMX) {
      return { result: 'invalid', reason: 'no_mx_records' };
    }
    
    return { result: 'valid', reason: 'regex_mx_passed' };
  }
  
  async checkMX(domain) {
    // Implementation using Node.js dns module
    const { promises: dns } = await import('dns');
    try {
      const mxRecords = await dns.resolveMx(domain);
      return mxRecords.length > 0;
    } catch {
      return false;
    }
  }
}
```

### 4. Standardized File Naming Convention

#### 4.1 Pattern Specification

```
Format: /tmp/alygn-{type}-{phase}-{timestamp}.json

Where:
  {type}    = 'vc' | 'muni'          // Campaign type
  {phase}   = see table below        // Processing phase
  {timestamp} = ISO 8601 (optional)  // For uniqueness
```

**Phase Naming Convention:**

| Phase | Suffix | Description |
|-------|--------|-------------|
| Discovery | `discovered` | Raw discovered entities |
| Validation | `validated` | Email-validated entities |
| Research | `researched` | Deep research complete |
| Personalization | `personalized` | Content generated |
| Approval | `approved` | Human-approved |
| DB Sync | `synced` | Saved to database |
| Sent | `sent` | Emails delivered |

#### 4.2 Directory Structure

```
/tmp/
├── alygn-vc-discovered-{timestamp}.json       # VC discovery
├── alygn-vc-validated-{timestamp}.json        # Email validation
├── alygn-vc-researched-{timestamp}.json       # Deep research
├── alygn-vc-personalized-{timestamp}.json     # Content generated
├── alygn-vc-approved-{timestamp}.json           # Human approved
├── alygn-vc-sent-{timestamp}.json             # Emails sent
│
├── alygn-muni-discovered-{timestamp}.json     # Municipal discovery
├── alygn-muni-validated-{timestamp}.json        # Email validation
├── alygn-muni-researched-{timestamp}.json     # Deep research
├── alygn-muni-personalized-{timestamp}.json   # Content generated
├── alygn-muni-approved-{timestamp}.json         # Human approved
├── alygn-muni-synced-{timestamp}.json         # DB sync complete
├── alygn-muni-sent-{timestamp}.json           # Emails sent
│
└── alygn-resume-{workflow}-{timestamp}.json     # Resume tokens

/scripts/alygn/vc-outreach/
└── drafts/                                     # DEPRECATED - move to /tmp

/scripts/alygn/output/                         # DEPRECATED - use /tmp
└── vc-outreach/
    └── drafts/                                 # DEPRECATED - use /tmp
```

#### 4.3 Migration Plan

1. **Update all scripts** to use new `/tmp/alygn-{type}-{phase}.json` pattern
2. **Deprecate** `/scripts/alygn/vc-outreach/drafts/` directory
3. **Deprecate** `/scripts/alygn/output/` directory
4. **Update Lobster workflows** to reference new paths
5. **Clean up** old directories after migration complete

### 5. Dry-Run JSON Output Format

#### 5.1 Output Structure

When `--dry-run` flag is passed, scripts must output **valid JSON to stdout** (not logs) showing exactly what would be sent/created.

**Standard Dry-Run Output Format:**

```json
{
  "dryRun": true,
  "timestamp": "2026-03-18T14:30:00Z",
  "script": "draft-outreach-emails.js",
  "summary": {
    "total": 5,
    "wouldSucceed": 5,
    "wouldFail": 0,
    "errors": []
  },
  "operations": [
    {
      "id": "vc-001",
      "type": "email_draft",
      "entity": {
        "name": "Khosla Ventures",
        "email": "contact@khoslaventures.com",
        "partnerName": "Vinod Khosla"
      },
      "action": "generate_email",
      "payload": {
        "to": "contact@khoslaventures.com",
        "subject": "AI Safety Governance Infrastructure",
        "from": "Alygn R&D <outreach@alyygn.com>",
        "replyTo": "tanialeaidm@gmail.com",
        "cc": "outreach@alyygn.com",
        "html": "<!DOCTYPE html>...",
        "text": "Plain text version...",
        "headers": {
          "X-Campaign": "vc-wave-1",
          "X-Variant": "governance"
        }
      },
      "metadata": {
        "variant": "governance",
        "templateVersion": "4.0",
        "personalizationScore": 0.85
      }
    }
  ],
  "files": {
    "wouldCreate": [
      "/tmp/alygn-vc-approved-2026-03-18T14-30-00.json"
    ],
    "wouldUpdate": [],
    "wouldDelete": []
  },
  "database": {
    "wouldInsert": [
      {
        "table": "vc_contacts",
        "record": { "name": "Khosla Ventures", "status": "ready_for_outreach" }
      }
    ],
    "wouldUpdate": [],
    "wouldDelete": []
  },
  "externalCalls": {
    "wouldSend": [
      {
        "service": "discord",
        "action": "post_message",
        "channel": "1466532145257255004",
        "preview": "📧 Email Draft for Khosla Ventures..."
      }
    ],
    "wouldSkip": [
      {
        "service": "smartlead",
        "reason": "dry_run_mode"
      }
    ]
  }
}
```

#### 5.2 Implementation Pattern

```javascript
// /scripts/alygn/vc-outreach/email/draft-outreach-emails.js

async function main() {
  const args = parseArgs();
  const dryRun = args.includes('--dry-run');
  
  const dryRunReport = {
    dryRun: true,
    timestamp: new Date().toISOString(),
    script: 'draft-outreach-emails.js',
    summary: { total: 0, wouldSucceed: 0, wouldFail: 0, errors: [] },
    operations: [],
    files: { wouldCreate: [], wouldUpdate: [], wouldDelete: [] },
    database: { wouldInsert: [], wouldUpdate: [], wouldDelete: [] },
    externalCalls: { wouldSend: [], wouldSkip: [] }
  };
  
  try {
    const vcs = await getReadyVCs();
    dryRunReport.summary.total = vcs.length;
    
    for (const vc of vcs) {
      const draft = await generateDraft(vc);
      
      // Record what WOULD happen
      dryRunReport.operations.push({
        id: vc.pageId,
        type: 'email_draft',
        entity: { name: vc.name, email: vc.email },
        action: 'generate_email',
        payload: {
          to: draft.email,
          subject: draft.subject,
          html: draft.html.substring(0, 500) + '...'  // Truncated for readability
        }
      });
      
      dryRunReport.files.wouldCreate.push(
        `/tmp/alygn-vc-approved-${new Date().toISOString()}.json`
      );
      
      dryRunReport.externalCalls.wouldSend.push({
        service: 'discord',
        action: 'post_message',
        channel: '1466532145257255004',
        preview: `📧 Email Draft for ${vc.name}...`
      });
      
      dryRunReport.summary.wouldSucceed++;
      
      if (!dryRun) {
        // Actually execute
        await saveDraft(draft);
        await postToDiscord(draft);
      }
    }
    
  } catch (error) {
    dryRunReport.summary.errors.push(error.message);
    dryRunReport.summary.wouldFail++;
  }
  
  // ALWAYS output JSON to stdout in dry-run mode
  if (dryRun) {
    console.log(JSON.stringify(dryRunReport, null, 2));
  }
}
```

#### 5.3 CLI Usage Examples

```bash
# View what would be drafted (no actual changes)
node draft-outreach-emails.js --limit=5 --dry-run | jq

# Save dry-run output for review
draft-outreach-emails.js --dry-run > /tmp/preview-$(date +%Y%m%d).json

# Pipe to validation
draft-outreach-emails.js --dry-run | ./validate-dry-run.js
```

---

## Implementation Checklist

### Phase 1: Template Refactor (Critical - Blocks All Other Work)

- [ ] Remove `bodyHtml` parameter from `outreach-email-template.js`
- [ ] Implement simplified interface (recipientName, companyName/municipality, painPoints, variant)
- [ ] Add `language` parameter for ES/EN support
- [ ] Template generates ALL HTML internally
- [ ] Update `draft-outreach-emails.js` to use new interface
- [ ] Update `muni-personalizer.js` to use new interface
- [ ] Delete `.lobster/muni-html-body.lobster` (no longer needed)
- [ ] Update `.lobster/alygn-campaign.lobster` references
- [ ] Update `.lobster/muni-outreach.lobster` references

### Phase 2: Email Provider Dependency Injection

- [ ] Create `/scripts/alygn/lib/email/providers/` directory
- [ ] Implement `EmailProvider.js` interface
- [ ] Implement `SMTPProvider.js`
- [ ] Implement `SmartleadProvider.js`
- [ ] Create `EmailProviderFactory.js`
- [ ] Create `EmailService.js` orchestrator
- [ ] Refactor `email-sender.js` to use EmailService
- [ ] Add provider selection via `--provider=smtp|smartlead` flag

### Phase 3: Email Validation Integration

- [ ] Create `/scripts/alygn/lib/email/validators/` directory
- [ ] Implement `EmailValidator.js` interface
- [ ] Implement `ZeroBounceValidator.js`
- [ ] Implement `RegexMXValidator.js` (fallback)
- [ ] Create `EmailValidatorFactory.js`
- [ ] Integrate validation into `automated-vc-discovery.js`
- [ ] Integrate validation into `muni-discovery.js`
- [ ] Add validation step to `.lobster/alygn-campaign.lobster` (Phase 3)
- [ ] Add validation step to `.lobster/muni-outreach.lobster`

### Phase 4: Research Persistence Fix

- [ ] Implement transaction wrapper for Notion writes
- [ ] Implement transaction wrapper for Supabase writes
- [ ] Add deduplication check with row-level locking
- [ ] Add retry logic with exponential backoff
- [ ] Create `ResearchPersistenceService.js`
- [ ] Update `automated-vc-discovery.js` to use persistence service
- [ ] Update `muni-research.js` to use persistence service
- [ ] Add `persistence-integrity-check.js` script

### Phase 5: File Naming Standardization

- [ ] Update all scripts to use `/tmp/alygn-{type}-{phase}.json`
- [ ] Update `.lobster/alygn-campaign.lobster` output paths
- [ ] Update `.lobster/muni-outreach.lobster` output paths
- [ ] Deprecate `/scripts/alygn/vc-outreach/drafts/` (add deprecation warning)
- [ ] Deprecate `/scripts/alygn/output/` (add deprecation warning)
- [ ] Create migration script to move existing files
- [ ] Update documentation

### Phase 6: Dry-Run Output Format

- [ ] Implement dry-run report structure in all scripts
- [ ] Add `--dry-run` flag to: `automated-vc-discovery.js`
- [ ] Add `--dry-run` flag to: `draft-outreach-emails.js`
- [ ] Add `--dry-run` flag to: `email-sender.js`
- [ ] Add `--dry-run` flag to: `muni-discovery.js`
- [ ] Add `--dry-run` flag to: `muni-personalizer.js`
- [ ] Ensure JSON output to stdout (not logs)
- [ ] Add validation: dry-run output must be valid JSON

---

## Risks and Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Template refactor breaks existing campaigns | High | Phase 1 focused sprint; comprehensive testing; rollback plan |
| ZeroBounce API costs | Medium | Implement caching; use regex+MX as primary, ZeroBounce for unsure |
| File path changes break workflows | High | Update Lobster workflows atomically; maintain backward compat during transition |
| Dry-run JSON format changes break tooling | Low | Version the format; document in schema |
| Research persistence still fails | Medium | Add health checks; implement circuit breaker pattern |

---

## Success Criteria

1. **Email Validation:** 100% of emails validated before DB insertion
2. **Template Interface:** No `bodyHtml` parameter; clean data-only interface
3. **Provider DI:** SMTP, Smartlead, SendGrid swappable via factory
4. **File Naming:** All temp files follow `/tmp/alygn-{type}-{phase}.json`
5. **Dry-Run:** All scripts output valid JSON showing exact operations

---

## Appendix A: Migration Script Template

```javascript
#!/usr/bin/env node
// /scripts/alygn/migrate-file-paths.js

import fs from 'fs';
import path from 'path';

const OLD_PATHS = [
  '/scripts/alygn/vc-outreach/drafts/',
  '/scripts/alygn/output/vc-outreach/drafts/'
];

const MAPPING = {
  'draft-{id}.json': 'alygn-vc-approved-{timestamp}.json',
  'muni-draft-{id}.json': 'alygn-muni-approved-{timestamp}.json'
};

async function migrate() {
  for (const oldPath of OLD_PATHS) {
    if (!fs.existsSync(oldPath)) continue;
    
    const files = fs.readdirSync(oldPath);
    
    for (const file of files) {
      const oldFile = path.join(oldPath, file);
      const timestamp = fs.statSync(oldFile).mtime.toISOString().replace(/[:.]/g, '-');
      const newFile = `/tmp/alygn-vc-approved-${timestamp}.json`;
      
      fs.copyFileSync(oldFile, newFile);
      console.log(`Migrated: ${oldFile} → ${newFile}`);
    }
  }
}

migrate();
```

---

## Appendix B: Testing Strategy

1. **Unit Tests:** Each provider/validator in isolation
2. **Integration Tests:** Full workflow with `--dry-run`
3. **End-to-End Tests:** Costa Rica pilot (small batch)
4. **Regression Tests:** Ensure existing VCs still process correctly

---

*Document ends. Implementation to be coordinated by Wobblus.*
