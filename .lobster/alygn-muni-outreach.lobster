name: alygn-campaign
description: Costa Rica municipal outreach pilot (82 cantones) campaign with personalization - using alygn-outreach skill
metadata:
  project: alygn
  region: costa-rica
  type: muni-outreach
  wave: {{ LATEST_WAVE_NUMBER + 1 }}
  total_municipalities: 82
  skill: alygn-outreach
  learnings_source: vc-outreach (adapted for municipal context)
  dependencies:
    - supabase (remote PostgreSQL - ALL status tracking)
    - notion (optional, for cross-reference)
    - perplexity (deep research API)
    - firecrawl (web scraping, optional with deepResearch)
    - grok (personalization)
    - zerobounce (email validation)
    - smartlead (email sending)

# Wave State File Schema
# Path: $HOME/.openclaw/workspace/reports/alygn/muni-wave-state.json
# {
#   "wave": { "number": 1, "date": "2026-03-26", "nextDate": "2026-04-02", "status": "idle" },
#   "entities": {},
#   "lastRun": "2026-03-26T14:00:00Z",
#   "phaseCompleted": null
# }

# Municipal Outreach Campaign Workflow
# Database: Supabase PostgreSQL (remote - use JS utilities, NOT raw SQL)
# Schema Reference (from 000_init-schema.sql):
#   TABLE: municipalities    - id, name, country, region, province, mayor_name, mayor_email, general_email, x_handle, x_url, discovered_at, researched_at, verified_at, outreach_sent_at, replied_at, x_warmup_phase1_at, x_warmup_phase2_at, x_engagement_count, x_last_engagement_at, wave_number, priority_score, pain_points (TEXT[]), ai_governance_signals (JSONB), notes (JSONB)
#   TABLE: outreach_emails   - id, municipality_id (FK), variant, subject, body, sent_at, message_id, status ('sent','bounced','replied','failed'), replied_at, reply_sentiment, reply_body, x_warmup_completed, x_engagements_before_email
#   TABLE: x_engagements     - id, municipality_id (FK), engagement_type ('follow','like','reply','quote'), x_handle, x_user_id, tweet_id, content, engaged_at, phase (1 or 2)
#   TABLE: outreach_templates - id, name, variant, version, subject_template, body_template, is_active
#   VIEW: v_pipeline_summary - counts by wave
#   VIEW: v_x_warmup_status  - shows warmup phase
#   VIEW: v_ready_for_email  - municipalities ready for email (x_warmup_phase2_at NOT NULL AND outreach_sent_at IS NULL)

# ═══════════════════════════════════════════════════════════════════════════════
# MODE A vs MODE B EXECUTION
# ═══════════════════════════════════════════════════════════════════════════════
#
# MODE A (Dry Run - Default):
#   bun $HOME/.agents/skills/alygn-outreach/bin/alygn-outreach.ts --dry-run
#   → Uses MOCK data for all API calls (Perplexity, email validation, etc.)
#   → Simulated Supabase database responses
#   → Safe for testing workflow logic without external API calls
#
# MODE B (Real API + Dry Run):
#   USE_DIRECT_API=true bun $HOME/.agents/skills/alygn-outreach/bin/alygn-outreach.ts --dry-run
#   → Real Perplexity/web_search API calls for mayor research
#   → Real email validation via ZeroBounce
#   → Simulated Supabase database responses
#   → Use when you need real research data but don't want to write to database
#
# MODE C (Production - No Flags):
#   bun $HOME/.agents/skills/alygn-outreach/bin/alygn-outreach.ts
#   → Real API calls + real Supabase database writes
#   → ACTUAL EMAIL SENDING via Smartlead
#   → Requires explicit approval gates
#
# ═══════════════════════════════════════════════════════════════════════════════

