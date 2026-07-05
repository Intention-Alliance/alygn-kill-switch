name: live-chat-bridge
version: "1.0.0"
description: |
  Lobster pipeline for the andler-chatbot-spike. Receives EscalatePayload from
  openclaw-webhook via live-chat-bridge handler, runs 8 deterministic steps,
  halts at await-andler-approval until Andler responds in #annotations.

metadata:
  project: andler-dev
  type: prospect-intake
  skill: live-chat-bridge
  dependencies:
    - bin/prospect-intake-verify-webhook.mjs (ADR-138 section 1, Block 6)
    - bin/prospect-intake-write-row.mjs (ADR-138 section 2, Block 6)
    - bin/prospect-intake-list-slots.mjs (ADR-138 section 3, Block 6)
    - bin/prospect-intake-thread-post.mjs (ADR-138 section 4, Block 6)
    - bin/prospect-intake-release-reply.mjs (ADR-138 section 5, Block 6)
  consumes_event_type: live-chat.message
  channel_discord: "#annotations"
  channel_discord_id: "1466532145257255004"

args:
  run_id:
    type: string
    required: true
    description: "Unique pipeline run id (UUID)"
  payload:
    type: object
    required: true
    description: "EscalatePayload from live-chat-bridge handler (action: escalate)"
  dry_run:
    type: boolean
    default: true
    description: "Skip bin script side effects (Notion, Discord, Calendar)"

env:
  NOTION_KEY: ${NOTION_KEY}
  NOTION_PROSPECT_TRIAGE_DB_ID: ${NOTION_PROSPECT_TRIAGE_DB_ID}
  DISCORD_ANNOTATIONS_CHANNEL_ID: "1466532145257255004"
  DISCORD_BOT_TOKEN: ${DISCORD_BOT_TOKEN}

# State file: /tmp/live-chat-bridge-resume-$run_id.json
# {
#   "run_id": "...",
#   "step": "await-andler-approval" | "release-reply" | ...,
#   "phase": "greeting" | "diagnostic" | "verdict" | "closed",
#   "flag": "green" | "yellow" | "red" | null,
#   "ic_thread_id": "...",
#   "notion_row_id": "...",
#   "calendar_slots": [],
#   "verdict_message": "...",
#   "closing_message_draft": "...",
#   "andler_decision": null | "APPROVE" | "EDIT" | "DENY",
#   "andler_edit": null | "...",
#   "prospect": {
#     "display_name": "...",
#     "channel_handle": "...",
#     "channel": "...",
#     "channel_session_id": "..."
#   },
#   "conversation_id": "...",
#   "event_id": "...",
#   "conversation_started_at": "...",
#   "summary": "...",
#   "investigation": { ... },
#   "conversation_transcript": "..."
# }

