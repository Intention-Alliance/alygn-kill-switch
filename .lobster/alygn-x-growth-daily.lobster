name: alygn-x-growth-daily
description: Daily Alygn Twitter growth workflow (12 phases) with wave tracking, zero-trust verification, and posting limits
metadata:
  project: alygn
  twitter: "@aialyygn"
  skill: alygn-x-growth
  wave: 1
  state_file: $HOME/.openclaw/workspace/reports/alygn/x-growth/wave-state.json
  posting_limits:
    max_per_cron: 3
    max_per_day: 8
    counter_file: $HOME/.openclaw/workspace/reports/alygn/x-daily-counter.json
  zero_trust:
    enabled: true
    checks: [veracity, tone, x_rules, variation]
    principle: "Confidence without verification = failure"

# Wave State File Schema
# Path: $HOME/.openclaw/workspace/reports/alygn/x-growth/wave-state.json
# {
#   "wave": { "number": 1, "date": "2026-03-26", "nextDate": "2026-04-02", "status": "idle" },
#   "entities": {},
#   "lastRun": "2026-03-26T14:00:00Z",
#   "phaseCompleted": null
# }

steps:
  # ============================================================
  # WAVE CHECK: Daily X-growth runs, but tracks wave for reporting
  # ============================================================
  - id: wave-check
    command: |
      node -e "
        const fs = require('fs');
        const statePath = '$HOME/.openclaw/workspace/reports/alygn/x-growth/wave-state.json';
        let state = { wave: { number: 1, date: null, nextDate: null, status: 'idle' }, entities: {}, lastRun: null, phaseCompleted: null };
        if (fs.existsSync(statePath)) {
          const raw = fs.readFileSync(statePath, 'utf8');
          state = JSON.parse(raw);
        }
        const now = new Date();
        state.lastRun = now.toISOString();
        state.wave.status = 'running';
        fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
        console.log('WAVE ' + state.wave.number + ' starting. Date: ' + now.toISOString().split('T')[0]);
      "
    description: "Initialize wave state for daily run"
    output:
      file: $HOME/.openclaw/workspace/reports/alygn/x-growth/wave-check.json

  # Phase 1: Pre-approved institutional post
  - id: phase1-preapproved
    command: node scripts/alygn/x-growth/content/post-pre-approved.js --limit=1
    description: "Post 1 pre-approved institutional tweet"
    approval: optional
    after: wave-check
    output:
      file: $HOME/.openclaw/workspace/reports/alygn/x-growth/phase1-result.json
    on_complete:
      script: |
        const fs = require('fs');
        const state = JSON.parse(fs.readFileSync('$HOME/.openclaw/workspace/reports/alygn/x-growth/wave-state.json', 'utf8'));
        state.phaseCompleted = 'phase1-preapproved';
        fs.writeFileSync('$HOME/.openclaw/workspace/reports/alygn/x-growth/wave-state.json', JSON.stringify(state, null, 2));

  # Phase 2: SEO keyword research (NEW - before content generation)
  - id: phase2-seo-keywords
    command: openclaw invoke --tool seo-master --action research-keywords --args-json '{"topic":"AI governance","count":10}'
    description: "Research trending keywords for AI governance content"
    after: phase1-preapproved
    output:
      file: $HOME/.openclaw/workspace/reports/alygn/x-growth/phase2-keywords.json
    on_complete:
      script: |
        const fs = require('fs');
        const state = JSON.parse(fs.readFileSync('$HOME/.openclaw/workspace/reports/alygn/x-growth/wave-state.json', 'utf8'));
        state.phaseCompleted = 'phase2-seo-keywords';
        fs.writeFileSync('$HOME/.openclaw/workspace/reports/alygn/x-growth/wave-state.json', JSON.stringify(state, null, 2));

  # Phase 2b: Content generation (Grok) with SEO keywords
  - id: phase2-generate
    command: node scripts/alygn/x-growth/content/thread-generator.js --prompts=1,13 --keywords-file=$HOME/.openclaw/workspace/reports/alygn/x-growth/phase2-keywords.json
    description: "Generate threads and replies using Grok with SEO keywords"
    after: phase2-seo-keywords
    output:
      file: $HOME/.openclaw/workspace/reports/alygn/x-growth/phase2-markdown.md
    on_complete:
      script: |
        const fs = require('fs');
        const state = JSON.parse(fs.readFileSync('$HOME/.openclaw/workspace/reports/alygn/x-growth/wave-state.json', 'utf8'));
        state.phaseCompleted = 'phase2-generate';
        fs.writeFileSync('$HOME/.openclaw/workspace/reports/alygn/x-growth/wave-state.json', JSON.stringify(state, null, 2));

  # Phase 3: Parse content (markdown → JSON)
  - id: phase3-parse
    command: node scripts/alygn/x-growth/parser/twitter-content-parser.js --input=$HOME/.openclaw/workspace/reports/alygn/x-growth/phase2-markdown.md --output=$HOME/.openclaw/workspace/reports/alygn/x-growth/phase3-workflow.json
    description: "Parse Grok markdown into workflow JSON"
    after: phase2-generate
    output:
      file: $HOME/.openclaw/workspace/reports/alygn/x-growth/phase3-workflow.json
    on_complete:
      script: |
        const fs = require('fs');
        const state = JSON.parse(fs.readFileSync('$HOME/.openclaw/workspace/reports/alygn/x-growth/wave-state.json', 'utf8'));
        state.phaseCompleted = 'phase3-parse';
        fs.writeFileSync('$HOME/.openclaw/workspace/reports/alygn/x-growth/wave-state.json', JSON.stringify(state, null, 2));

  # Phase 4: Validate workflow
  - id: phase4-validate
    command: node scripts/alygn/x-growth/parser/workflow-validator.js $HOME/.openclaw/workspace/reports/alygn/x-growth/phase3-workflow.json
    description: "Validate workflow JSON before posting"
    after: phase3-parse
    approval: required
    on_error: halt
    output:
      file: $HOME/.openclaw/workspace/reports/alygn/x-growth/phase4-validated.json
    on_complete:
      script: |
        const fs = require('fs');
        const state = JSON.parse(fs.readFileSync('$HOME/.openclaw/workspace/reports/alygn/x-growth/wave-state.json', 'utf8'));
        state.phaseCompleted = 'phase4-validate';
        fs.writeFileSync('$HOME/.openclaw/workspace/reports/alygn/x-growth/wave-state.json', JSON.stringify(state, null, 2));

  # Phase 5: Format enforcement
  - id: phase5-format
    command: node scripts/alygn/x-growth/posting/format-enforcer.js --workflow=$HOME/.openclaw/workspace/reports/alygn/x-growth/phase3-workflow.json --output=$HOME/.openclaw/workspace/reports/alygn/x-growth/phase5-formatted.json
    description: "Apply mandatory Alygn format to all tweets"
    after: phase4-validate
    output:
      file: $HOME/.openclaw/workspace/reports/alygn/x-growth/phase5-formatted.json
    on_complete:
      script: |
        const fs = require('fs');
        const state = JSON.parse(fs.readFileSync('$HOME/.openclaw/workspace/reports/alygn/x-growth/wave-state.json', 'utf8'));
        state.phaseCompleted = 'phase5-format';
        fs.writeFileSync('$HOME/.openclaw/workspace/reports/alygn/x-growth/wave-state.json', JSON.stringify(state, null, 2));

  # Phase 5.5: ZERO-TRUST VERIFICATION (NEW)
  # Every candidate MUST pass ALL checks: veracity, tone, X rules, variation
  # "Confidence without verification = failure"
  - id: phase5-5-zerotrust
    command: node scripts/alygn/x-growth/posting/zero-trust-verifier.js --input=$HOME/.openclaw/workspace/reports/alygn/x-growth/phase5-formatted.json --output=$HOME/.openclaw/workspace/reports/alygn/x-growth/phase5-5-verified.json --previous=$HOME/.openclaw/workspace/reports/alygn/x-growth/phase6-results.json
    description: "Zero-trust verification: reject candidates that fail veracity, tone, X rules, or variation checks"
    after: phase5-format
    on_error: warn
    output:
      file: $HOME/.openclaw/workspace/reports/alygn/x-growth/phase5-5-verified.json
    on_complete:
      script: |
        const fs = require('fs');
        const state = JSON.parse(fs.readFileSync('$HOME/.openclaw/workspace/reports/alygn/x-growth/wave-state.json', 'utf8'));
        state.phaseCompleted = 'phase5-5-zerotrust';
        // Store verification stats for reporting
        try {
          const verified = JSON.parse(fs.readFileSync('$HOME/.openclaw/workspace/reports/alygn/x-growth/phase5-5-verified.json', 'utf8'));
          state.zeroTrustStats = {
            total: verified.total_candidates,
            passed: verified.passed.length,
            rejected: verified.rejected.length,
            summary: verified.summary
          };
        } catch(e) {}
        fs.writeFileSync('$HOME/.openclaw/workspace/reports/alygn/x-growth/wave-state.json', JSON.stringify(state, null, 2));

  # Phase 5.6: DAILY COUNTER CHECK (NEW)
  # Check if we can post today, enforce max_per_cron=3 and max_per_day=8
  - id: phase5-6-counter
    command: node scripts/alygn/x-growth/posting/daily-counter.js --check > $HOME/.openclaw/workspace/reports/alygn/x-growth/phase5-6-counter.json
    description: "Check daily post counter - enforce max 3/cron, 8/day limits"
    after: phase5-5-zerotrust
    output:
      file: $HOME/.openclaw/workspace/reports/alygn/x-growth/phase5-6-counter.json
    on_complete:
      script: |
        const fs = require('fs');
        const state = JSON.parse(fs.readFileSync('$HOME/.openclaw/workspace/reports/alygn/x-growth/wave-state.json', 'utf8'));
        state.phaseCompleted = 'phase5-6-counter';
        try {
          const counter = JSON.parse(fs.readFileSync('$HOME/.openclaw/workspace/reports/alygn/x-growth/phase5-6-counter.json', 'utf8'));
          state.counterStatus = counter;
        } catch(e) {}
        fs.writeFileSync('$HOME/.openclaw/workspace/reports/alygn/x-growth/wave-state.json', JSON.stringify(state, null, 2));

  # Phase 6: Post original content (X API) - WITH LIMITS
  # Now respects: max_per_cron=3, max_per_day=8
  # Only posts verified candidates, limited by daily counter
  - id: phase6-post
    command: |
      # Read counter status
      COUNTER_JSON=$(cat $HOME/.openclaw/workspace/reports/alygn/x-growth/phase5-6-counter.json 2>/dev/null || echo '{}')
      CAN_POST=$(echo "$COUNTER_JSON" | node -e "const d=require('fs').readFileSync(0,'utf8');const j=JSON.parse(d);console.log(j.can_post!==false?j.max_this_cron||3:0)")
      
      if [ "$CAN_POST" = "0" ]; then
        echo '{"skipped":true,"reason":"daily_limit_reached"}' > $HOME/.openclaw/workspace/reports/alygn/x-growth/phase6-results.json
        echo "🚫 Daily post limit reached - skipping phase6"
      else
        # Post only verified + limited candidates
        bun scripts/shared/x-growth/x-api-executor.js --workflow=$HOME/.openclaw/workspace/reports/alygn/x-growth/phase5-5-verified.json --live --max-posts=$CAN_POST
        # Increment counter
        node scripts/alygn/x-growth/posting/daily-counter.js --increment=$CAN_POST
      fi
    description: "Post verified threads to X (live mode, limited by daily counter)"
    after: phase5-6-counter
    approval: optional
    output:
      file: $HOME/.openclaw/workspace/reports/alygn/x-growth/phase6-results.json
    on_complete:
      script: |
        const fs = require('fs');
        const state = JSON.parse(fs.readFileSync('$HOME/.openclaw/workspace/reports/alygn/x-growth/wave-state.json', 'utf8'));
        state.phaseCompleted = 'phase6-post';
        fs.writeFileSync('$HOME/.openclaw/workspace/reports/alygn/x-growth/wave-state.json', JSON.stringify(state, null, 2));

  # Phase 6.5: Browser snapshot (preparation)
  - id: phase6-snapshot
    command: bash scripts/alygn/x-growth/research/browser-snapshot.sh
    description: "Take browser snapshot of X.com /explore"
    after: phase6-post
    output:
      file: $HOME/.openclaw/workspace/reports/alygn/x-explore-snapshot.txt
    on_complete:
      script: |
        const fs = require('fs');
        const state = JSON.parse(fs.readFileSync('$HOME/.openclaw/workspace/reports/alygn/x-growth/wave-state.json', 'utf8'));
        state.phaseCompleted = 'phase6-snapshot';
        fs.writeFileSync('$HOME/.openclaw/workspace/reports/alygn/x-growth/wave-state.json', JSON.stringify(state, null, 2));

  # Phase 7: Browser discovery (trends)
  - id: phase7-discovery
    command: bun scripts/alygn/x-growth/research/browser-explore.js $HOME/.openclaw/workspace/reports/alygn/x-explore-snapshot.txt
    description: "Parse X trends from browser snapshot"
    after: phase6-snapshot
    output:
      file: $HOME/.openclaw/workspace/reports/alygn/x-growth/phase7-trends.json
    on_complete:
      script: |
        const fs = require('fs');
        const state = JSON.parse(fs.readFileSync('$HOME/.openclaw/workspace/reports/alygn/x-growth/wave-state.json', 'utf8'));
        state.phaseCompleted = 'phase7-discovery';
        fs.writeFileSync('$HOME/.openclaw/workspace/reports/alygn/x-growth/wave-state.json', JSON.stringify(state, null, 2));

  # Phase 8: Decision engine (Grok evaluation)
  - id: phase8-decision
    command: node scripts/alygn/x-growth/research/decision-engine.js --trends=$HOME/.openclaw/workspace/reports/alygn/x-growth/phase7-trends.json
    description: "Evaluate which trends to engage with"
    after: phase7-discovery
    output:
      file: $HOME/.openclaw/workspace/reports/alygn/x-growth/phase8-decisions.json
    on_complete:
      script: |
        const fs = require('fs');
        const state = JSON.parse(fs.readFileSync('$HOME/.openclaw/workspace/reports/alygn/x-growth/wave-state.json', 'utf8'));
        state.phaseCompleted = 'phase8-decision';
        fs.writeFileSync('$HOME/.openclaw/workspace/reports/alygn/x-growth/wave-state.json', JSON.stringify(state, null, 2));

  # Phase 8.5: Zero-trust verification for engagement content (NEW)
  - id: phase8-5-zerotrust-engage
    command: node scripts/alygn/x-growth/posting/zero-trust-verifier.js --input=$HOME/.openclaw/workspace/reports/alygn/x-growth/phase8-decisions.json --output=$HOME/.openclaw/workspace/reports/alygn/x-growth/phase8-5-verified-engage.json --previous=$HOME/.openclaw/workspace/reports/alygn/x-growth/phase9-results.json
    description: "Zero-trust verification for engagement content (replies/quotes)"
    after: phase8-decision
    on_error: warn
    output:
      file: $HOME/.openclaw/workspace/reports/alygn/x-growth/phase8-5-verified-engage.json
    on_complete:
      script: |
        const fs = require('fs');
        const state = JSON.parse(fs.readFileSync('$HOME/.openclaw/workspace/reports/alygn/x-growth/wave-state.json', 'utf8'));
        state.phaseCompleted = 'phase8-5-zerotrust-engage';
        fs.writeFileSync('$HOME/.openclaw/workspace/reports/alygn/x-growth/wave-state.json', JSON.stringify(state, null, 2));

  # Phase 9: Post discovery content (replies/quotes) with browser fallback - WITH LIMITS
  - id: phase9-engage
    command: |
      # Check remaining daily budget before engagement
      COUNTER_JSON=$(cat $HOME/.openclaw/workspace/reports/alygn/x-daily-counter.json 2>/dev/null || echo '{}')
      REMAINING=$(echo "$COUNTER_JSON" | node -e "const d=require('fs').readFileSync(0,'utf8');const j=JSON.parse(d);console.log(Math.max(0,8-(j.posts_today||0)))")
      
      if [ "$REMAINING" = "0" ]; then
        echo '{"skipped":true,"reason":"daily_limit_reached"}' > $HOME/.openclaw/workspace/reports/alygn/x-growth/phase9-results.json
        echo "🚫 Daily post limit reached - skipping phase9 engagement"
      else
        # Try X API first, fallback to browser automation on 403
        bun scripts/shared/x-growth/x-api-executor.js --workflow=$HOME/.openclaw/workspace/reports/alygn/x-growth/phase8-5-verified-engage.json --live --engagement-mode --max-posts=$REMAINING 2>&1 || \
        (echo "API failed, using browser automation..." && \
         bun ~/.agents/skills/alygn-x-persona-automation/src/browser-engagement.ts --workflow=$HOME/.openclaw/workspace/reports/alygn/x-growth/phase8-5-verified-engage.json --engagement-mode)
        # Increment counter for engagement posts
        node scripts/alygn/x-growth/posting/daily-counter.js --status
      fi
    description: "Post verified replies/quotes to trending topics (X API → Browser fallback, limited by daily counter)"
    after: phase8-5-zerotrust-engage
    approval: optional
    output:
      file: $HOME/.openclaw/workspace/reports/alygn/x-growth/phase9-results.json
    on_complete:
      script: |
        const fs = require('fs');
        const state = JSON.parse(fs.readFileSync('$HOME/.openclaw/workspace/reports/alygn/x-growth/wave-state.json', 'utf8'));
        state.phaseCompleted = 'phase9-engage';
        fs.writeFileSync('$HOME/.openclaw/workspace/reports/alygn/x-growth/wave-state.json', JSON.stringify(state, null, 2));

  # Phase 10: Summary report (Discord) - ENHANCED with verification stats
  - id: phase10-summary
    command: |
      # Build enhanced report with zero-trust and counter stats
      node scripts/alygn/x-growth/daily-summary.js --all-phases --with-verification-stats --with-counter-status
    description: "Send enhanced summary report to Discord (includes verification + counter stats)"
    after: phase9-engage
    output:
      channel: discord
      target: "1466532145257255004"
    on_complete:
      script: |
        const fs = require('fs');
        const state = JSON.parse(fs.readFileSync('$HOME/.openclaw/workspace/reports/alygn/x-growth/wave-state.json', 'utf8'));
        state.phaseCompleted = 'phase10-summary';
        state.wave.status = 'completed';
        state.wave.nextDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        fs.writeFileSync('$HOME/.openclaw/workspace/reports/alygn/x-growth/wave-state.json', JSON.stringify(state, null, 2));

