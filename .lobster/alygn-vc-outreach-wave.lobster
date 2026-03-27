name: alygn-vc-outreach-wave
description: Wave-based VC outreach with state tracking and phase management
metadata:
  project: alygn
  type: vc-outreach
  wave: 1
  skill: alygn-outreach

# Wave State File Schema
# Path: /tmp/alygn-vc-wave-state.json
# {
#   "wave": { "number": 1, "date": "2026-03-26", "nextDate": "2026-04-02", "status": "idle" },
#   "entities": {},
#   "lastRun": "2026-03-26T14:00:00Z",
#   "phaseCompleted": null
# }

steps:
  # ============================================================
  # WAVE CHECK: Skip if within 7 days of last wave
  # ============================================================
  - id: wave-check
    command: |
      node -e "
        const fs = require('fs');
        const statePath = '/tmp/alygn-vc-wave-state.json';
        let state = { wave: { number: 1, date: null, nextDate: null, status: 'idle' }, entities: {}, lastRun: null, phaseCompleted: null };
        if (fs.existsSync(statePath)) {
          const raw = fs.readFileSync(statePath, 'utf8');
          state = JSON.parse(raw);
        }
        const now = new Date();
        if (state.wave.nextDate) {
          const next = new Date(state.wave.nextDate);
          const diffDays = (next - now) / (1000 * 60 * 60 * 24);
          if (diffDays > 7) {
            console.log('WAVE_SKIP: Next wave date is ' + state.wave.nextDate + ' (' + Math.round(diffDays) + ' days away). Skipping.');
            process.exit(0);
          }
        }
        console.log('WAVE_PROCEED: Wave ' + state.wave.number + ' proceeding.');
        fs.writeFileSync(statePath, JSON.stringify({...state, lastRun: now.toISOString()}, null, 2));
      "
    description: "Check wave date - skip if within 7 days of next wave date"
    output:
      file: /tmp/alygn-vc-wave-check.json

  # ============================================================
  # PRELUDE: X Discovery (Optional warmup)
  # ============================================================
  - id: prelude-x-discovery
    command: node $HOME/.agents/skills/alygn-outreach/bin/alygn-outreach --type=vc --action=discover-x --limit=10 --dry-run
    description: "Optional X account discovery for warmup"
    after: wave-check
    output:
      file: /tmp/alygn-vc-x-discovered.json
    resume:
      skip_if: 'phaseCompleted === "prelude-x-discovery"'

  # ============================================================
  # PHASE 1: Discover VCs
  # ============================================================
  - id: phase1-discover
    command: node $HOME/.agents/skills/alygn-outreach/bin/alygn-outreach --type=vc --action=discover --limit=5 --dry-run
    description: "Discover new VC targets"
    after: prelude-x-discovery
    output:
      file: /tmp/alygn-vc-discovered.json
    resume:
      skip_if: 'phaseCompleted === "phase1-discover"'
    on_complete:
      script: |
        const fs = require('fs');
        const state = JSON.parse(fs.readFileSync('/tmp/alygn-vc-wave-state.json', 'utf8'));
        state.entities.discovered = JSON.parse(fs.readFileSync('/tmp/alygn-vc-discovered.json', 'utf8'));
        state.phaseCompleted = 'phase1-discover';
        fs.writeFileSync('/tmp/alygn-vc-wave-state.json', JSON.stringify(state, null, 2));

  # ============================================================
  # PHASE 2: Validate Emails
  # ============================================================
  - id: phase2-validate
    command: node $HOME/.agents/skills/alygn-outreach/bin/alygn-outreach --type=vc --action=validate --input=/tmp/alygn-vc-discovered.json --limit=5
    description: "Validate VC emails (generic=Fail, personal=Pass)"
    after: phase1-discover
    output:
      file: /tmp/alygn-vc-validated.json
    resume:
      skip_if: 'phaseCompleted === "phase2-validate"'
    on_complete:
      script: |
        const fs = require('fs');
        const state = JSON.parse(fs.readFileSync('/tmp/alygn-vc-wave-state.json', 'utf8'));
        state.entities.validated = JSON.parse(fs.readFileSync('/tmp/alygn-vc-validated.json', 'utf8'));
        state.phaseCompleted = 'phase2-validate';
        fs.writeFileSync('/tmp/alygn-vc-wave-state.json', JSON.stringify(state, null, 2));

  # ============================================================
  # PHASE 3: Deep Research
  # ============================================================
  - id: phase3-research
    command: node $HOME/.agents/skills/alygn-outreach/bin/alygn-outreach --type=vc --action=research --input=/tmp/alygn-vc-validated.json --limit=5
    description: "Research VCs: thesis, investments, pain points"
    after: phase2-validate
    output:
      file: /tmp/alygn-vc-researched.json
    resume:
      skip_if: 'phaseCompleted === "phase3-research"'
    on_complete:
      script: |
        const fs = require('fs');
        const state = JSON.parse(fs.readFileSync('/tmp/alygn-vc-wave-state.json', 'utf8'));
        state.entities.researched = JSON.parse(fs.readFileSync('/tmp/alygn-vc-researched.json', 'utf8'));
        state.phaseCompleted = 'phase3-research';
        fs.writeFileSync('/tmp/alygn-vc-wave-state.json', JSON.stringify(state, null, 2));

  # ============================================================
  # PHASE 4: Personalize Content
  # ============================================================
  - id: phase4-personalize
    command: node $HOME/.agents/skills/alygn-outreach/bin/alygn-outreach --type=vc --action=personalize --input=/tmp/alygn-vc-researched.json --limit=5
    description: "Generate personalized email drafts"
    after: phase3-research
    output:
      file: /tmp/alygn-vc-personalized.json
    resume:
      skip_if: 'phaseCompleted === "phase4-personalize"'
    on_complete:
      script: |
        const fs = require('fs');
        const state = JSON.parse(fs.readFileSync('/tmp/alygn-vc-wave-state.json', 'utf8'));
        state.entities.personalized = JSON.parse(fs.readFileSync('/tmp/alygn-vc-personalized.json', 'utf8'));
        state.phaseCompleted = 'phase4-personalize';
        fs.writeFileSync('/tmp/alygn-vc-wave-state.json', JSON.stringify(state, null, 2));

  # ============================================================
  # PHASE 5: Human Review (BLOCKS next phase)
  # ============================================================
  - id: phase5-review
    command: echo "Review drafts in Discord #annotations. Approve/reject in Notion. Draft Status must = 'Approved' for phase6."
    description: "Human approval required - blocks phase6 until approved"
    after: phase4-personalize
    approval: required
    output:
      file: /tmp/alygn-vc-review.json
    on_complete:
      script: |
        const fs = require('fs');
        const state = JSON.parse(fs.readFileSync('/tmp/alygn-vc-wave-state.json', 'utf8'));
        state.phaseCompleted = 'phase5-review';
        fs.writeFileSync('/tmp/alygn-vc-wave-state.json', JSON.stringify(state, null, 2));

  # ============================================================
  # PHASE 6: Send (TWO-FILTER SYSTEM + CC + RATE LIMIT)
  # ============================================================
  - id: phase6-send
    command: |
      node $HOME/.agents/skills/alygn-outreach/bin/alygn-outreach \
        --type=vc \
        --action=send \
        --draft-status=Approved \
        --email-send-to={approved_ids} \
        --cc=tanialeaidm@gmail.com \
        --rate-limit=3 \
        --dedup=true
    description: "Send ONLY to approved VCs (two-filter: draft-status=Approved + explicit IDs)"
    after: phase5-review
    approval: required
    rate_limit:
      max_per_run: 3
      strategy: strict
    dedup:
      tracker: SentEmailTracker
      field: email_address
      skip_if_found: true
    cc:
      - tanialeaidm@gmail.com
    output:
      file: /tmp/alygn-vc-sent.json
    on_complete:
      script: |
        const fs = require('fs');
        const state = JSON.parse(fs.readFileSync('/tmp/alygn-vc-wave-state.json', 'utf8'));
        state.entities.sent = JSON.parse(fs.readFileSync('/tmp/alygn-vc-sent.json', 'utf8'));
        state.phaseCompleted = 'phase6-send';
        fs.writeFileSync('/tmp/alygn-vc-wave-state.json', JSON.stringify(state, null, 2));

  # ============================================================
  # PHASE 7: Verify Sends
  # ============================================================
  - id: phase7-verify
    command: node $HOME/.agents/skills/alygn-outreach/bin/alygn-outreach --type=vc --action=verify
    description: "Verify sends completed, update Notion status"
    after: phase6-send
    output:
      channel: discord
      target: "1466532145257255004"
    on_complete:
      script: |
        const fs = require('fs');
        const state = JSON.parse(fs.readFileSync('/tmp/alygn-vc-wave-state.json', 'utf8'));
        state.wave.status = 'completed';
        state.wave.nextDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        state.wave.number += 1;
        state.phaseCompleted = 'phase7-verify';
        fs.writeFileSync('/tmp/alygn-vc-wave-state.json', JSON.stringify(state, null, 2));

