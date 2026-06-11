name: andler-develops-content
description: End-to-end content pipeline for @andlerdev (Andler Develops). Curates inputs, drafts per-platform, zero-trust scores, auto-publishes X (score≥85), queues LinkedIn/YouTube/TikTok/IG for human approval, syncs Notion.
metadata:
  project: andler-develops
  brand: "@andlerdev"
  skill: andler-develops-content
  type: content-pipeline
  pipeline: curate → draft → score → approve → post

# Andler Develops Content Pipeline
# Fully automatable for X; human-required for LinkedIn, YouTube, TikTok, Instagram.

steps:
  # ═══════════════════════════════════════════════════════════════════
  # STAGE 1: CURATE
  # ═══════════════════════════════════════════════════════════════════
  - id: stage1-curate
    command: node $HOME/.openclaw/workspace/scripts/andler-develops/content/fetch-input.ts --since=$since --source=$source
    description: "Curate inputs: Andler's idea dumps, articles, conversation transcripts"
    input:
      sources: ["discord-annotations", "notion-voice-channel", "manual-dump", "article-url"]
    nda_filter:
      drop_patterns:
        - "alygn"
        - "alyyygn"
        - "aialygn"
        - "bitcash"
        - "masterbots"
        - "tanialeaidm"
        - "alyyygn@gmail"
      fail_action: "halt_and_alert"  # any NDA match → block whole batch + Discord alert
    output:
      file: /tmp/andler-dev-curated-$run_id.json
      schema:
        - id: string
        - topic: string
        - audience_hook: "web3" | "cto" | "eng-lead"
        - source: string
        - raw_text: string
        - sanitized_text: string
        - received_at: iso8601

  # ═══════════════════════════════════════════════════════════════════
  # STAGE 2: DRAFT (per platform)
  # ═══════════════════════════════════════════════════════════════════
  - id: stage2-draft
    command: node $HOME/.openclaw/workspace/scripts/andler-develops/content/draft-content.ts --input=/tmp/andler-dev-curated-$run_id.json --platforms=$platforms
    description: "Generate per-platform drafts with format + voice enforcement"
    after: stage1-curate
    voice_enforcement:
      banned_tokens:
        - "revolutionary"
        - "game-changer"
        - "disruptive"
        - "in today's"
        - "delve into"
        - "leverage"
        - "in order to"
        - "it's important to note"
      em_dash: "strip"          # replace — with rewrite
      not_x_but_y: "kill"        # rephrase "not X but Y" constructions
      ai_disclaimers: "ban"      # "as an AI", "I cannot" → fail
    platforms:
      - id: x-single
        length_max: 280
        hashtag_count: [1, 2]
        cta: "more at @andlerdev"
      - id: x-thread
        post_count: [4, 9]
        numbered: true
        cta_on_final: "link to andler.dev + @andlerdev"
      - id: linkedin
        word_count: [800, 1500]
        hashtag_count: [3, 5]
        cta: "DM if you want the architecture diagram"
      - id: blog-brief
        word_count: [1500, 3000]
        include_seo_meta: true
        include_og_image_plan: true
      - id: youtube
        spoken_minutes: [8, 12]
        structure: ["hook-5s", "context", "act-1", "act-2", "act-3", "cta"]
      - id: tiktok
        spoken_seconds: [30, 60]
        structure: ["hook-1s", "beat-1", "beat-2", "beat-3", "payoff"]
      - id: ig-carousel
        slide_count: [6, 10]
        require_alt_text: true
        caption_hashtag_count: [8, 12]
    output:
      file: /tmp/andler-dev-drafts-$run_id.json
      schema:
        - draft_id: string
        - platform: string
        - body: string
        - hashtags: string[]
        - cta: string
        - asset_plan: object

  # ═══════════════════════════════════════════════════════════════════
  # STAGE 3: SCORE (zero-trust)
  # ═══════════════════════════════════════════════════════════════════
  - id: stage3-score
    command: node $HOME/.openclaw/workspace/scripts/andler-develops/content/score-content.ts --input=/tmp/andler-dev-drafts-$run_id.json
    description: "Zero-trust 0–100 score per draft. Auto-publish threshold: ≥85 for X."
    after: stage2-draft
    scoring:
      dimensions:
        - name: voice_match
          weight: 25
          pass: 20
        - name: brand_guardrails
          weight: 20
          pass: 20
          hard_fail: true
        - name: length
          weight: 10
          tolerance: 0.15
        - name: hook_strength
          weight: 15
          pass: 10
        - name: technical_density
          weight: 15
          pass: 10
        - name: cta_quality
          weight: 10
          pass: 6
        - name: visual_asset_plan
          weight: 5
          optional: true
      auto_publish_threshold: 85
      revise_threshold: 70
    output:
      file: /tmp/andler-dev-scored-$run_id.json
      schema:
        - draft_id: string
        - platform: string
        - score: int
        - breakdown: object
        - decision: "auto-publish" | "human-approve" | "revise" | "reject"

  # ═══════════════════════════════════════════════════════════════════
  # STAGE 4: APPROVE
  # ═══════════════════════════════════════════════════════════════════
  - id: stage4-approve-x
    command: node $HOME/.openclaw/workspace/scripts/andler-develops/content/publish-x.ts --input=/tmp/andler-dev-scored-$run_id.json --auto-only
    description: "Auto-publish X drafts scoring ≥85"
    after: stage3-score
    routing:
      auto_publish:
        platforms: ["x-single", "x-thread"]
        score_gte: 85
      human_approve:
        platforms: ["linkedin", "blog-brief", "youtube", "tiktok", "ig-carousel"]
        all_scores: true
        x_score_lt: 85
    rate_limit:
      posts_per_run: 3
      posts_per_day: 8
      delay_seconds: [60, 180]
      jitter: true
    counter_file: $HOME/.openclaw/workspace/reports/andler-dev/x-daily-counter.json
    output:
      file: /tmp/andler-dev-published-$run_id.json
      schema:
        - draft_id: string
        - platform: string
        - x_post_id: string
        - x_url: string
        - posted_at: iso8601

  - id: stage4-queue-human
    command: node $HOME/.openclaw/workspace/scripts/andler-develops/content/sync-notion-queue.ts --input=/tmp/andler-dev-scored-$run_id.json --queue=human-approval
    description: "Sync drafts requiring human approval to Notion queue + Discord reminder"
    after: stage3-score
    parallel_with: stage4-approve-x
    notion:
      database: "Andler Develops — Content Queue"
      properties:
        - title
        - platform
        - draft
        - score
        - score_breakdown
        - status
        - scheduled_for
        - notes
    discord:
      channel: "1481025610192257134"   # #branding
      ping_user: "andler"
      reminder_cadence:
        - "1h after queue"
        - "9am next day"
        - "24h later if not approved"
    output:
      file: /tmp/andler-dev-queued-$run_id.json

  # ═══════════════════════════════════════════════════════════════════
  # STAGE 5: REPORT
  # ═══════════════════════════════════════════════════════════════════
  - id: stage5-report
    command: node $HOME/.openclaw/workspace/scripts/andler-develops/content/daily-report.ts --run=$run_id
    description: "End-of-run summary: posted / queued / pending / rejected"
    after: [stage4-approve-x, stage4-queue-human]
    report_to:
      - discord: "1481025610192257134"
    metrics:
      - drafts_generated
      - x_auto_published
      - x_pending_approval
      - linkedin_queued
      - blog_briefs_queued
      - youtube_queued
      - tiktok_queued
      - ig_carousels_queued
      - rejected_for_nda
      - rejected_for_voice
      - avg_score
      - top_topic