# ============================================================
# RESUME CAPABILITY
# ============================================================
resume:
  enabled: true
  state_file: $HOME/.openclaw/workspace/reports/alygn/x-growth/wave-state.json
  skip_completed_phases: true

# ============================================================
# NOTIFICATIONS
# ============================================================
notifications:
  on_start:
    channel: discord
    target: "1466532145257255004"
    message: "🐦 Starting Wave {{wave.number}} X-Growth Daily..."
  on_phase_complete:
    channel: discord
    target: "1466532145257255004"
    message: "✅ Phase {{phase}} completed."
  on_complete:
    channel: discord
    target: "1466532145257255004"
    message: "✅ Wave {{wave.number}} X-Growth Daily COMPLETE. Next run: {{wave.nextDate}}"
  on_error:
    channel: discord
    target: "1466532145257255004"
    message: "❌ X-Growth failed at {{phase}}: {{error}}"

# Error handling
on_error:
  notify: discord
  channel: "1466532145257255004"
  include_log: true
  script: |
    const fs = require('fs');
    const state = JSON.parse(fs.readFileSync('$HOME/.openclaw/workspace/reports/alygn/x-growth/wave-state.json', 'utf8'));
    state.wave.status = 'error';
    state.lastError = '{{error}}';
    fs.writeFileSync('$HOME/.openclaw/workspace/reports/alygn/x-growth/wave-state.json', JSON.stringify(state, null, 2));

# Resumability (defined above)
