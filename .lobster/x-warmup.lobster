name: x-warmup
description: X/Twitter warmup for municipal outreach - builds familiarity before TRAIGA Act email contact
metadata:
  project: alygn
  skill: x-warmup
  type: engagement
  context: Costa Rica municipal outreach (82 cantones)
  pipeline: warmup → email outreach handoff

# X/Twitter Warmup Workflow
# Phase 1: x-growth discovery → Phase 2-4: x-warmup engagement → Phase 5: mark ready_for_email

steps:
  # ═══════════════════════════════════════════════════════════════════
  # PRELUDE: x-growth Discovery Integration
  # ═══════════════════════════════════════════════════════════════════
  # x-growth skill handles trend analysis and content discovery.
  # Its output feeds into warmup engagement phases.
  # Reference: openclaw invoke --tool x-growth --action daily-growth

  - id: prelude-discovery
    command: openclaw invoke --tool x-growth --action daily-growth --args-json '{"project":"alygn","context":"municipal-outreach"}'
    description: "Run x-growth daily discovery for municipal engagement context"
    output:
      file: /tmp/x-growth-discovery.json
      supabase_table: x_discovery_cache
      supabase_columns: [discovered_at, trends, relevant_accounts, content_angles]
    env:
      X_GROWTH_MODE: discovery_only  # Don't post, just discover

  # ═══════════════════════════════════════════════════════════════════
  # PHASE 1: Scout & Verify Municipal X Accounts
  # ═══════════════════════════════════════════════════════════════════
  - id: phase1-scout
    command: node $HOME/.openclaw/workspace/scripts/alygn/muni-outreach/engagement/x-scout.js --wave=$wave --batch-size=$batch_size
    description: "Discover and VERIFY official X accounts for municipalities"
    after: prelude-discovery
    output:
      file: /tmp/x-scout-wave-$wave.json
      supabase_table: municipalities
      supabase_columns: [x_handle, x_user_id, x_verified, x_website_confirmed, x_topics]

  # ═══════════════════════════════════════════════════════════════════
  # PHASE 2: Verification Safety Checks
  # ═══════════════════════════════════════════════════════════════════
  - id: phase2-verify
    command: node $HOME/.openclaw/workspace/scripts/alygn/muni-outreach/engagement/x-verify-municipality.js --wave=$wave
    description: "Cross-reference X accounts with official municipal websites"
    after: phase1-scout
    safety_checks:
      - Verify X account has official website link in bio
      - Check for verified badge (when available)
      - Flag parody/fan accounts for exclusion
      - Confirm account age > 6 months (avoid new/spam)
    output:
      file: /tmp/x-verified-wave-$wave.json
      supabase_table: municipalities
      supabase_columns: [x_verified, x_safety_status, x_excluded_reason]

  # ═══════════════════════════════════════════════════════════════════
  # PHASE 3: Initial Engagement (Follow + Like)
  # ═══════════════════════════════════════════════════════════════════
  - id: phase3-engage-p1
    command: node $HOME/.openclaw/workspace/scripts/alygn/muni-outreach/engagement/x-warmup-engage.js --wave=$wave --phase=1 --batch-size=$batch_size
    description: "Follow municipalities + like 2-3 recent tweets (Alygn institutional voice)"
    after: phase2-verify
    tone:
      description: "Institutional, restrained, non-promotional. Governance-first positioning."
      examples:
        - "Governance can't be retrofitted at frontier scale"
        - "Trust is harder to scale than technology"
        - "The hardest AI risks are institutional, not technical"
        - "Coordination, not control"
      avoid:
        - Sales language
        - promotional tone
        - urgency tactics
        - direct asks
    rate_limit:
      follows_per_day: 15        # X API best practice
      likes_per_day: 20
      delay_seconds: 30-120       # Natural human-like delays
      jitter: true                 # Randomize delays to avoid automation patterns
    output:
      file: /tmp/x-warmup-phase1-wave-$wave.json
      supabase_table: x_engagements
      supabase_columns: [engagement_type, engaged_at, phase, warmth_delta]

  # Mandatory rest period between engagement phases
  - id: phase3-wait
    wait_hours: 48
    description: "48-hour rest period before Phase 2 (mimics organic interest building)"
    after: phase3-engage-p1

  # ═══════════════════════════════════════════════════════════════════
  # PHASE 4: Deeper Engagement (Quote + Reply)
  # ═══════════════════════════════════════════════════════════════════
  - id: phase4-engage-p2
    command: node $HOME/.openclaw/workspace/scripts/alygn/muni-outreach/engagement/x-warmup-engage.js --wave=$wave --phase=2 --batch-size=$batch_size
    description: "Quote tweet + reply to municipal posts with Alygn governance perspective"
    after: phase3-wait
    tone:
      description: "Same institutional voice, adds value without asking for anything"
      quote_topics:
        - AI governance
        - digital coordination
        - public sector technology
        - institutional trust
      reply_angles:
        - Asking clarifying questions (not making demands)
        - Offering perspective (not selling)
        - Acknowledging complexity (not oversimplifying)
    rate_limit:
      quotes_per_day: 5
      replies_per_day: 10
      delay_seconds: 60-180        # Longer delays for quotes/replies
      jitter: true
    output:
      file: /tmp/x-warmup-phase2-wave-$wave.json
      supabase_table: x_engagements
      supabase_columns: [engagement_type, content, engaged_at, phase, warmth_delta]

  # Mandatory rest before final tracking
  - id: phase4-wait
    wait_hours: 72
    description: "72-hour rest to let engagement settle before final tracking"
    after: phase4-engage-p2

  # ═══════════════════════════════════════════════════════════════════
  # PHASE 5: Warmth Tracking & Scoring
  # ═══════════════════════════════════════════════════════════════════
  - id: phase5-track
    command: node $HOME/.openclaw/workspace/scripts/alygn/muni-outreach/engagement/x-warmup-tracker.js --wave=$wave
    description: "Calculate warmth scores for all engaged municipalities"
    after: phase4-wait
    warmth_calculation:
      factors:
        - follow_count
        - like_count
        - quote_count
        - reply_count
        - mutual_follow
        - profile_visit_count
        - engagement_recency
      threshold:
        min_for_email: 65        # Warmth score threshold before email outreach
        max_days: 14              # Max warmup period (7-14 day target)
    output:
      file: /tmp/x-warmup-tracker-wave-$wave.json
      supabase_table: municipalities
      supabase_columns: [x_warmup_phase1_at, x_warmup_phase2_at, x_warmth_score, x_warmup_completed]

  # ═══════════════════════════════════════════════════════════════════
  # PHASE 6: Handoff to Email Outreach
  # ═══════════════════════════════════════════════════════════════════
  - id: phase6-handoff
    command: node $HOME/.openclaw/workspace/scripts/alygn/muni-outreach/supabase/supabase-sync.js --wave=$wave --action=mark-ready-for-email
    description: "Mark municipalities as ready_for_email in Supabase"
    after: phase5-track
    handoff_criteria:
      warmth_score_gte: 65
      outreach_sent_at_is_null: true
      x_warmup_completed: true
    pipeline_link:
      next_workflow: email-outreach  # Separate lobster picks up here
      supabase_table: municipalities
      supabase_filter: "x_warmup_completed = true AND x_warmth_score >= 65 AND outreach_sent_at IS NULL"
    output:
      supabase_table: municipalities
      supabase_columns: [ready_for_email_at, email_outreach_queued]