# ═══════════════════════════════════════════════════════════════════
# SAFETY / ERROR HANDLING
# ═══════════════════════════════════════════════════════════════════
on_error:
  notify: discord
  channel: "1481025610192257134"
  include_log: true
  halt_on_critical: true
  retry:
    max_attempts: 2
    backoff_seconds: 300

critical_errors:
  - NDA pattern match in curated input
  - X API suspension warning
  - X API 429 (3+ in 1 hour)
  - Notion write failure
  - Score hard-fail on brand guardrails (any draft)

soft_errors:
  - rate_limit_429 (pause 1h)
  - draft_score_below_70 (revise)
  - low_engagement_signal (log only)

# ═══════════════════════════════════════════════════════════════════
# RATE LIMITS
# ═══════════════════════════════════════════════════════════════════
rate_limits:
  x:
    posts_per_run: 3
    posts_per_day: 8
    delay_seconds: [60, 180]
    jitter: true
    rest_day: sunday
  notional_queue:
    max_drafts_per_run: 20
  grok_api:
    requests_per_minute: 30
    cooldown_on_429: 60

# ═══════════════════════════════════════════════════════════════════
# NOTIFICATIONS
# ═══════════════════════════════════════════════════════════════════
notifications:
  on_start:
    channel: discord
    target: "1481025610192257134"
    message: "🦞 Andler Develops content run $run_id started: $platforms"
  on_x_publish:
    channel: discord
    target: "1481025610192257134"
    message: "✅ Posted to X: $x_url (score: $score)"
  on_human_queue:
    channel: discord
    target: "1481025610192257134"
    message: "📋 $count drafts queued for human approval (Notion)"
  on_nda_violation:
    channel: discord
    target: "1481025610192257134"
    message: "🚨 HALTED: NDA pattern detected. Run $run_id blocked."
    priority: high
  on_complete:
    channel: discord
    target: "1481025610192257134"
    message: |
      🦞 Andler Develops content run $run_id complete.
      • X posted: $x_auto_published
      • X pending: $x_pending_approval
      • LinkedIn queued: $linkedin_queued
      • Blog briefs: $blog_briefs_queued
      • YouTube: $youtube_queued
      • TikTok: $tiktok_queued
      • IG carousels: $ig_carousels_queued
      • Avg score: $avg_score
      • Top topic: $top_topic

# ═══════════════════════════════════════════════════════════════════
# RESUMABILITY
# ═══════════════════════════════════════════════════════════════════
resume:
  enabled: true
  token_file: /tmp/andler-dev-content-resume-$run_id.json
  skip_completed_steps: true

# ═══════════════════════════════════════════════════════════════════
# SCHEDULING
# ═══════════════════════════════════════════════════════════════════
schedule:
  timezone: America/Costa_Rica
  # Cron-managed at the gateway level, not here.
  # See cron jobs proposal: drafts 8:30am, plan Mon 9am, publish 6pm, report 9pm
  active_hours: [7, 22]
  rest_day: sunday

# ── Notion Database ID (provisioned 2026-06-11) ───────────────────────
# Andler Develops — Content Queue DB id: 37c33487-4af6-81d7-bc9c-dc12acf7d993
# Parent page (under Central Hub): 37c33487-4af6-8190-9fb2-ef6f0c663dea
# API version: 2022-06-28
# Config file: scripts/andler-develops/config.json