# ═══════════════════════════════════════════════════════════════════════════════
# DEEP RESEARCH FLAG
# ═══════════════════════════════════════════════════════════════════════════════
#
# Add --deep-research to any discover/research/pipeline command to enable
# enhanced multi-source research:
#   → Perplexity API for mayor name / governance signals
#   → Firecrawl for municipal website scraping
#   → web_search for additional signals
#
# Example:
#   USE_DIRECT_API=true bun alygn-outreach.ts --type=municipal --action=research --deep-research --dry-run
#
# ═══════════════════════════════════════════════════════════════════════════════
#
# ═══════════════════════════════════════════════════════════════════════════════
# SUPABASE DEPENDENCY (CRITICAL)
# ═══════════════════════════════════════════════════════════════════════════════
#
# ALL status tracking uses remote Supabase PostgreSQL. No local SQL.
# Required env vars (or loaded from credentials.json):
#   SUPABASE_URL - Supabase project URL
#   SUPABASE_SERVICE_KEY - Service role key for DB access
#   NOTION_VC_DATABASE_ID - Notion VC database ID (no hardcoded fallback)
#
# Scripts fail fast if required env vars are missing.
#
# ═══════════════════════════════════════════════════════════════════════════════

# IMPORTANT: All database operations use Bun TypeScript utilities via supabase-utils.ts!
# ❌ DO NOT use raw SQL commands - they will FAIL against remote Supabase
# ✅ USE: bun $HOME/.agents/skills/alygn-outreach/src/lib/supabase-utils.ts --action=<action>

# Costa Rica Pilot Workflow - VC Learnings Applied to Municipal Context
# Tests end-to-end municipal outreach automation with TRAIGA Act focus
# Key changes from VC:
#   - 5 emails/run (not 3), 60-180s delay, 5/day cap
#   - Email validation: generic=Fail, personal=Pass, mayor name research required
#   - SentEmailTracker integration: skip Sent/Replied/Meeting Scheduled
#   - Draft status workflow: INSERT to outreach_emails → status='draft' → status='sent' (no draft_status column)
#   - Tania CC requirement (production only)
#   - x-growth prelude-discovery phase for X account warming
#   - Supabase for all status tracking (no supabase_table/supabase_columns/supabase_filter syntax - use SQL)
#   - Spanish localization with TRAIGA Act personalization
#   - Tone: supportive, trust-building (not salesy)