# ═══════════════════════════════════════════════════════════════════
# ERROR HANDLING
# ═══════════════════════════════════════════════════════════════════
on_error:
  notify: discord
  channel: "1466532145257255004"
  include_log: true
  halt_on_critical: true
  retry:
    max_attempts: 3
    backoff_seconds: 300

critical_errors:
  - X API suspension warning
  - X API 429 rate limit (3+ occurrences in 1 hour)
  - Supabase write failure
  - Account verification failure (>50% of accounts flagged)

soft_errors:
  - rate_limit_429 (pause and retry after 1 hour)
  - municipality_not_found (skip and log)
  - parody_account_detected (exclude from engagement)

# ═══════════════════════════════════════════════════════════════════
# RATE LIMITS (X API Best Practices)
# ═══════════════════════════════════════════════════════════════════
rate_limits:
  global:
    follows_per_day: 15          # X limit: 400/day but conservative for safety
    likes_per_day: 20            # X limit: 1000/day
    quotes_per_day: 5             # Lower - more visible engagement
    replies_per_day: 10          # X limit: 1000/day
    retweets_per_day: 10          # Conservative
    tweets_per_day: 10            # No posting in warmup mode

  delays:
    between_follows_seconds: 30-120
    between_likes_seconds: 10-30
    between_quotes_seconds: 60-180
    between_replies_seconds: 45-90
    jitter: true                  # Randomize to avoid automation patterns

  anti_automation:
    max_actions_per_hour: 20
    rest_day: sunday             # No engagement on rest day
    active_hours: 8-20           # Waking hours America/Costa_Rica
    skip_weekends: false         # Weekends OK for international accounts

  pause_triggers:
    429_single: pause_1_hour
    429_multiple: pause_24_hours
    suspicious_activity_warning: pause_and_alert