# ============================================================
# RESUME CAPABILITY
# ============================================================
resume:
  enabled: true
  state_file: /tmp/alygn-vc-wave-state.json
  input_flag: --input=/tmp/alygn-vc-wave-state.json
  skip_completed_phases: true

# ============================================================
# ERROR HANDLING
# ============================================================
on_error:
  notify: discord
  channel: "1466532145257255004"
  include_log: true
  halt_on_critical: true
  script: |
    const fs = require('fs');
    const state = JSON.parse(fs.readFileSync('/tmp/alygn-vc-wave-state.json', 'utf8'));
    state.wave.status = 'error';
    state.lastError = '{{error}}';
    fs.writeFileSync('/tmp/alygn-vc-wave-state.json', JSON.stringify(state, null, 2));

critical_errors:
  - phase5-review rejection
  - phase6-send failure
  - validation failure (zero valid emails)

# ============================================================
# NOTIFICATIONS
# ============================================================
notifications:
  on_start:
    channel: discord
    target: "1466532145257255004"
    message: "🔧 Starting Wave {{wave.number}} VC Campaign..."
  on_phase_complete:
    channel: discord
    target: "1466532145257255004"
    message: "✅ Phase {{phase}} completed. Proceeding to next."
  on_complete:
    channel: discord
    target: "1466532145257255004"
    message: "✅ Wave {{wave.number}} VC Campaign COMPLETE. Next wave: {{wave.nextDate}}"
  on_error:
    channel: discord
    target: "1466532145257255004"
    message: "❌ Wave {{wave.number}} failed at {{phase}}: {{error}}"

# ============================================================
# VALIDATION INSIGHTS (from production)
# ============================================================
validation_insights:
  pass_patterns:
    - "firstname@domain.com (personal partner email)"
    - "firstname.lastname@domain.com"
  fail_patterns:
    - "hello@, invest@, contact@ (generic)"
    - "role-based catch-alls"
  lesson: "Always research partner names on LinkedIn before adding to database"

# ============================================================
# EMAIL SPECIFICATIONS
# ============================================================
email_spec:
  rate_limit: 3 per run
  cc: tanialeaidm@gmail.com (all sends)
  dedup: true (SentEmailTracker check)
  two_filter_system:
    - "--draft-status=Approved" (Notion Draft Status = 'Approved')
    - "--email-send-to=id1,id2,id3" (explicit approved entity IDs)
  personalization:
    language: en
    body_required: true
    ps_required: true
    format: "{body}\n\nP.S.: {personalized_ps}. Este mensaje fue generado con IA, verificado por humanos."