steps:
  # ============================================================
  # PRELUDE: X Account Discovery & Warming
  # ============================================================
  - id: prelude-x-discovery
    command: openclaw invoke --tool x-growth --action discover --target=municipalities --filter="Costa Rica" --limit=20 --dry-run
    description: "Discover official municipal X accounts via x-growth"
    output:
      file: $HOME/.openclaw/workspace/reports/alygn/muni-x-accounts/muni-cr-x-accounts-{timestamp}.json
    notes: |
      Warms up before email outreach by discovering official municipal X accounts.
      Links to x-warmup.lobster for engagement sequencing.
      X engagements are INSERTed into x_engagements table with municipality_id FK.
      Uses openclaw invoke (no binary - skill provides tool interface).

  # ============================================================
  # PHASE 1: Discovery (Firecrawl)
  # MODE B: USE_DIRECT_API=true enables real web scraping for canton discovery
  # ============================================================
  - id: phase1-discovery
    command: USE_DIRECT_API=true bun $HOME/.agents/skills/alygn-outreach/bin/alygn-outreach.ts --type=municipal --action=discover --region=costa-rica --limit=82 --dry-run
    description: "Discover all 82 Costa Rican cantones (Mode B: real web scraping). Add --deep-research for Perplexity + Firecrawl + web search."
    after: prelude-x-discovery
    output:
      file: $HOME/.openclaw/workspace/reports/alygn/muni-discover/muni-cr-discovered-{timestamp}.json
    notes: |
      Discovery results INSERTed into municipalities table.
      Supabase: INSERT INTO municipalities (name, country, region, province, discovered_at)

  # ============================================================
  # PHASE 2: Research Mayor Names
  # MODE B: USE_DIRECT_API=true enables real Perplexity research for mayor names
  # ============================================================
  - id: phase2-research-mayors
    command: USE_DIRECT_API=true bun $HOME/.agents/skills/alygn-outreach/bin/alygn-outreach.ts --type=municipal --action=research --region=costa-rica --input=$HOME/.openclaw/workspace/reports/alygn/muni-discover/muni-cr-discovered-{timestamp}.json --dry-run
    description: "Research actual mayor names for each canton (Mode B: real Perplexity research). Add --deep-research for enhanced multi-source research."
    after: phase1-discovery
    output:
      file: $HOME/.openclaw/workspace/reports/alygn/muni-mayor/muni-cr-mayor-names-{timestamp}.json
    notes: |
      CRITICAL: Must research mayor names BEFORE validation phase.
      Uses --action=research (NOT research-mayors).
      Email patterns to look for:
        - firstname@msj.go.cr (central government pattern)
        - alcalde@cantonal-domain.go.cr (direct municipal)
        - mayor.name@cantonal-domain.com (English pattern)
      Common generic emails to AVOID:
        - contacto@, info@, administracion@, secretaria@ → INVALID
      Supabase: UPDATE municipalities SET mayor_name=?, researched_at=NOW() WHERE id=?

  # ============================================================
  # PHASE 2.5: Email Validation with Mayor Name Context
  # MODE B: USE_DIRECT_API=true enables real ZeroBounce validation
  # ============================================================
  - id: phase2-5-validate-emails
    command: USE_DIRECT_API=true bun $HOME/.agents/skills/alygn-outreach/bin/alygn-outreach.ts --type=municipal --action=validate --region=costa-rica --input=$HOME/.openclaw/workspace/reports/alygn/muni-mayor/muni-cr-mayor-names-{timestamp}.json --dry-run
    description: "Validate emails using mayor name context (Mode B: real ZeroBounce API)"
    after: phase2-research-mayors
    output:
      file: $HOME/.openclaw/workspace/reports/alygn/muni-validate/muni-cr-validated-{timestamp}.json
    notes: |
      Validation rules (CRITICAL):
        - Generic emails (contacto@, info@, administracion@) → FAIL
        - Personal emails (alcalde@, jvasquez@, mayor.name@) → PASS
        - On FAIL: Update municipalities.notes JSONB with validation failure reason
      Supabase on FAIL: 
        SCRIPT: supabase-utils.ts
        CALL: bun $HOME/.agents/skills/alygn-outreach/src/lib/supabase-utils.ts --action=update-validation --muni-id=<id> --reason="generic email - research mayor name"
      Supabase on PASS: 
        SCRIPT: supabase-utils.ts
        CALL: bun $HOME/.agents/skills/alygn-outreach/src/lib/supabase-utils.ts --action=update-research --muni-id=<id> --mayor-name=<name>

  # ============================================================
  # PHASE 3: Supabase Status Update (Research)
  # ============================================================
  - id: phase3-update-supabase-research
    command: bun $HOME/.agents/skills/alygn-outreach/src/lib/supabase-utils.ts --action=update-research --input=$HOME/.openclaw/workspace/reports/alygn/muni-validate/muni-cr-validated-{timestamp}.json --dry-run
    description: "Update Supabase municipalities table with research status"
    after: phase2-5-validate-emails
    output:
      file: $HOME/.openclaw/workspace/reports/alygn/muni-research/muni-cr-supabase-research-{timestamp}.json
    notes: |
      Supabase columns updated:
        - researched_at: NOW()
        - mayor_name: (from phase 2 research)
        - mayor_email: (validated email or NULL if invalid)
      No warmth_score column - use priority_score from municipalities table instead.
      Uses supabase-utils.ts script for remote Supabase operations.
      Input file format: JSON array of {muniId, mayorName, email} objects

  # ============================================================
  # PHASE 4: Personalization (Grok) - Municipal-Specific
  # MODE B: USE_DIRECT_API=true enables real Groq/Grok personalization
  # ============================================================
  - id: phase4-personalize
    command: USE_DIRECT_API=true bun $HOME/.agents/skills/alygn-outreach/bin/alygn-outreach.ts --type=municipal --action=personalize --region=costa-rica --input=$HOME/.openclaw/workspace/reports/alygn/muni-validate/muni-cr-validated-{timestamp}.json --variant=traiga --language=es --dry-run
    description: "Generate personalized Spanish emails (Mode B: real Grok API)"
    after: phase3-update-supabase-research
    output:
      file: $HOME/.openclaw/workspace/reports/alygn/muni-personalize/muni-cr-personalized-{timestamp}.json
    notes: |
      Personalization requirements:
        - Body: 1-2 sentences connecting to TRAIGA Act implementation
        - P.D. (PS): Reference specific canton context + Spanish disclaimer
        - Language: Spanish (es) with proper Costa Rica localization
        - Tone: Supportive, trust-building (NOT salesy)
        - Variant: 'governance' or 'institutional' (from outreach_templates.variant)
      Template lookup: SELECT * FROM outreach_templates WHERE variant=? AND is_active=TRUE
      Draft tracking: 
        SCRIPT: supabase-utils.ts
        CALL: bun $HOME/.agents/skills/alygn-outreach/src/lib/supabase-utils.ts --action=log-outreach --muni-id=<id> --variant=<variant> --input=$HOME/.openclaw/workspace/reports/alygn/muni-personalize/muni-cr-personalized-{timestamp}.json
        This creates outreach_email_logs record for tracking

  # ============================================================
  # PHASE 5: Manual Review (Approval Required)
  # ============================================================
  - id: phase5-review
    command: bun $HOME/.agents/skills/alygn-outreach/bin/alygn-outreach.ts --type=municipal --action=review --region=costa-rica --input=$HOME/.openclaw/workspace/reports/alygn/muni-personalize/muni-cr-personalized-{timestamp}.json --dry-run
    description: "Manual review and approval of drafts before sending"
    after: phase4-personalize
    output:
      file: $HOME/.openclaw/workspace/reports/alygn/muni-review/muni-cr-reviewed-{timestamp}.json
    notes: |
      MANUAL APPROVAL REQUIRED before Phase 6.
      Review requirements:
        - Check personalization quality
        - Verify TRAIGA Act references are accurate
        - Confirm canton-specific context is correct
      No draft_status column - track via:
        1. File output for human review
        2. Human approves via Discord/Notion
        3. THEN: Update status via Supabase
           SCRIPT: supabase-utils.ts
           CALL: bun $HOME/.agents/skills/alygn-outreach/src/lib/supabase-utils.ts --action=update-sent --muni-id=<muniId> --message-id=<emailId>

  # ============================================================
  # PHASE 5.5: SentEmailTracker Check (Pre-Send)
  # ============================================================
  - id: phase5-5-sent-tracker-check
    command: bun $HOME/.agents/skills/alygn-outreach/src/lib/supabase-utils.ts --action=check-sent --input=$HOME/.openclaw/workspace/reports/alygn/muni-personalize/muni-cr-personalized-{timestamp}.json --dry-run
    description: "Check SentEmailTracker before any send - skip if already contacted"
    after: phase5-review
    output:
      file: $HOME/.openclaw/workspace/reports/alygn/muni-sent/muni-cr-sent-check-{timestamp}.json
    notes: |
      SentEmailTracker check (CRITICAL - uses municipal_outreach table):
        - Query via Supabase:
          SCRIPT: supabase-utils.ts
          CALL: bun supabase-utils.ts --action=check-sent --muni-id=<muniId>
          Returns: true if municipality already sent, false otherwise
        - Skip if record exists (already sent)
        - Skip if status: 'Sent', 'Replied', 'Meeting Scheduled'
        - Never send to same municipality twice
        - Update tracker after successful send: bun supabase-utils.ts --action=update-sent

  # ============================================================
  # PHASE 6: Email Sending (Smartlead) - Production Only
  # NO DRY RUN FLAG = REAL SENDING
  # ============================================================
  - id: phase6-send
    command: bun $HOME/.agents/skills/alygn-outreach/bin/alygn-outreach.ts --type=municipal --action=send --region=costa-rica --input=$HOME/.openclaw/workspace/reports/alygn/muni-personalize/muni-cr-personalized-{timestamp}.json
    description: "Send emails via Smartlead with Tania CC and rate limiting (PRODUCTION)"
    after: phase5-5-sent-tracker-check
    output:
      file: $HOME/.openclaw/workspace/reports/alygn/muni-sent/muni-cr-sent-{timestamp}.json
    notes: |
      Rate limiting, municipal-specific:
        - 5 emails per run
        - Delay between sends: 60-180 seconds (randomized)
        - Daily cap: 5 municipal emails/day
      CC requirement:
        - CC: tanialeaidm@gmail.com (PRODUCTION ONLY - no --dry-run flag)
      Supabase updates on send (TWO operations - use supabase-utils.ts):
        1. Log sent email:
           SCRIPT: supabase-utils.ts
           CALL: bun $HOME/.agents/skills/alygn-outreach/src/lib/supabase-utils.ts --action=log-outreach --muni-id=<id> --input=$HOME/.openclaw/workspace/reports/alygn/muni-sent/muni-cr-sent-{timestamp}.json
        2. Update municipality:
           SCRIPT: supabase-utils.ts  
           CALL: bun $HOME/.agents/skills/alygn-outreach/src/lib/supabase-utils.ts --action=update-sent --muni-id=<muniId> --message-id=<msgId> --sent-date=<ISOdate>

  # ============================================================
  # PHASE 7 (OPTIONAL): Full Pipeline Execution (for testing)
  # MODE B: Real API calls for discovery and research phases
  # ============================================================
  - id: phase7-pipeline
    command: USE_DIRECT_API=true bun $HOME/.agents/skills/alygn-outreach/bin/alygn-outreach.ts --type=municipal --action=pipeline --region=costa-rica --limit=5 --dry-run
    description: "Run complete pipeline end-to-end with all VC learnings (Mode B)"
    after: phase6-send
    output:
      file: $HOME/.openclaw/workspace/reports/alygn/muni-pipeline/muni-cr-pipeline-{timestamp}.json

