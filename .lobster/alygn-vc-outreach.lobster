name: alygn-campaign
description: Alygn VC outreach campaign with personalization - using alygn-outreach skill
metadata:
  project: alygn
  type: vc-outreach
  wave: {{ LATEST_WAVE_NUMBER + 1 }}
  skill: alygn-outreach
  dependencies:
    - supabase (remote PostgreSQL for duplicate checks)
    - notion (VC tracker database)
    - perplexity (deep research API)
    - firecrawl (web scraping, optional with deepResearch)
    - zerobounce (email validation)
    - smartlead (email sending)

# Wave State File Schema
# Path: $HOME/.openclaw/workspace/reports/alygn/vc-wave-state.json
# {
#   "wave": { "number": 1, "date": "2026-03-26", "nextDate": "2026-04-02", "status": "idle" },
#   "entities": {},
#   "lastRun": "2026-03-26T14:00:00Z",
#   "phaseCompleted": null
# }

# VC Outreach Campaign Workflow
# Uses: $HOME/.agents/skills/alygn-outreach/bin/alygn-outreach.ts
#
# ═══════════════════════════════════════════════════════════════════════════════
# MODE A vs MODE B EXECUTION
# ═══════════════════════════════════════════════════════════════════════════════
#
# MODE A (Dry Run - Default):
#   bun $HOME/.agents/skills/alygn-outreach/bin/alygn-outreach.ts --dry-run
#   → Uses MOCK data for all API calls (Perplexity, email validation, etc.)
#   → Simulated database responses
#   → Safe for testing workflow logic without external API calls
#
# MODE B (Real API + Dry Run):
#   USE_DIRECT_API=true bun $HOME/.agents/skills/alygn-outreach/bin/alygn-outreach.ts --dry-run
#   → Real Perplexity/web_search API calls for research
#   → Real email validation via ZeroBounce
#   → Simulated database responses
#   → Use when you need real research data but don't want to send emails
#
# MODE C (Production - No Flags):
#   bun $HOME/.agents/skills/alygn-outreach/bin/alygn-outreach.ts
#   → Real API calls + real database writes
#   → ACTUAL EMAIL SENDING
#   → Requires explicit approval gates
#
# ═══════════════════════════════════════════════════════════════════════════════
#
# ═══════════════════════════════════════════════════════════════════════════════
# DEEP RESEARCH FLAG
# ═══════════════════════════════════════════════════════════════════════════════
#
# Add --deep-research to any discover/research/pipeline command to enable
# enhanced multi-source research:
#   → Perplexity API for thesis/pain points
#   → Firecrawl for website scraping
#   → web_search for additional signals
#
# Example:
#   USE_DIRECT_API=true bun alygn-outreach.ts --type=vc --action=research --deep-research --dry-run
#
# ═══════════════════════════════════════════════════════════════════════════════
#
# ═══════════════════════════════════════════════════════════════════════════════
# SUPABASE DEPENDENCY
# ═══════════════════════════════════════════════════════════════════════════════
#
# The pipeline now checks Supabase (remote) for duplicate detection in addition
# to local SentEmailTracker. Required env vars:
#   SUPABASE_URL - Supabase project URL
#   SUPABASE_SERVICE_KEY - Service role key for DB access
# These are loaded from ~/.openclaw/workspace/config/credentials.json
# if not set as environment variables.
#
# ═══════════════════════════════════════════════════════════════════════════════

