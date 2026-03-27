name: translation-qa
description: Multi-agent translation quality assurance workflow (Translator + Reviewer)
metadata:
  version: "1.0"
  date: "2026-03-02"
  agents: 2
  max_iterations: 3
  quality_threshold: 0.85
steps:
  - id: phase1-translate
    command: node scripts/alygn/muni-outreach/translation/translator-agent.js --input=/tmp/translation-input.json --target-language={TARGET_LANGUAGE} --output=/tmp/translation-draft.json
    description: Sub-Agent 1: Translate content from English to target language
    agent:
      role: translator
      iq: 140
      specialty: Translation, Localization, Government Communication
    output:
      file: /tmp/translation-draft.json
  - id: phase2-review
    command: node scripts/alygn/muni-outreach/translation/reviewer-agent.js --input=/tmp/translation-draft.json --original=/tmp/translation-input.json --output=/tmp/translation-review.json
    description: Sub-Agent 2: Review translation for quality, cultural fit, and compliance
    after: phase1-translate
    agent:
      role: reviewer
      iq: 140
      specialty: Quality Assurance, Cultural Validation, Legal Compliance
    output:
      file: /tmp/translation-review.json
  - id: phase3-decision
    command: node scripts/alygn/muni-outreach/translation/translation-decision.js --review=/tmp/translation-review.json --draft=/tmp/translation-draft.json --output=/tmp/translation-decision.json
    description: Decide: Approve or Request Revision based on reviewer feedback
    after: phase2-review
    output:
      file: /tmp/translation-decision.json
  - id: phase4-revision-loop
    command: node scripts/alygn/muni-outreach/translation/translator-agent.js --input=/tmp/translation-input.json --target-language={TARGET_LANGUAGE} --feedback=/tmp/translation-review.json --previous=/tmp/translation-draft.json --output=/tmp/translation-revision.json
    description: Sub-Agent 1: Revise translation based on reviewer feedback
    after: phase3-decision
    condition: revision_required == true AND iteration < 3
    agent:
      role: translator
      iq: 140
      specialty: Translation, Localization, Government Communication
    output:
      file: /tmp/translation-revision.json
    loop:
      back_to: phase2-review
      max_iterations: 3
      iteration_counter: /tmp/translation-iteration-count.txt
  - id: phase5-finalize
    command: node scripts/alygn/muni-outreach/translation/finalize-translation.js --approved=/tmp/translation-review.json --output=/tmp/translation-final.json
    description: Finalize approved translation and prepare for use
    after: phase3-decision
    condition: revision_required == false
    output:
      file: /tmp/translation-final.json
  - id: phase6-escalate
    command: node scripts/alygn/muni-outreach/translation/escalate-to-human.js --failed=/tmp/translation-decision.json --notify=discord
    description: Escalate to human reviewer after 3 failed iterations
    after: phase4-revision-loop
    condition: iteration >= 3 AND quality_score < 0.85
    output:
      channel: discord
      target: "1466532145257255004"
on_error:
  notify: discord
  channel: "1466532145257255004"
  include_log: true
  escalate_to_human: true
resume:
  enabled: true
  token_file: /tmp/translation-qa-resume-token.json
  skip_completed_steps: true
notifications:
  on_start:
    channel: discord
    message: 🔄 Starting translation QA workflow (English → {TARGET_LANGUAGE})...
  on_complete:
    channel: discord
    message: ✅ Translation QA complete! Quality score: {QUALITY_SCORE}
  on_escalate:
    channel: discord
    message: ⚠️ Translation QA failed after 3 iterations. Human review required.
