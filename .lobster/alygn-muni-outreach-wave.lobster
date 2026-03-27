name: alygn-muni-outreach-wave
description: Wave-based municipal outreach for Costa Rica (82 cantones) with state tracking
metadata:
  project: alygn
  type: muni-outreach
  region: costa-rica
  wave: 1
  total_municipalities: 82
  skill: alygn-outreach

# Wave State File Schema
# Path: /tmp/alygn-muni-wave-state.json
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
        const statePath = '/tmp/alygn-muni-wave-state.json';
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
      file: /tmp/alygn-muni-wave-check.json

  # ============================================================
  # PHASE 1: Discover (82 Costa Rica cantones)
  # ============================================================
  - id: phase1-discover
    command: node $HOME/.agents/skills/alygn-outreach/bin/alygn-outreach --type=municipal --action=discover --region=costa-rica --limit=82 --dry-run
    description: "Discover all 82 Costa Rican cantones"
    after: wave-check
    output:
      file: /tmp/alygn-muni-discovered.json
    resume:
      skip_if: 'phaseCompleted === "phase1-discover"'
    on_complete:
      script: |
        const fs = require('fs');
        const state = JSON.parse(fs.readFileSync('/tmp/alygn-muni-wave-state.json', 'utf8'));
        state.entities.discovered = JSON.parse(fs.readFileSync('/tmp/alygn-muni-discovered.json', 'utf8'));
        state.phaseCompleted = 'phase1-discover';
        fs.writeFileSync('/tmp/alygn-muni-wave-state.json', JSON.stringify(state, null, 2));

  # ============================================================
  # PHASE 2: Research Mayor Names (BEFORE validation)
  # ============================================================
  - id: phase2-research-mayors
    command: node $HOME/.agents/skills/alygn-outreach/bin/alygn-outreach --type=municipal --action=research --region=costa-rica --input=/tmp/alygn-muni-discovered.json --dry-run
    description: "Research actual mayor names for each canton"
    after: phase1-discover
    output:
      file: /tmp/alygn-muni-mayors.json
    resume:
      skip_if: 'phaseCompleted === "phase2-research-mayors"'
    on_complete:
      script: |
        const fs = require('fs');
        const state = JSON.parse(fs.readFileSync('/tmp/alygn-muni-wave-state.json', 'utf8'));
        state.entities.mayors = JSON.parse(fs.readFileSync('/tmp/alygn-muni-mayors.json', 'utf8'));
        state.phaseCompleted = 'phase2-research-mayors';
        fs.writeFileSync('/tmp/alygn-muni-wave-state.json', JSON.stringify(state, null, 2));

  # ============================================================
  # PHASE 2.5: Validate Emails (with mayor name context)
  # ============================================================
  - id: phase2-5-validate-emails
    command: node $HOME/.agents/skills/alygn-outreach/bin/alygn-outreach --type=municipal --action=validate --region=costa-rica --input=/tmp/alygn-muni-mayors.json --dry-run
    description: "Validate emails using mayor name context (generic=Fail, personal=Pass)"
    after: phase2-research-mayors
    output:
      file: /tmp/alygn-muni-validated.json
    resume:
      skip_if: 'phaseCompleted === "phase2-5-validate-emails"'
    on_complete:
      script: |
        const fs = require('fs');
        const state = JSON.parse(fs.readFileSync('/tmp/alygn-muni-wave-state.json', 'utf8'));
        state.entities.validated = JSON.parse(fs.readFileSync('/tmp/alygn-muni-validated.json', 'utf8'));
        state.phaseCompleted = 'phase2-5-validate-emails';
        fs.writeFileSync('/tmp/alygn-muni-wave-state.json', JSON.stringify(state, null, 2));

  # ============================================================
  # PHASE 3: Update Supabase (persist research)
  # ============================================================
  - id: phase3-update-supabase
    command: bun $HOME/.openclaw/workspace/scripts/alygn/muni-outreach/core/supabase-utils.ts --action=update-research --input=/tmp/alygn-muni-validated.json --dry-run
    description: "Update Supabase municipalities table with research status"
    after: phase2-5-validate-emails
    output:
      file: /tmp/alygn-muni-supabase-update.json
    resume:
      skip_if: 'phaseCompleted === "phase3-update-supabase"'
    on_complete:
      script: |
        const fs = require('fs');
        const state = JSON.parse(fs.readFileSync('/tmp/alygn-muni-wave-state.json', 'utf8'));
        state.phaseCompleted = 'phase3-update-supabase';
        fs.writeFileSync('/tmp/alygn-muni-wave-state.json', JSON.stringify(state, null, 2));

  # ============================================================
  # PHASE 4: Personalize (Spanish, TRAIGA variant)
  # ============================================================
  - id: phase4-personalize
    command: node $HOME/.agents/skills/alygn-outreach/bin/alygn-outreach --type=municipal --action=personalize --region=costa-rica --input=/tmp/alygn-muni-validated.json --variant=traiga --language=es --dry-run
    description: "Generate personalized Spanish emails with TRAIGA Act context"
    after: phase3-update-supabase
    output:
      file: /tmp/alygn-muni-personalized.json
    resume:
      skip_if: 'phaseCompleted === "phase4-personalize"'
    on_complete:
      script: |
        const fs = require('fs');
        const state = JSON.parse(fs.readFileSync('/tmp/alygn-muni-wave-state.json', 'utf8'));
        state.entities.personalized = JSON.parse(fs.readFileSync('/tmp/alygn-muni-personalized.json', 'utf8'));
        state.phaseCompleted = 'phase4-personalize';
        fs.writeFileSync('/tmp/alygn-muni-wave-state.json', JSON.stringify(state, null, 2));

  # ============================================================
  # PHASE 5: Human Review (BLOCKS next phase)
  # ============================================================
  - id: phase5-review
    command: echo "Review Spanish drafts in Discord #annotations. Approve/reject. Approved municipalities proceed to phase6."
    description: "Human approval required - blocks phase6 until approved"
    after: phase4-personalize
    approval: required
    output:
      file: /tmp/alygn-muni-review.json
    on_complete:
      script: |
        const fs = require('fs');
        const state = JSON.parse(fs.readFileSync('/tmp/alygn-muni-wave-state.json', 'utf8'));
        state.phaseCompleted = 'phase5-review';
        fs.writeFileSync('/tmp/alygn-muni-wave-state.json', JSON.stringify(state, null, 2));

  # ============================================================
  # PHASE 5.5: SentEmailTracker Check (Pre-send dedup)
  # ============================================================
  - id: phase5-5-sent-tracker-check
    command: bun $HOME/.openclaw/workspace/scripts/alygn/muni-outreach/core/supabase-utils.ts --action=check-sent --input=/tmp/alygn-muni-personalized.json --dry-run
    description: "Check SentEmailTracker before any send - skip if already contacted"
    after: phase5-review
    output:
      file: /tmp/alygn-muni-sent-check.json
    resume:
      skip_if: 'phaseCompleted === "phase5-5-sent-tracker-check"'
    on_complete:
      script: |
        const fs = require('fs');
        const state = JSON.parse(fs.readFileSync('/tmp/alygn-muni-wave-state.json', 'utf8'));
        state.entities.sentCheck = JSON.parse(fs.readFileSync('/tmp/alygn-muni-sent-check.json', 'utf8'));
        state.phaseCompleted = 'phase5-5-sent-tracker-check';
        fs.writeFileSync('/tmp/alygn-muni-wave-state.json', JSON.stringify(state, null, 2));

  # ============================================================
  # PHASE 6: Send (5 emails/run, 60-180s delay, CC Tania)
  # ============================================================
  - id: phase6-send
    command: |
      node $HOME/.agents/skills/alygn-outreach/bin/alygn-outreach \
        --type=municipal \
        --action=send \
        --region=costa-rica \
        --input=/tmp/alygn-muni-sent-check.json \
        --cc=tanialeaidm@gmail.com \
        --rate-limit=5 \
        --delay-min=60 \
        --delay-max=180
    description: "Send emails via Smartlead (5/run, 60-180s delay, Tania CC)"
    after: phase5-5-sent-tracker-check
    approval: required (production)
    rate_limit:
      max_per_run: 5
      delay_ms: [60000, 180000]
      daily_cap: 5
    cc:
      - tanialeaidm@gmail.com (production only)
    output:
      file: /tmp/alygn-muni-sent.json
    on_complete:
      script: |
        const fs = require('fs');
        const state = JSON.parse(fs.readFileSync('/tmp/alygn-muni-wave-state.json', 'utf8'));
        state.entities.sent = JSON.parse(fs.readFileSync('/tmp/alygn-muni-sent.json', 'utf8'));
        state.phaseCompleted = 'phase6-send';
        fs.writeFileSync('/tmp/alygn-muni-wave-state.json', JSON.stringify(state, null, 2));

  # ============================================================
  # PHASE 7: Verify Sends
  # ============================================================
  - id: phase7-verify
    command: node $HOME/.agents/skills/alygn-outreach/bin/alygn-outreach --type=municipal --action=verify --region=costa-rica
    description: "Verify sends completed, update Supabase status"
    after: phase6-send
    output:
      channel: discord
      target: "1466532145257255004"
    on_complete:
      script: |
        const fs = require('fs');
        const state = JSON.parse(fs.readFileSync('/tmp/alygn-muni-wave-state.json', 'utf8'));
        state.wave.status = 'completed';
        state.wave.nextDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        state.wave.number += 1;
        state.phaseCompleted = 'phase7-verify';
        fs.writeFileSync('/tmp/alygn-muni-wave-state.json', JSON.stringify(state, null, 2));

