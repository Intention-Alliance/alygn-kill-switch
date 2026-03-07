name: cr-pilot
description: Costa Rica municipal outreach pilot (82 cantones)
metadata:
  project: alygn
  region: costa-rica
  wave: 1
  total_municipalities: 82
  skill: alygn-municipal-ai-governance-outreach

# Costa Rica Pilot Workflow
# Tests end-to-end municipal outreach automation

steps:
  # Phase 1: Discovery (Firecrawl)
  - id: phase1-discovery
    command: node scripts/alygn/muni-outreach/discovery/muni-discovery.js --region=cr --limit=82
    description: "Discover all 82 Costa Rican cantones"
    output:
      file: /tmp/muni-cr-discovered.json

  # Phase 2: Research (Firecrawl + Perplexity)
  - id: phase2-research
    command: node scripts/alygn/muni-outreach/research/muni-research.js --input=/tmp/muni-cr-discovered.json --mock
    description: "Research contacts, existing AI governance signals"
    after: phase1-discovery
    output:
      file: /tmp/muni-cr-researched.json

  # Phase 3: Email Verification (ZeroBounce)
  - id: phase3-verify
    command: node scripts/alygn/muni-outreach/sending/verify-emails.js --input=/tmp/muni-cr-researched.json --mock
    description: "Verify mayor/council emails via ZeroBounce"
    after: phase2-research
    output:
      file: /tmp/muni-cr-verified.json

  # Phase 4: Personalization (Grok)
  - id: phase4-personalize
    command: node scripts/alygn/muni-outreach/personalization/muni-personalizer.js --input=/tmp/muni-cr-verified.json --mock
    description: "Generate personalized emails (governance/institutional variants)"
    after: phase3-verify
    output:
      file: /tmp/muni-cr-personalized.json

  # Phase 5: Human Review (Approval Gate - CRITICAL)
  - id: phase5-review
    command: node scripts/alygn/muni-outreach/review/compliance-review.js --input=/tmp/muni-cr-personalized.json
    description: "Human review before sending - APPROVAL REQUIRED"
    after: phase4-personalize
    approval: required
    on_reject: halt
    output:
      file: /tmp/muni-cr-approved.json

  # Phase 6: Database Sync (Supabase)
  - id: phase6-sync-db
    command: node scripts/alygn/muni-outreach/database/supabase-sync.js --input=/tmp/muni-cr-approved.json --mock
    description: "Sync to Supabase alygn_global_muni database"
    after: phase5-review
    output:
      file: /tmp/muni-cr-db-sync.json

  # Phase 7: Email Sending (Smartlead)
  - id: phase7-send
    command: node scripts/alygn/muni-outreach/sending/email-sender.js --input=/tmp/muni-cr-approved.json --mock
    description: "Send emails via Smartlead (multi-domain)"
    after: phase6-sync-db
    approval: optional
    output:
      file: /tmp/muni-cr-sent.json

  # Phase 8: X/Twitter Engagement
  - id: phase8-x-engage
    command: node scripts/alygn/muni-outreach/engagement/x-engager.js --municipalities=/tmp/muni-cr-approved.json --mock
    description: "Follow + engage with municipalities on X/Twitter"
    after: phase7-send
    output:
      file: /tmp/muni-cr-x-engaged.json

  # Phase 9: Discord Reporting
  - id: phase9-report
    command: node scripts/alygn/muni-outreach/reporting/weekly-summary.js --wave=1 --region=cr
    description: "Generate progress report for Discord #annotations"
    after: phase8-x-engage
    output:
      channel: discord
      target: "1466532145257255004"  # #annotations

# Error handling
on_error:
  notify: discord
  channel: "1466532145257255004"
  include_log: true
  halt_on_critical: true

# Critical errors that halt the workflow
critical_errors:
  - phase5-review rejection
  - database sync failure
  - email sending failure (multiple bounces)

# Resumability
resume:
  enabled: true
  token_file: /tmp/muni-cr-resume-token.json
  skip_completed_steps: true

# Notifications
notifications:
  on_start:
    channel: discord
    message: "🦞 Starting CR Pilot municipal outreach workflow..."
  on_complete:
    channel: discord
    message: "✅ CR Pilot workflow completed! Check #annotations for summary."
  on_error:
    channel: discord
    message: "❌ CR Pilot workflow failed at step: {{failed_step}}"