# ═══════════════════════════════════════════════════════════════════
# RESUMABILITY
# ═══════════════════════════════════════════════════════════════════
resume:
  enabled: true
  token_file: /tmp/x-warmup-resume-token.json
  skip_completed_steps: true
  checkpoint_interval: 5          # Save state every 5 steps

# ═══════════════════════════════════════════════════════════════════
# NOTIFICATIONS
# ═══════════════════════════════════════════════════════════════════
notifications:
  on_start:
    channel: discord
    message: "🦞 Starting X warmup for Wave $wave (Alygn municipal outreach)..."
    embed:
      title: "X Warmup Started"
      fields:
        - name: "Phase"
          value: "Discovery → Engagement → Handoff"
        - name: "Target"
          value: "Costa Rica municipalities"
        - name: "Timeline"
          value: "7-14 day warmup period"

  on_phase_complete:
    channel: discord
    message: "📊 Phase {{phase}} complete for Wave $wave: {{engagement_count}} municipalities engaged"

  on_complete:
    channel: discord
    message: |
      ✅ X warmup completed for Wave $wave!
      
      📊 Results:
      • {{engagement_count}} municipalities engaged
      • {{verified_count}} verified official accounts
      • {{warmth_avg}} average warmth score
      • {{ready_for_email_count}} ready for email outreach
      
      🎯 Next: TRAIGA Act email outreach queued

  on_error:
    channel: discord
    message: |
      ❌ X warmup workflow failed at step: {{failed_step}}
      
      🔧 Troubleshooting: Check logs at /tmp/x-warmup-*.log
      ⏸️ Workflow paused - manual intervention may be required

# ═══════════════════════════════════════════════════════════════════
# SCHEDULING
# ═══════════════════════════════════════════════════════════════════
schedule:
  timezone: America/Costa_Rica
  active_hours: 8-20
  skip_weekends: false
  rest_day: sunday
  wave_rotation: sequential       # Process cantones in waves (not all at once)

# ═══════════════════════════════════════════════════════════════════
# PIPELINE INTEGRATION
# ═══════════════════════════════════════════════════════════════════
pipeline:
  upstream: x-growth-discovery    # x-growth provides context
  downstream: email-outreach      # Next lobster handles TRAIGA Act emails

  handoff:
    supabase_table: municipalities
    status_column: outreach_status
    stages:
      - x_discovering
      - x_warming_up
      - x_warmup_complete        # ← x-warmup ends here
      - email_queued
      - email_sent
      - email_follow_up

  success_metrics:
    warmth_score_min: 65
    engagement_diversity: 3+      # At least 3 different engagement types
    account_retention: 80%+        # Accounts still followed after 14 days
