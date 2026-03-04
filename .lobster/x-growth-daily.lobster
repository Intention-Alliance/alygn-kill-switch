name: x-growth-daily
description: General-purpose daily Twitter growth (multi-project)
metadata:
  skill: x-growth
  type: general

# Project must be specified when running
# lobster run x-growth-daily.lobster --args-json '{"project":"myproject"}'

steps:
  # Load project config
  - id: load-config
    command: node scripts/x-growth/load-project.js --project=$project
    description: "Load project configuration"
    output:
      file: /tmp/x-growth-$project-config.json

  # Phase 1: Trend discovery
  - id: discover-trends
    command: node scripts/x-growth/trend-discovery.js --project=$project
    description: "Discover trending topics on X"
    after: load-config
    output:
      file: /tmp/x-growth-$project-trends.json

  # Phase 2: Content generation
  - id: generate-content
    command: node scripts/x-growth/content-generator.js --project=$project --trends=/tmp/x-growth-$project-trends.json
    description: "Generate content using Grok API"
    after: discover-trends
    output:
      file: /tmp/x-growth-$project-content.json

  # Phase 3: Validation
  - id: validate
    command: node scripts/x-growth/format-validator.js /tmp/x-growth-$project-content.json --project=$project
    description: "Validate content format"
    after: generate-content
    approval: optional
    on_error: halt

  # Phase 4: Posting
  - id: post-content
    command: node scripts/x-growth/post.js --project=$project --workflow=/tmp/x-growth-$project-content.json
    description: "Post content to X"
    after: validate
    approval: optional
    output:
      file: /tmp/x-growth-$project-results.json

  # Phase 5: Engagement
  - id: engage
    command: node scripts/x-growth/reply-engine.js --project={{project}}
    description: "Strategic replies and follows"
    after: post-content
    approval: optional
    output:
      file: /tmp/x-growth-{{project}}-engagement.json

  # Phase 6: Reporting
  - id: report
    command: node scripts/x-growth/report.js --project={{project}} --all-results
    description: "Generate daily summary"
    after: engage
    output:
      channel: discord
      target: "{{discord_channel}}"

# Error handling
on_error:
  notify: discord
  include_log: true

# Resumability
resume:
  enabled: true
