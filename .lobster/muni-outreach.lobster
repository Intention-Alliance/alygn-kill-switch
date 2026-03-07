name: alygn-municipal-discovery
description: Municipal discovery and research workflow (CR pilot - 82 cantones)
metadata:
  project: alygn
  wave: 1
  target: Costa Rica (82 cantones)
  skill: alygn-municipal-ai-governance-outreach

steps:
  # Phase 1: Load municipality list
  - id: load-list
    command: node scripts/alygn/muni-outreach/discovery/load-costa-rica.js
    description: "Load CR cantones list (82 municipalities)"
    output:
      file: /tmp/muni-cr-list.json

  # Phase 2: Discover contact info (Firecrawl)
  - id: discover-contacts
    command: node scripts/alygn/muni-outreach/discovery/scrape-contacts.js --input=/tmp/muni-cr-list.json --output=/tmp/muni-cr-contacts.json
    description: "Scrape municipal websites for contact info"
    after: load-list
    output:
      file: /tmp/muni-cr-contacts.json

  # Phase 3: Verify emails (ZeroBounce)
  - id: verify-emails
    command: node scripts/alygn/muni-outreach/discovery/verify-emails.js --input=/tmp/muni-cr-contacts.json --output=/tmp/muni-cr-verified.json
    description: "Verify email addresses with ZeroBounce"
    after: discover-contacts
    output:
      file: /tmp/muni-cr-verified.json

  # Phase 4: Deep research (Perplexity)
  - id: deep-research
    command: node scripts/alygn/muni-outreach/research/deep-research.js --input=/tmp/muni-cr-verified.json --output=/tmp/muni-cr-research.json
    description: "Research each municipality (mayor, initiatives, AI readiness)"
    after: verify-emails
    output:
      file: /tmp/muni-cr-research.json

  # Phase 5: Personalization (Grok)
  - id: personalize
    command: node scripts/alygn/muni-outreach/personalization/generate.js --input=/tmp/muni-cr-research.json --output=/tmp/muni-cr-personalized.json
    description: "Generate personalized outreach for each municipality"
    after: deep-research
    output:
      file: /tmp/muni-cr-personalized.json

  # Phase 6: Review and approve
  - id: review
    command: node scripts/alygn/muni-outreach/review/prepare-discord.js --input=/tmp/muni-cr-personalized.json
    description: "Prepare review thread in Discord"
    after: personalize
    approval: required
    output:
      channel: discord
      target: "1466532145257255004"

  # Phase 7: Save to Supabase
  - id: save-to-db
    command: node scripts/alygn/muni-outreach/database/save-municipalities.js --input=/tmp/muni-cr-personalized.json
    description: "Save verified municipalities to Supabase"
    after: review
    output:
      file: /tmp/muni-cr-db-results.json

  # Phase 8: Summary report
  - id: summary
    command: node scripts/alygn/muni-outreach/reporting/discovery-summary.js --all-phases
    description: "Post summary to Discord thread"
    after: save-to-db
    output:
      channel: discord
      target: "1466532145257255004"

# Error handling
on_error:
  notify: discord
  channel: "1466532145257255004"
  include_log: true

# Resumability
resume:
  enabled: true
  token_file: /tmp/muni-discovery-resume-token.json
