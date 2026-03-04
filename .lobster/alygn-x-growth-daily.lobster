name: alygn-x-growth-daily
description: Daily Alygn Twitter growth workflow (8 phases)
metadata:
  project: alygn
  twitter: "@aialygn"
  skill: alygn-x-growth

steps:
  # Phase 1: Pre-approved institutional post
  - id: phase1-preapproved
    command: node scripts/alygn/x-growth/content/post-pre-approved.js --limit=1
    description: "Post 1 pre-approved institutional tweet"
    approval: optional
    output:
      file: /tmp/x-growth-phase1-result.json

  # Phase 2: Content generation (Grok)
  - id: phase2-generate
    command: node scripts/alygn/x-growth/content/thread-generator.js --prompts=1,13
    description: "Generate threads and replies using Grok"
    after: phase1-preapproved
    output:
      file: /tmp/x-growth-phase2-markdown.md

  # Phase 3: Parse content (markdown → JSON)
  - id: phase3-parse
    command: node scripts/alygn/x-growth/parser/twitter-content-parser.js --input=/tmp/x-growth-phase2-markdown.md --output=/tmp/x-growth-phase3-workflow.json
    description: "Parse Grok markdown into workflow JSON"
    after: phase2-generate
    output:
      file: /tmp/x-growth-phase3-workflow.json

  # Phase 4: Validate workflow
  - id: phase4-validate
    command: node scripts/alygn/x-growth/parser/workflow-validator.js /tmp/x-growth-phase3-workflow.json
    description: "Validate workflow JSON before posting"
    after: phase3-parse
    approval: required
    on_error: halt

  # Phase 5: Format enforcement
  - id: phase5-format
    command: node scripts/alygn/x-growth/posting/format-enforcer.js --workflow=/tmp/x-growth-phase3-workflow.json --output=/tmp/x-growth-phase5-formatted.json
    description: "Apply mandatory Alygn format to all tweets"
    after: phase4-validate
    output:
      file: /tmp/x-growth-phase5-formatted.json

  # Phase 6: Post original content (X API)
  - id: phase6-post
    command: node scripts/shared/x-growth/x-api-executor.js --workflow=/tmp/x-growth-phase5-formatted.json --dry-run
    description: "Post generated threads to X (dry-run by default, remove --dry-run for live)"
    after: phase5-format
    approval: optional
    output:
      file: /tmp/x-growth-phase6-results.json

  # Phase 7: Browser discovery (trends)
  - id: phase7-discovery
    command: node scripts/alygn/x-growth/posting/twitter-browser-executor.ts --action=explore --output=/tmp/x-growth-phase7-trends.json
    description: "Browse X trends for relevant topics"
    after: phase6-post
    output:
      file: /tmp/x-growth-phase7-trends.json

  # Phase 8: Decision engine (Grok evaluation)
  - id: phase8-decision
    command: node scripts/alygn/x-growth/research/decision-engine.js --trends=/tmp/x-growth-phase7-trends.json
    description: "Evaluate which trends to engage with"
    after: phase7-discovery
    output:
      file: /tmp/x-growth-phase8-decisions.json

  # Phase 9: Post discovery content (replies/quotes)
  - id: phase9-engage
    command: node scripts/shared/x-growth/x-api-executor.js --workflow=/tmp/x-growth-phase8-decisions.json --dry-run
    description: "Post replies and quotes to trending topics (dry-run by default)"
    after: phase8-decision
    approval: optional
    output:
      file: /tmp/x-growth-phase9-results.json

  # Phase 10: Summary report (Discord)
  - id: phase10-summary
    command: node scripts/alygn/x-growth/daily-summary.js --all-phases
    description: "Send summary report to Discord thread"
    after: phase9-engage
    output:
      channel: discord
      target: "1466532145257255004"  # #annotations

# Error handling
on_error:
  notify: discord
  channel: "1466532145257255004"
  include_log: true

# Resumability
resume:
  enabled: true
  token_file: /tmp/x-growth-resume-token.json
