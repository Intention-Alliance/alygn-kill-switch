name: alygn-grant-discovery
version: "1.0.0"
description: |
  Automated AI safety grant discovery, deep research, and ALYGN alignment validation.
  Discovers grants from multiple sources (Grok, Perplexity, web_fetch),
  validates ALYGN fit, updates Notion, and notifies team.

args:
  dry_run:
    type: boolean
    default: true
    description: Run in simulation mode without making changes
  limit:
    type: number
    default: 50
    description: Maximum number of grants to process
  focus:
    type: string
    default: "all"
    description: Focus areas to prioritize (comma-separated)

env:
  NOTION_API_KEY: ${notion.apiKey}
  NOTION_DATABASE_ID: "32c334874af68130b265de7464a51a72"
  EMAIL_ADDRESS: ${email.address}
  EMAIL_PASSWORD: ${email.smtp.password}
  GROK_API_KEY: ${grok.apiKey}
  FIRECRAWL_API_KEY: ${firecrawl.apiKey}
  PERPLEXITY_API_KEY: ${perplexity.apiKey}

steps:
  # Step 1: Discover grants from multiple sources
  - id: discover
    name: Discover grants from Grok, Perplexity, and web sources
    command: |
      cd $HOME/.agents/skills/alygn-grant-discovery && \
      bun run src/index.ts discover \
        --grants="Foresight Institute,AISI Challenge Fund,ARM Fund,Frontier Model Forum" \
        --sources=grok,perplexity,web_fetch \
        --limit=${args.limit} \
        --dry-run=${args.dry_run}
    timeout: 1800
    retries: 2
    on_error: continue

  # Step 2: Deep research on discovered grants
  - id: research
    name: Deep research with cross-validation
    command: |
      cd $HOME/.agents/skills/alygn-grant-discovery && \
      bun run src/index.ts research \
        --input=$discover.stdout
    stdin: $discover.stdout
    timeout: 3600
    retries: 2
    when: $discover.success

  # Step 3: Validate ALYGN alignment
  - id: validate
    name: Validate ALYGN fit and calculate alignment scores
    command: |
      cd $HOME/.agents/skills/alygn-grant-discovery && \
      bun run src/index.ts validate \
        --input=$research.stdout
    stdin: $research.stdout
    timeout: 600
    when: $research.success

  # Step 4: Sync to Notion
  - id: sync
    name: Sync grants to Notion database
    command: |
      cd $HOME/.agents/skills/alygn-grant-discovery && \
      bun run src/index.ts sync \
        --input=$validate.stdout
    stdin: $validate.stdout
    timeout: 300
    when: $validate.success
    approval: required

  # Step 5: Send summary email to Tania
  - id: notify
    name: Send discovery summary to Tania
    command: |
      cd $HOME/.agents/skills/alygn-grant-discovery && \
      bun run src/index.ts notify \
        --type=discovery_summary \
        --input=$sync.stdout
    stdin: $sync.stdout
    timeout: 60
    when: $sync.approved

  # Step 6: Discord notification
  - id: discord_notify
    name: Notify Discord channel
    command: |
      cd $HOME/.agents/skills/alygn-grant-discovery && \
      bun run src/index.ts notify \
        --type=discord_summary \
        --input=$sync.stdout
    stdin: $sync.stdout
    timeout: 30
    when: $sync.approved

# Schedule definitions
schedules:
  weekly_discovery:
    cron: "0 9 * * 1"
    timezone: "America/Costa_Rica"
    description: "Weekly deep discovery - Monday 9 AM"
    args:
      dry_run: false
      limit: 50

  daily_monitor:
    cron: "0 8 * * *"
    timezone: "America/Costa_Rica"
    description: "Daily deadline monitoring - 8 AM"
    args:
      dry_run: false
      limit: 100

  email_check:
    cron: "0 */4 * * *"
    timezone: "America/Costa_Rica"
    description: "Email monitoring for Tania's replies - every 4 hours"
    args:
      dry_run: false
      limit: 20

  monthly_archive:
    cron: "0 10 1 * *"
    timezone: "America/Costa_Rica"
    description: "Monthly closed grant archival - 1st of month 10 AM"
    args:
      dry_run: false
      limit: 200

# Alternative: Simple daily check workflow
tasks:
  daily_check:
    name: Quick daily grant check
    steps:
      - id: check_deadlines
        command: |
          cd $HOME/.agents/skills/alygn-grant-discovery && \
          bun run src/index.ts monitor \
            --alert-within-days=30
        timeout: 300
      
      - id: send_alerts
        command: |
          cd $HOME/.agents/skills/alygn-grant-discovery && \
          bun run src/index.ts notify \
            --type=deadline_alert
        timeout: 60
        when: $check_deadlines.success

  check_tania_email:
    name: Monitor Tania's email for replies
    steps:
      - id: check_email
        command: |
          cd $HOME/.agents/skills/alygn-grant-discovery && \
          bun run src/index.ts check-email \
            --imap-host=imap.gmail.com \
            --email=alyyygn@gmail.com \
            --password=${email.smtp.password} \
            --keywords="Grant,Schmidt,Coefficient,Application,Research,ALYGN"
        timeout: 120
      
      - id: process_replies
        command: |
          cd $HOME/.agents/skills/alygn-grant-discovery && \
          bun run src/index.ts process-replies \
            --input=$check_email.stdout
        stdin: $check_email.stdout
        timeout: 60
        when: $check_email.success
      
      - id: report_to_discord
        command: |
          cd $HOME/.agents/skills/alygn-grant-discovery && \
          bun run src/index.ts notify \
            --type=tania_reply \
            --input=$process_replies.stdout
        stdin: $process_replies.stdout
        timeout: 30
        when: $process_replies.success
        approval: optional