steps:
  # Step 1: VALIDATE JWT + PAYLOAD
  - id: step1-validate-jwt
    name: Validate JWT signature and extract payload claims
    command: |
      bun $HOME/.openclaw/workspace/bin/prospect-intake-verify-webhook.mjs \
        --headers "$JWT_HEADERS" \
        --body "$PAYLOAD_BODY"
    description: "Verify the live-chat.message JWT signature and extract claims"
    timeout_seconds: 5
    output:
      file: /tmp/live-chat-bridge-$run_id-validate.json
      schema:
        - ok: boolean
        - event_id: string
        - prospect_handle: string
        - phase: string
        - flag: string
    on_error:
      action: halt
      message: "JWT validation failed: $error"

  # Step 2: LOAD CONTEXT (ICL context from conversation transcript + investigation)
  - id: step2-load-context
    name: Load ICL context from conversation transcript and investigation
    command: |
      echo '{"action":"load_context","run_id":"'"$run_id"'","payload":'"$payload_json"'}}' > /tmp/live-chat-bridge-$run_id-context.json
    description: "Pull ICL context from the EscalatePayload (transcript, investigation, summary)"
    after: step1-validate-jwt
    timeout_seconds: 5
    output:
      file: /tmp/live-chat-bridge-$run_id-context.json
      schema:
        - ok: boolean
        - phase: string
        - flag: string
        - prospect: object
        - summary: string
        - investigation: object
        - closing_message: string
        - conversation_transcript: string
    on_error:
      action: halt
      message: "Context loading failed: $error"

  # Step 3: DIAGNOSE QUESTION (package flag + summary + investigation into diagnosis object)
  - id: step3-diagnose
    name: Package flag summary and investigation into diagnosis object
    command: |
      echo '{"flag":"'"$flag"'","summary":"'"$summary"'","investigation":'"$investigation_json"'}}' > /tmp/live-chat-bridge-$run_id-diagnosis.json
    description: "Package the flag + summary + investigation into a diagnosis object for the verdict post"
    after: step2-load-context
    timeout_seconds: 2
    output:
      file: /tmp/live-chat-bridge-$run_id-diagnosis.json
      schema:
        - flag: string
        - summary: string
        - investigation: object
    on_error:
      action: halt
      message: "Diagnosis packaging failed: $error"

  # Step 4: UPDATE FLAG (evaluate flag rules and set phase)
  - id: step4-update-flag
    name: Apply flag rules and determine phase transition
    command: |
      echo '{"flag":"'"$flag"'","phase":"verdict","run_id":"'"$run_id"'"}' > /tmp/live-chat-bridge-$run_id-flag.json
    description: "Apply G/Y/R flag rules to the diagnosis; transition phase to verdict"
    after: step3-diagnose
    timeout_seconds: 2
    output:
      file: /tmp/live-chat-bridge-$run_id-flag.json
      schema:
        - flag: string
        - phase: string
    on_error:
      action: halt
      message: "Flag evaluation failed: $error"

  # Step 5: AWAIT ANDLER APPROVAL (PAUSE — lobster resume block)
  - id: step5-await-andler-approval
    name: Pause pipeline and write state file for Andler approval
    command: |
      cat > /tmp/live-chat-bridge-resume-$run_id.json <<ENDJSON
      {
        "run_id": "$run_id",
        "step": "await-andler-approval",
        "phase": "verdict",
        "flag": "$flag",
        "ic_thread_id": null,
        "notion_row_id": null,
        "calendar_slots": [],
        "verdict_message": "$summary",
        "closing_message_draft": "$closing_message",
        "andler_decision": null,
        "andler_edit": null,
        "prospect": {
          "display_name": "$display_name",
          "channel_handle": "$channel_handle",
          "channel": "$channel",
          "channel_session_id": "$channel_session_id"
        },
        "conversation_id": "$conversation_id",
        "event_id": "$event_id",
        "conversation_started_at": "$conversation_started_at",
        "summary": "$summary",
        "investigation": $investigation_json,
        "conversation_transcript": "$transcript_truncated"
      }
      ENDJSON
    description: |
      PAUSE: write /tmp/live-chat-bridge-resume-$run_id.json and halt the pipeline.
      Resume trigger: cron job (every 5 min) reads /tmp/, checks #annotations for
      APPROVE, EDIT, or DENY from Andler, then calls lobster resume with flowStateJson.
    after: step4-update-flag
    timeout_seconds: 86400
    output:
      file: /tmp/live-chat-bridge-resume-$run_id.json
      schema:
        - run_id: string
        - step: string
        - phase: string
        - flag: string
        - andler_decision: string
    on_error:
      action: halt
      message: "State file write failed: $error"
    notification:
      on_pause:
        channel: discord
        channel_id: "1466532145257255004"
        message: "Verdict staged for $display_name ($flag). Awaiting APPROVE, EDIT, or DENY."

  # Step 6: HAND-OFF NOTION (write row in Prospect Triage DB)
  - id: step6-hand-off-notion
    name: Write Notion row in Prospect Triage DB with Andler decision
    command: |
      bun $HOME/.openclaw/workspace/bin/prospect-intake-write-row.mjs \
        --input '{"name":"'"$display_name"'","handle":"'"$channel_handle"'","channel":"'"$channel"'","channel_session_id":"'"$channel_session_id"'","flag":"'"$flag"'","conversation_started_at":"'"$conversation_started_at"'","verdict_at":"'"$(date -u +%Y-%m-%dT%H:%M:%SZ)'","conversation_transcript":"'"$transcript_truncated"'","investigation_summary":"'"$summary"'","ghost_stalled_closing_message":"'"$final_closing_message"'","andler_decision":"'"$andler_decision"'","calendar_slots_proposed":"","handoff_channel":"discord"}'
    description: "Write Notion row in Prospect Triage DB with Andler's decision"
    after: step5-await-andler-approval
    timeout_seconds: 15
    output:
      file: /tmp/live-chat-bridge-$run_id-notion-row.json
      schema:
        - ok: boolean
        - row_id: string
        - row_url: string
    on_error:
      action: continue
      message: "Notion write deferred: $error"

  # Step 7: POST DISCORD (post verdict + decision to #annotations thread)
  - id: step7-post-discord
    name: Post verdict and decision confirmation to Discord annotations thread
    command: |
      bun $HOME/.openclaw/workspace/bin/prospect-intake-thread-post.mjs \
        --input '{"channel_id":"1466532145257255004","thread_name":"Prospect: '"$display_name"' ('"$channel_handle"')","verdict_post":"'"$verdict_post_body"'","existing_thread_id":"'"$ic_thread_id"'"}'
    description: "Post verdict to #annotations thread with Andler's decision result"
    after: step6-hand-off-notion
    timeout_seconds: 10
    output:
      file: /tmp/live-chat-bridge-$run_id-discord-update.json
      schema:
        - ok: boolean
        - thread_id: string
        - message_id: string
    on_error:
      action: continue
      message: "Discord post failed: $error"

  # Step 8: RELEASE REPLY (send closing message back to prospect)
  - id: step8-release-reply
    name: Release approved closing message back to prospect channel
    command: |
      bun $HOME/.openclaw/workspace/bin/prospect-intake-release-reply.mjs \
        --input '{"channel":"'"$channel"'","channel_session_id":"'"$channel_session_id"'","message":"'"$final_closing_message"'","event_id":"'"$conversation_id"'-release"}'
    description: "Send the approved closing message back to the prospect via the safe messaging agent"
    after: step7-post-discord
    timeout_seconds: 15
    output:
      file: /tmp/live-chat-bridge-$run_id-release.json
      schema:
        - ok: boolean
        - delivered_at: string
        - agent_message_id: string
    on_error:
      action: halt
      message: "Closing message release failed: $error"
      critical: true