steps:
  # Phase 0: Sync existing VCs to Notion (ensures database is up to date)
  - id: phase0-sync
    command: bun $HOME/.agents/skills/alygn-outreach/src/core/sync-vcs-to-notion.ts
    description: "Sync existing VCs from JSON to Notion database"
    output:
      file: $HOME/.openclaw/workspace/reports/alygn/vc-sync-result.json

  # Phase 1: Discovery (find new VCs)
  # MODE B: USE_DIRECT_API=true enables real Perplexity research instead of mocks
  # Add --deep-research for enhanced multi-source discovery
  - id: phase1-discover
    command: USE_DIRECT_API=true bun $HOME/.agents/skills/alygn-outreach/bin/alygn-outreach.ts --type=vc --action=discover --limit=5 --dry-run
    description: "Discover new VC targets (Mode B: real API calls, simulated DB). Add --deep-research for Perplexity + Firecrawl + web search."
    after: phase0-sync
    output:
      file: $HOME/.openclaw/workspace/reports/alygn/vc-discover/alygn-vc-discovered-{timestamp}.json

  # Phase 2: Validate (validate emails)
  - id: phase2-validate
    command: bun $HOME/.agents/skills/alygn-outreach/bin/alygn-outreach.ts --type=vc --action=validate --limit=5 --dry-run
    description: "Validate discovered VC emails (Mode A: mock validation)"
    after: phase1-discover
    output:
      file: $HOME/.openclaw/workspace/reports/alygn/vc-validate/alygn-vc-validated-{timestamp}.json

  # Phase 2.5: Pre-research duplicate check
  # Build exclusion list from all sources before researching
  # FIXED: Query Notion API instead of local sent-emails.json (stale local data)
  - id: phase2-5-dedup-check
    command: |
      mkdir -p /tmp/alygn-dedup && \
      echo "🔍 Building exclusion list for duplicate prevention..." && \
      NOTION_KEY="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" && \
      NOTION_DB="30b33487-4af6-8106-8cba-d304fdd0b600" && \
      NOTION_VERSION="2022-06-28" && \
      (curl -s -X POST "https://api.notion.com/v1/databases/${NOTION_DB}/query" \
        -H "Authorization: Bearer ${NOTION_KEY}" \
        -H "Notion-Version: ${NOTION_VERSION}" \
        -H "Content-Type: application/json" \
        -d '{"filter": {"or": [{"property": "Status", "status": {"equals": "Contacted"}}, {"property": "Status", "status": {"equals": "Sent"}}]}}' \
        | jq -r '.results[]?.properties.Name.title[0].plain_text // .results[]?.properties["VC Name"].title[0].plain_text // empty' 2>/dev/null | sort -u > /tmp/alygn-dedup/notion-sent-vcs.txt || echo "" > /tmp/alygn-dedup/notion-sent-vcs.txt) && \
      echo "  ✓ Loaded Notion contacted/sent VCs ($(wc -l < /tmp/alygn-dedup/notion-sent-vcs.txt || echo 0) entries)" && \
      (cat ~/.openclaw/workspace/reports/alygn/vc-waves/wave-state.json 2>/dev/null | jq -r '.completedEntities // {} | keys[] as $k | .[$k].vcName // empty' | sort -u > /tmp/alygn-dedup/wave-state-vcs.txt 2>/dev/null || echo "" > /tmp/alygn-dedup/wave-state-vcs.txt) && \
      echo "  ✓ Loaded wave-state.json ($(wc -l < /tmp/alygn-dedup/wave-state-vcs.txt || echo 0) entries)" && \
      cat /tmp/alygn-dedup/notion-sent-vcs.txt /tmp/alygn-dedup/wave-state-vcs.txt 2>/dev/null | grep -v '^$' | sort -u > /tmp/alygn-dedup/exclude-vcs.txt && \
      echo "📊 Total excluded VCs: $(wc -l < /tmp/alygn-dedup/exclude-vcs.txt || echo 0)" && \
      echo "Exclusion list created at: /tmp/alygn-dedup/exclude-vcs.txt"
    description: "Build exclusion list from Notion API (Contacted/Sent) and wave-state.json"
    after: phase2-validate
    output:
      file: /tmp/alygn-dedup/exclude-vcs.txt

  # Phase 3: Research (find emails, pain points)
  # MODE B: USE_DIRECT_API=true enables real Perplexity research for thesis/pain points
  # Note: VCResearchStrategy.ts also performs Notion duplicate check internally
  # Add --deep-research for enhanced multi-source research (Perplexity + Firecrawl + web search)
  - id: phase3-research
    command: USE_DIRECT_API=true bun $HOME/.agents/skills/alygn-outreach/bin/alygn-outreach.ts --type=vc --action=research --limit=5 --dry-run
    description: "Research validated VCs (Mode B: real Perplexity calls for thesis/pain points, with duplicate filtering). Add --deep-research for enhanced multi-source research."
    after: phase2-5-dedup-check
    output:
      file: $HOME/.openclaw/workspace/reports/alygn/vc-research/alygn-vc-researched-{timestamp}.json

  # Phase 4: Personalize (generate personalized content)
  - id: phase4-personalize
    command: bun $HOME/.agents/skills/alygn-outreach/bin/alygn-outreach.ts --type=vc --action=personalize --limit=5 --dry-run
    description: "Generate personalized drafts (Mode A: mock Groq responses)"
    after: phase3-research
    output:
      file: $HOME/.openclaw/workspace/reports/alygn/vc-personalize/alygn-vc-personalized-{timestamp}.json
      # IMPORTANT: Capture entity IDs from this output for Phase 6

  # Phase 5: Review (Human approval required)
  - id: phase5-review
    command: echo "Review drafts in Discord #annotations. Approve/reject in Notion."
    description: "Human approval required. Update Draft Status: Approved/Rejected"
    after: phase4-personalize
    approval: required
    # After approval, user must provide approved entity IDs

  # Phase 6: Send (Production Mode - requires approval)
  # TWO-FILTER SYSTEM + CC + RATE LIMITING + DUPLICATE CHECK:
  #   --draft-status=Approved: Only send if Draft Status is "Approved"
  #   --email-send-to={approved_ids}: Explicit list of VC IDs to send to
  #   --cc=tania@domain.com: CC Tania on all sends
  #   --rate-limit=3: Max 3 emails per run
  #   --dedup=true: Check SentEmailTracker before sending
  # MODE: Production (no --dry-run = real sends)
  - id: phase6-send
    command: bun $HOME/.agents/skills/alygn-outreach/bin/alygn-outreach.ts --type=vc --action=send --draft-status=Approved --email-send-to={approved_ids_from_phase5} --cc=tanialeaidm@gmail.com --rate-limit=3 --dedup=true
    description: "Send ONLY to approved VCs with explicit IDs (two-filter system + CC + rate limit + dedup)"
    after: phase5-review
    approval: required
    # Requires: --draft-status=Approved AND --email-send-to=id1,id2,id3
    rate_limit:
      max_per_run: 3
      strategy: "strict"
    dedup:
      tracker: SentEmailTracker
      field: email_address
      skip_if_found: true
    cc:
      - tanialeaidm@gmail.com
    output:
      file: $HOME/.openclaw/workspace/reports/alygn/vc-sent/alygn-vc-sent-{timestamp}.json

  # Phase 7: Verify (confirm sends completed)
  - id: phase7-verify
    command: bun $HOME/.agents/skills/alygn-outreach/bin/alygn-outreach.ts --type=vc --action=verify
    description: "Verify sends completed, update Notion status, report results"
    after: phase6-send
    output:
      channel: discord
      target: "1466532145257255004"

  # Alternative: Full Pipeline (runs all phases 1-4 in one command)
  # MODE B: Real API calls for discovery and research
  # - id: phase1-pipeline
  #   command: USE_DIRECT_API=true bun $HOME/.agents/skills/alygn-outreach/bin/alygn-outreach.ts --type=vc --action=pipeline --limit=5 --dry-run
  #   description: "Run full pipeline (discover→validate→research→personalize) with real API"