# ============================================================
# ERROR HANDLING & SAFETY
# ============================================================
on_error:
  notify: discord
  channel: "1486784946134712500"
  include_log: true
  halt_on_critical: true
  safety_rules:
    - CC failure: "Log error, continue with send, retry CC separately"
    - Rate limit hit: "Pause 5min, retry with exponential backoff + jitter"
    - Invalid email: "Update municipalities.notes JSONB, continue"
    - Sent tracker miss: "Halt and alert - critical data integrity issue"

# Critical errors that halt the workflow
critical_errors:
  - phase5-5-sent-tracker-check rejection
  - phase6-send failure

# Error handling for CC failures
error_handling:
  cc_failure:
    when: "CC email fails to send"
    action:
      - "Log CC failure with full error details"
      - "Continue with primary send (don't block on CC failure)"
      - "Notify: discord with warning message"
      - "Retry CC separately within 1 hour"
      - "Add notes to outreach_emails record for audit"
    retry:
      max_attempts: 3
      delay_seconds: 60
      strategy: "exponential_backoff"

  rate_limit_hit:
    when: "Email provider rate limit exceeded"
    action:
      - "Pause current batch immediately"
      - "Wait for cooldown period (provider-specific)"
      - "Retry remaining with exponential backoff"
      - "If max retries exceeded, queue for next run"
    retry:
      max_attempts: 5
      initial_delay_seconds: 30
      max_delay_seconds: 300
      strategy: "exponential_backoff_with_jitter"

  validation_failure:
    when: "ZeroBounce blocks email (invalid, do_not_mail, role_based)"
    action:
      - "Update outreach_emails status = 'failed' (if record exists)"
      - "Update municipalities.notes JSONB with failure reason"
      - "Add suggested email patterns to notes for research"
      - "Rotate to next Approved (don't retry same email)"
      - "Schedule deep research for next cycle"
    protocol:
      never_bypass: true
      always_log: true
      notify_on_failure: true

