name: alygn-campaign
description: Alygn VC outreach campaign with personalization - using alygn-outreach skill
metadata:
  project: alygn
  type: vc-outreach
  wave: 1

# VC Outreach Campaign Workflow
# Uses: $HOME/.agents/skills/alygn-outreach/bin/alygn-outreach

steps:
  # Phase 0: Sync existing VCs to Notion (ensures database is up to date)
  - id: phase0-sync
    command: node $HOME/.openclaw/workspace/scripts/alygn/vc-outreach/core/sync-vcs-to-notion.js
    description: "Sync existing VCs from JSON to Notion database"
    output:
      file: /tmp/alygn-vc-sync-result.json

  # Phase 1: Discovery (find new VCs)
  - id: phase1-discover
    command: node $HOME/.agents/skills/alygn-outreach/bin/alygn-outreach --type=vc --action=discover --limit=5 --dry-run
    description: "Discover new VC targets (dry run)"
    after: phase0-sync
    output:
      file: /tmp/alygn-vc-discovered-2026-03-19.json

  # Phase 2: Validate (validate emails)
  - id: phase2-validate
    command: node $HOME/.agents/skills/alygn-outreach/bin/alygn-outreach --type=vc --action=validate --limit=5
    description: "Validate discovered VC emails"
    after: phase1-discover
    output:
      file: /tmp/alygn-vc-validated-2026-03-19.json

  # Phase 3: Research (find emails, pain points)
  - id: phase3-research
    command: node $HOME/.agents/skills/alygn-outreach/bin/alygn-outreach --type=vc --action=research --limit=5
    description: "Research validated VCs (find thesis, pain points)"
    after: phase2-validate
    output:
      file: /tmp/alygn-vc-research-2026-03-19.json

  # Phase 4: Personalize (generate personalized content)
  - id: phase4-personalize
    command: node $HOME/.agents/skills/alygn-outreach/bin/alygn-outreach --type=vc --action=personalize --limit=5
    description: "Generate personalized drafts; Sets Draft Status = 'Drafted' in Notion"
    after: phase3-research
    output:
      file: /tmp/alygn-vc-personalized-{timestamp}.json
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
  - id: phase6-send
    command: node $HOME/.agents/skills/alygn-outreach/bin/alygn-outreach --type=vc --action=send --draft-status=Approved --email-send-to={approved_ids_from_phase5} --cc=tanialeaidm@gmail.com --rate-limit=3 --dedup=true
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
      file: /tmp/alygn-vc-sent-{timestamp}.json

  # Phase 7: Verify (confirm sends completed)
  - id: phase7-verify
    command: node $HOME/.agents/skills/alygn-outreach/bin/alygn-outreach --type=vc --action=verify
    description: "Verify sends completed, update Notion status, report results"
    after: phase6-send
    output:
      channel: discord
      target: "1466532145257255004"

# Alternative: Full Pipeline (runs all phases 1-4 in one command)
# - id: phase1-pipeline
#   command: node $HOME/.agents/skills/alygn-outreach/bin/alygn-outreach --type=vc --action=pipeline --limit=5 --dry-run
#   description: "Run full pipeline (discover→validate→research→personalize)"

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
  token_file: /tmp/vc-campaign-resume-token.json
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