# Error handling
on_error:
  notify: discord
  channel: "1466532145257255004"
  include_log: true
  halt_on_critical: true

# Critical errors that halt the workflow
critical_errors:
  - phase5-review rejection
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
      - "Mark send as 'CC_failed' in tracker for audit"
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
      - "Mark Draft Status = 'Not Sent' in Notion"
      - "Update Status = 'Invalid email'"
      - "Add detailed Notes: why failed + suggested emails to research"
      - "Rotate to next Approved (don't retry same email)"
      - "Schedule deep research for next cycle"
    protocol:
      never_bypass: true
      always_log: true
      notify_on_failure: true

# Resumability
resume:
  enabled: true
  token_file: $HOME/.openclaw/workspace/reports/alygn/vc-campaign-resume-token.json
  skip_completed_steps: true

# Notifications
notifications:
  on_start:
    channel: discord
    target: "1466532145257255004"
    message: "🔧 Starting Alygn VC Campaign with alygn-outreach skill..."
  on_complete:
    channel: discord
    target: "1466532145257255004"
    message: "✅ VC Campaign completed! Check #annotations for summary."
  on_error:
    channel: discord
    target: "1466532145257255004"
    message: "❌ VC Campaign failed at step: {{failed_step}}"

# Personalization Specifications
personalization:
  language: en
  rate_limit: 5 per run and day
  cc: tanialeaidm@gmail.com (all sends)
  dedup: true (SentEmailTracker check)
  two_filter_system:
    - "--draft-status=Approved" (Notion Draft Status = 'Approved')
    - "--email-send-to=id1,id2,id3" (explicit approved entity IDs)
  body_text:
    enabled: true
    required: true
    description: "Include 1-2 sentences connecting recipient's specific work to Alygn"
    requirements:
      - "Reference their investments, thesis, or recent deals"
      - "Must be specific to each VC, not generic"
    examples:
      - "Given your investment in Anthropic, you understand the coordination challenges AI labs face..."
      - "Your thesis on frontier tech aligns with our approach to governance infrastructure..."
      - "Your recent investment in [Company] shows your commitment to AI safety..."

  ps_section:
    enabled: true
    required: true
    description: "Reference specific partner background + default disclaimer"
    format: |
      P.S.: {personalized_ps}. Este mensaje fue generado con IA, verificado por humanos. Transparencia total en nuestros procesos.
    examples:
      - "P.S.: I noticed you studied at Stanford GSB.... Este mensaje fue generado con IA, verificado por humanos. Transparencia total en nuestros procesos."

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
#   On Validation Failure: Mark "Not Sent", add research note with partner names to find

# VALIDATION INSIGHTS (from production)
validation_insights:
  pass_patterns:
    - "firstname@domain.com (personal partner email)"
    - "firstname.lastname@domain.com"
  fail_patterns:
    - "hello@, invest@, contact@ (generic)"
    - "role-based catch-alls"
  lesson: "Always research partner names on LinkedIn before adding to database"  

# Validation Failure Protocol (VC)
validation_failure_protocol:
  when: "ZeroBounce blocks email (invalid, do_not_mail, role_based)"
  action:
    - "Mark VC Draft Status = 'Not Sent' in Notion"
    - "Update Status = 'Invalid email'"
    - "Add detailed Notes: why failed + suggested partner emails to research"
    - "Rotate to next Approved VC (don't retry same email)"
    - "Schedule deep research on failed VC for next cycle"
  next_wave:
    - "Research specific partner names on LinkedIn"
    - "Try pattern: firstname@domain.com or firstname.lastname@domain.com"
    - "Verify email with validation BEFORE adding to database"
  never: "Bypass validation (protects sender reputation)"