# ============================================================
# RESUMABILITY
# ============================================================
resume:
  enabled: true
  token_file: $HOME/.openclaw/workspace/reports/alygn/muni-cr-resume-token.json
  skip_completed_steps: true

# ============================================================
# NOTIFICATIONS
# ============================================================
notifications:
  on_start:
    channel: discord
    target: "1486784946134712500"
    message: "🏛️ Starting Alygn Municipal Outreach (Costa Rica) - TRAIGA Act focus..."
  on_complete:
    channel: discord
    target: "1486784946134712500"
    message: "✅ Alygn Municipal Outreach (Costa Rica) completed! All 82 cantones processed."
  on_error:
    channel: discord
    target: "1486784946134712500"
    message: "❌ Alygn Municipal Outreach (Costa Rica) workflow failed at step: {{failed_step}}"
  on_rate_limit:
    channel: discord
    target: "1486784946134712500"
    message: "⏸️ Rate limit hit - pausing before retry..."
  on_invalid_email:
    channel: discord
    target: "1486784946134712500"
    message: "⚠️ Invalid email detected - marked in municipalities.notes for research"

# Municipal Personalization Specifications
personalization:
  language: es
  body_text:
    enabled: true
    required: true
    description: "Connect municipality priorities/projects to Alygn governance solutions"
    requirements:
      - "Reference their municipality, recent projects, or stated priorities"
      - "Align with Costa Rican municipal governance needs"
    examples:
      - "Given your work on digital transformation in [Municipio], you understand the governance challenges..."
      - "Your initiative on [project area] aligns with Alygn's approach to transparent governance..."

  ps_section:
    enabled: true
    required: true
    format: |
      {personalized_ps}

      P.S.: Este mensaje fue generado con IA, verificado por humanos. Transparencia total en nuestros procesos.

