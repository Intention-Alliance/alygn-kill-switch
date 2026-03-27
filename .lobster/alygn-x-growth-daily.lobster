name: alygn-x-growth-daily
description: Daily Alygn Twitter growth workflow (8 phases) with wave tracking
metadata:
  project: alygn
  twitter: "@aialygn"
  skill: alygn-x-growth
  wave: 1
  state_file: $HOME/.openclaw/workspace/reports/alygn/x-growth/wave-state.json

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

  # Phase 2: Content generation (Grok)
  - id: phase2-generate
    command: node scripts/alygn/x-growth/content/thread-generator.js --prompts=1,13
    description: "Generate threads and replies using Grok"
    after: phase1-preapproved
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

  # Phase 6: Post original content (X API)
  - id: phase6-post
    command: bun scripts/shared/x-growth/x-api-executor.js --workflow=$HOME/.openclaw/workspace/reports/alygn/x-growth/phase5-formatted.json --live
    description: "Post generated threads to X (live mode)"
    after: phase5-format
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

  # Phase 9: Post discovery content (replies/quotes)
  - id: phase9-engage
    command: bun scripts/shared/x-growth/x-api-executor.js --workflow=$HOME/.openclaw/workspace/reports/alygn/x-growth/phase8-decisions.json --live --engagement-mode
    description: "Post replies and quotes to trending topics (max 2-4 engagements/day)"
    after: phase8-decision
    approval: optional
    output:
      file: $HOME/.openclaw/workspace/reports/alygn/x-growth/phase9-results.json
    on_complete:
      script: |
        const fs = require('fs');
        const state = JSON.parse(fs.readFileSync('$HOME/.openclaw/workspace/reports/alygn/x-growth/wave-state.json', 'utf8'));
        state.phaseCompleted = 'phase9-engage';
        fs.writeFileSync('$HOME/.openclaw/workspace/reports/alygn/x-growth/wave-state.json', JSON.stringify(state, null, 2));

  # Phase 10: Summary report (Discord)
  - id: phase10-summary
    command: node scripts/alygn/x-growth/daily-summary.js --all-phases
    description: "Send summary report to Discord thread"
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

# Resumability
resume:
  enabled: true
  token_file: $HOME/.openclaw/workspace/reports/alygn/x-growth/resume-token.json