# Resumability — pause at step5-await-approval, resume on Andler's reply
resume:
  enabled: true
  token_file: /tmp/live-chat-bridge-resume-$run_id.json
  skip_completed_steps: true
  pause_at: step5-await-andler-approval
  resume_trigger:
    source: discord
    channel_id: "1466532145257255004"
    match_pattern: "^(APPROVE|EDIT\\s+.+|DENY)$"
    thread_id_var: "$ic_thread_id"

# Error handling
on_error:
  default_action: halt
  notify:
    channel: discord
    channel_id: "1466532145257255004"
    message: "live-chat-bridge pipeline failed at $step_id for $run_id: $error"

critical_errors:
  - step1-validate-jwt
  - step5-await-andler-approval
  - step8-release-reply

soft_errors:
  - step2-load-context
  - step6-hand-off-notion
  - step7-post-discord

# Notifications
notification:
  on_start:
    channel: discord
    channel_id: "1466532145257255004"
    message: "live-chat-bridge pipeline started for $run_id"
  on_complete:
    channel: discord
    channel_id: "1466532145257255004"
    message: |
      live-chat-bridge pipeline complete for $run_id.
      Flag: $flag
      Decision: $andler_decision
      Delivered: $delivered_at
  on_error:
    channel: discord
    channel_id: "1466532145257255004"
    message: "live-chat-bridge pipeline failed at $step_id for $run_id: $error"