# ============================================================
# RESUME CAPABILITY
# ============================================================
resume:
  enabled: true
  state_file: /tmp/alygn-muni-wave-state.json
  input_flag: --input=/tmp/alygn-muni-wave-state.json
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
    const state = JSON.parse(fs.readFileSync('/tmp/alygn-muni-wave-state.json', 'utf8'));
    state.wave.status = 'error';
    state.lastError = '{{error}}';
    fs.writeFileSync('/tmp/alygn-muni-wave-state.json', JSON.stringify(state, null, 2));

critical_errors:
  - phase5-review rejection
  - phase5-5-sent-tracker-check failure
  - phase6-send failure (no CC)

# ============================================================
# NOTIFICATIONS
# ============================================================
notifications:
  on_start:
    channel: discord
    target: "1466532145257255004"
    message: "🏛️ Starting Wave {{wave.number}} Municipal Outreach (Costa Rica - 82 cantones)..."
  on_phase_complete:
    channel: discord
    target: "1466532145257255004"
    message: "✅ Phase {{phase}} completed. Proceeding to next."
  on_complete:
    channel: discord
    target: "1466532145257255004"
    message: "✅ Wave {{wave.number}} Municipal Outreach COMPLETE. Next wave: {{wave.nextDate}}"
  on_error:
    channel: discord
    target: "1466532145257255004"
    message: "❌ Wave {{wave.number}} Municipal failed at {{phase}}: {{error}}"