# IMPORTANT: Email Validation Insights (Updated 2026-03-20)
# Pattern discovered: Generic emails FAIL, Personal emails PASS
#
# ✅ VALID EMAILS (Sent successfully):
#   - josh@luxcapital.com (personal partner email)
#   - michael@m12.vc (personal partner email)
#   - guru@lsvp.com (personal partner email)
#   - albert@usv.com (personal partner email)
#   - harpi@innovationendeavors.com (personal partner email)
#
# ❌ BLOCKED EMAILS (Validation failed):
#   - hello@firstround.com (generic contact)
#   - invest@bvp.com (role-based)
#   - hello@compound.vc (generic contact)
#   - hello@amplifypartners.com (generic contact)
#   - contact@aisafety.ventures (role-based catch-all)
#
# LESSON: Always use personal partner emails (firstname@domain.com)
#         Research partners on LinkedIn before adding to database
#         Generic emails (hello@, invest@, contact@) will FAIL validation
#
# WORKFLOW UPDATE:
#   Phase 2 (Discovery): Research partner names, not just firm emails
#   Phase 3 (Research): Validate email pattern firstname@domain.com
#   Phase 4 (Personalize): Only proceed if personal email confirmed
#   On Validation Failure: Update municipalities.notes JSONB with research notes

# Validation Failure Protocol (Municipal)
validation_failure_protocol:
  when: "Email validation fails for municipal contact"
  action:
    - "Update municipalities.notes JSONB with validation failure details"
    - "Add suggested email patterns for Costa Rica municipalities"
    - "Rotate to next Approved Municipal (don't retry same email)"
    - "For next wave: Research specific mayor email patterns"
  patterns:
    - "alcalde@mun{num}.go.cr"
    - "firstname.lastname@mun{num}.go.cr"
    - "contacto@mun{num}.go.cr (fallback)"
  priority: mayor_emails
  never: "Bypass validation (protects sender reputation)"

# ============================================================
# SUPABASE SCRIPT REFERENCES
# ============================================================
# All database operations use Supabase TypeScript utilities via Bun:
#
# UTILITY SCRIPT:
#   supabase-utils.ts   - Core status operations (Bun runtime)
#     bun $HOME/.agents/skills/alygn-outreach/src/lib/supabase-utils.ts --action=<action>
#
# AVAILABLE ACTIONS:
#   --action=check-sent           - Check if municipality already sent (--muni-id=<id>)
#   --action=validate-email       - Validate email format (--email=<address>)
#   --action=update-research      - Update mayor research (--muni-id=<id> --mayor-name=<name>)
#   --action=update-sent          - Mark as sent (--muni-id=<id> --message-id=<id> --sent-date=<ISO>)
#   --action=log-outreach         - Log outreach email (--muni-id=<id> --input=<file>)
#   --action=query-pending        - Query pending municipalities (--limit=<n>)
#
# INPUT FILE FORMAT:
#   JSON array of objects with relevant fields per action
#
# ENVIRONMENT VARS REQUIRED:
#   (Loaded from $HOME/.openclaw/workspace/config/credentials.json and exported at $HOME/.openclaw/workspace/scripts/shared/load-credentials.js)
#
# EXECUTION PATTERN:
#   bun $HOME/.agents/skills/alygn-outreach/src/lib/supabase-utils.ts --action=<action> [--dry-run]

