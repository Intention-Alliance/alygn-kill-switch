name: x-warmup
description: Automated X/Twitter engagement for municipal outreach warmup
metadata:
  project: alygn
  skill: x-warmup
  type: engagement

# X/Twitter Warmup Workflow
# Automated engagement to build familiarity before email outreach

steps:
  # Phase 1: X Account Discovery (Grok API)
  - id: phase1-scout
    command: node scripts/alygn/muni-outreach/engagement/x-scout.js --wave=$wave --batch-size=$batch_size
    description: "Discover official X accounts for municipalities using Grok API"
    output:
      file: /tmp/x-scout-wave-$wave.json
      supabase_table: municipalities
      supabase_columns: [x_handle, x_user_id, x_topics]

  # Phase 2: X Engagement Phase 1 (Follow + Like)
  - id: phase2-engage-p1
    command: node scripts/alygn/muni-outreach/engagement/x-warmup-engage.js --wave=$wave --phase=1 --batch-size=$batch_size
    description: "Follow municipalities + like 2-3 recent tweets"
    after: phase1-scout
    rate_limit:
      follows_per_day: 15
      likes_per_day: 20
      delay_seconds: 30-120
    output:
      file: /tmp/x-warmup-phase1-wave-$wave.json
      supabase_table: x_engagements
      supabase_columns: [engagement_type, engaged_at, phase]

  # Wait 24-48 hours between phases
  - id: phase2-wait
    wait_hours: 24
    description: "Wait 24-48 hours before Phase 2 engagement"
    after: phase2-engage-p1

  # Phase 3: X Engagement Phase 2 (Quote + Reply)
  - id: phase3-engage-p2
    command: node scripts/alygn/muni-outreach/engagement/x-warmup-engage.js --wave=$wave --phase=2 --batch-size=$batch_size
    description: "Quote tweet + reply to municipal posts with Alygn perspective"
    after: phase2-wait
    rate_limit:
      quotes_per_day: 5
      replies_per_day: 10
      delay_seconds: 60-180
    output:
      file: /tmp/x-warmup-phase2-wave-$wave.json
      supabase_table: x_engagements
      supabase_columns: [engagement_type, content, engaged_at, phase]

  # Phase 4: Warmth Tracking
  - id: phase4-track
    command: node scripts/alygn/muni-outreach/engagement/x-warmup-tracker.js --wave=$wave
    description: "Calculate warmth scores for all engaged municipalities"
    after: phase3-engage-p2
    output:
      file: /tmp/x-warmup-tracker-wave-$wave.json
      supabase_table: municipalities
      supabase_columns: [x_warmup_phase1_at, x_warmup_phase2_at, x_engagement_count, x_warmup_completed]

  # Phase 5: Mark Ready for Email
  - id: phase5-ready
    command: node scripts/alygn/muni-outreach/supabase/supabase-sync.js --wave=$wave --action=mark-ready-for-email
    description: "Mark municipalities as ready for email outreach (X warmup complete)"
    after: phase4-track
    output:
      supabase_table: municipalities
      supabase_filter: "x_warmup_completed = true AND outreach_sent_at IS NULL"

# Error handling
on_error:
  notify: discord
  channel: "1466532145257255004"
  include_log: true
  halt_on_critical: true

# Critical errors that halt the workflow
critical_errors:
  - X API suspension warning
  - X API 429 rate limit (multiple occurrences)
  - Supabase write failure

# Resumability
resume:
  enabled: true
  token_file: /tmp/x-warmup-resume-token.json
  skip_completed_steps: true

# Notifications
notifications:
  on_start:
    channel: discord
    message: "🦞 Starting X warmup workflow for Wave $wave..."
  on_complete:
    channel: discord
    message: "✅ X warmup completed for Wave $wave! {{engagement_count}} municipalities engaged. Ready for email outreach."
  on_error:
    channel: discord
    message: "❌ X warmup workflow failed at step: {{failed_step}}. Check logs for details."

# Rate Limiting (Global)
rate_limits:
  follows_per_day: 15
  likes_per_day: 20
  replies_per_day: 10
  quotes_per_day: 5
  retweets_per_day: 10
  delay_between_actions_seconds: 30-120
  auto_pause_on_429: true
  pause_duration_hours: 24

# Scheduling
schedule:
  timezone: America/Costa_Rica
  active_hours: 8-20  # Waking hours in target timezone
  skip_weekends: false
  rest_day: sunday  # One day per week with no engagement