# ============================================================
# VALIDATION INSIGHTS (from production)
# ============================================================
validation_insights:
  pass_patterns:
    - "alcalde@msj.go.cr (central government)"
    - "alcalde@mun{digits}.go.cr (direct municipal)"
    - "firstname.lastname@domain.com"
  fail_patterns:
    - "contacto@, info@, administracion@, secretaria@ (generic)"
  lesson: "Research specific mayor names BEFORE validation phase"

# ============================================================
# SPANISH EMAIL SPECIFICATIONS
# ============================================================
email_spec:
  language: es
  variant: traiga
  rate_limit: 5 per run
  delay_ms: [60000, 180000]
  daily_cap: 5
  cc: tanialeaidm@gmail.com (production only)
  dedup: SentEmailTracker (municipal_outreach table)
  personalization:
    tone: supportive, trust-building (NOT salesy)
    body_required: true
    ps_format: |
      {personalized_context}

      P.D.: Este mensaje fue generado con IA, verificado por humanos. Transparencia total en nuestros procesos.
    traIGA_focus: "Governance infrastructure, digital transformation, AI governance"

# ============================================================
# SUPABASE SCRIPT REFERENCE
# ============================================================
# All database operations use supabase-utils.ts via Bun:
#   bun $HOME/.openclaw/workspace/scripts/alygn/muni-outreach/core/supabase-utils.ts --action=<action>
#
# Available actions:
#   --action=check-sent        - Check if municipality already contacted
#   --action=update-research   - Update mayor research (--muni-id, --mayor-name)
#   --action=update-sent       - Mark as sent (--muni-id, --message-id, --sent-date)
#   --action=log-outreach      - Log outreach email (--muni-id, --input=<file>)
#   --action=query-pending     - Query pending municipalities (--limit=<n>)