# ============================================================
# DATABASE REFERENCE CARD (for alygn-outreach CLI)
# ============================================================
database_schema:
  municipalities:
    primary_key: id (UUID)
    key_columns:
      - id, name, country, region, province
      - mayor_name, mayor_email, general_email
      - x_handle, x_url
      - discovered_at, researched_at, verified_at, outreach_sent_at, replied_at
      - x_warmup_phase1_at, x_warmup_phase2_at
      - x_engagement_count, x_last_engagement_at
      - wave_number, priority_score
      - pain_points (TEXT[]), ai_governance_signals (JSONB), notes (JSONB)
    indexes:
      - idx_municipalities_country, idx_municipalities_wave
      - idx_municipalities_status (outreach_sent_at), idx_municipalities_priority
      - idx_municipalities_x_handle, idx_municipalities_discovered

  outreach_emails:
    primary_key: id (UUID)
    foreign_keys:
      - municipality_id → municipalities(id)
    columns:
      - id, municipality_id, variant, subject, body
      - sent_at, message_id, status ('sent','bounced','replied','failed')
      - replied_at, reply_sentiment, reply_body
      - x_warmup_completed, x_engagements_before_email
    indexes:
      - idx_outreach_emails_municipality, idx_outreach_emails_status, idx_outreach_emails_sent_at

  x_engagements:
    primary_key: id (UUID)
    foreign_keys:
      - municipality_id → municipalities(id)
    columns:
      - id, municipality_id, engagement_type ('follow','like','reply','quote')
      - x_handle, x_user_id, tweet_id, content
      - engaged_at, phase (1 or 2)
    indexes:
      - idx_x_engagements_municipality, idx_x_engagements_type, idx_x_engagements_engaged_at

  outreach_templates:
    columns:
      - id, name, variant ('governance'|'institutional'), version
      - subject_template, body_template, is_active
    query: SELECT * FROM outreach_templates WHERE variant=? AND is_active=TRUE ORDER BY version DESC

  views:
    v_pipeline_summary: "wave_number, total_municipalities, researched, verified, sent, replied, reply_rate_percent"
    v_x_warmup_status: "id, name, x_handle, x_warmup_phase1_at, x_warmup_phase2_at, x_engagement_count, warmup_status"
    v_ready_for_email: "municipalities where x_warmup_phase2_at NOT NULL AND outreach_sent_at IS NULL"

# Common SQL patterns - REPLACED with Bun/TypeScript calls:
# NOTE: Direct SQL commands will FAIL against remote Supabase. Use the Bun utilities below.
#
# PATTERN: Check if municipality already emailed
#   OLD: SQL SELECT or supabase-sync.js
#   NEW:  bun supabase-utils.ts --action=check-sent --muni-id=<id>
#
# PATTERN: Get pending municipalities
#   OLD: queryMunicipalitiesByStatus(supabase, 'approved', limit)
#   NEW:  bun supabase-utils.ts --action=query-pending --limit=<n>
#
# PATTERN: Update research status (mayor name)
#   OLD: UPDATE municipalities SET mayor_name=?, researched_at=NOW() WHERE id=?
#   NEW:  bun supabase-utils.ts --action=update-research --muni-id=<id> --mayor-name=<name>
#
# PATTERN: Mark email sent
#   OLD: logOutreachEmail() + upsertMunicipality()
#   NEW:  bun supabase-utils.ts --action=update-sent --muni-id=<id> --message-id=<id> --sent-date=<ISO>
#
# PATTERN: Validation failure
#   OLD: UPDATE municipalities SET notes = jsonb_set(...) WHERE id=?
#   NEW:  bun supabase-utils.ts --action=update-validation --muni-id=<id> --reason=<text>
#
# PATTERN: Log outreach email
#   OLD: INSERT INTO outreach_emails (...)
#   NEW:  bun supabase-utils.ts --action=log-outreach --muni-id=<id> --input=<file>
