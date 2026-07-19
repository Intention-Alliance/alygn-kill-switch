name: andlergm-thumbnail
description: AndlerGM YouTube/Twitch thumbnail pipeline. Reads queue.json, runs zone research-ask, composes a v2-template-locked prompt, fires nano-banana-pro with the agent's fierce-no-bg as input anchor, posts the draft to #andlergm-branding-assets-cron-setup for review. DEFAULT mode is surgical edit on the most recent approved draft; regen-from-scratch only when Andler replies with 🔁 or "regen".
metadata:
  project: andlergm
  type: thumbnail-pipeline
  template_lock: "media/andlerGM/thumbnails/pvp/talanara/2026-07-17-test-a-draft-v2.png"
  skill: nano-banana-pro
  pipeline: read-queue → research-ask → compose-prompt → generate → post-draft → update-queue

# AndlerGM Thumbnail Pipeline
# Locked template = v2 (Talanara fierce, world_pvp_arena, Naigtal scene, shounen-manga accents).
# Surgical-edit mode is the default — only fields Andler names change. Regen requires explicit 🔁.

inputs:
  queue_file: $HOME/.openclaw/workspace/media/andlerGM/queue.json
  template_lock_png: $HOME/.openclaw/workspace/media/andlerGM/thumbnails/pvp/talanara/2026-07-17-test-a-draft-v2.png
  brand_kit: $HOME/.openclaw/workspace/docs/brand-kit-andlerGM/BRAND-KIT-GUIDE.md
  templates_doc: $HOME/.openclaw/workspace/docs/brand-kit-andlerGM/THUMBNAIL-TEMPLATES.md
  team_avatars_dir: $HOME/.openclaw/workspace/docs/andler-dev/assets/team-avatars
  team_style_guide: $HOME/.openclaw/workspace/docs/andler-dev/assets/team-avatars/STYLE-GUIDE.md
  output_root: $HOME/.openclaw/workspace/media/andlerGM/thumbnails
  discord_channel: "1527521202086613182"   # #andlergm-branding-assets-cron-setup
  defaults: $HOME/.openclaw/workspace/media/andlerGM/queue.json#defaults

# ═══════════════════════════════════════════════════════════════════
# STAGE 1: READ QUEUE
# ═══════════════════════════════════════════════════════════════════
- id: stage1-read-queue
  description: "Load the next pending entry from media/andlerGM/queue.json. If queue is empty, halt with HEARTBEAT_OK-style message and no draft post."
  command: |
    uv run --quiet $HOME/.openclaw/workspace/scripts/andlergm/read-queue.py \
      --queue=$HOME/.openclaw/workspace/media/andlerGM/queue.json
  output:
    file: /tmp/andlergm-queue-$run_id.json
    schema:
      - run_id: string
      - entry: object        # the pending queue entry (champion, content_type, title, zone, etc.)
      - is_empty: bool
      - mode: "surgical" | "regen"   # surgical = edit previous approved; regen = from scratch (requires 🔁 from Andler)

# ═══════════════════════════════════════════════════════════════════
# STAGE 2: ZONE RESEARCH-ASK (only when entry.zone == "PENDING_RESEARCH")
# ═══════════════════════════════════════════════════════════════════
- id: stage2-research-ask
  description: "If the queue entry has zone=PENDING_RESEARCH, web_search the WoW Midnight 12.0.7 zone list, check Pinecone/Notion lore DB if present, and post a 2-3 option clarification ask in the cron channel BEFORE generation. Never invent zone names (MEMORY lesson 65-original, 'Naital' correction). If research returns 0 confirmed zones, ABORT and post 'zone not found' for Andler to fill in."
  after: stage1-read-queue
  when: "entry.zone == 'PENDING_RESEARCH'"
  abort_if_empty_results: true
  output:
    file: /tmp/andlergm-zone-options-$run_id.json
    schema:
      - entry_id: string
      - zone_options: string[]
      - lore_source_urls: string[]

# ═══════════════════════════════════════════════════════════════════
# STAGE 3: COMPOSE PROMPT (template-locked)
# ═══════════════════════════════════════════════════════════════════
- id: stage3-compose-prompt
  description: "Compose the nano-banana-pro prompt. Default mode = surgical edit on the v2 template lock + last approved draft for the entry's template+champion combo. Only fields Andler has explicitly changed go into the prompt. Regen mode = full re-compose using the v2 template structure (3-zone layout, Naigtal-style background, shounen-manga accents, top banner with title, top-right andlerGM wordmark in gold brackets+underline, sub-line under headline if requested)."
  after: [stage1-read-queue, stage2-research-ask]
  template_inputs:
    - template_lut: "world_pvp_arena|arena_pvp|world_pvp → pvp; raid → atmos; dungeon|competitive_pve → explore"
    - champion: from entry.champion
    - variant: "fierce"  # default; approachable is opt-in via queue field
    - champion_anchor_image: $team_avatars_dir/{champion}/{champion}-fierce-no-bg.png
    - title: from entry.title
    - sub_line: from entry.sub_line (optional)
    - wordmark_position: "top-right"   # v2/v4 contract — NEVER bottom-right watermark
    - wordmark_style: "gold brackets + gold underline"
    - background_scene: derived from entry.zone + content_type
    - accent_style: "shounen-manga: black ink speed lines, cel-shaded impact bursts, manga concentration lines"
    - output_filename: "{date}-{champion}-{template}-draft-v{n}.png"
  output:
    file: /tmp/andlergm-prompt-$run_id.json
    schema:
      - prompt: string
      - input_image: string
      - output_path: string
      - resolution: "1K"   # draft only; 4K only after Andler locks the prompt

# ═══════════════════════════════════════════════════════════════════
# STAGE 4: GENERATE
# ═══════════════════════════════════════════════════════════════════
- id: stage4-generate
  description: "Fire nano-banana-pro with --input champion fierce-no-bg as the visual anchor, prompt from stage3, 1K draft, output to {template}/{champion}/ dir. CRITICAL: the script's argparse flag is --input (SINGULAR), NOT --input-image — the skill's SKILL.md is wrong, the script's --help output is the source of truth (lesson 67). Use `uv run --with google-genai` because the skill ships its own .venv but no pyproject.toml, so bare `uv run` from the workspace won't resolve google-genai."
  after: stage3-compose-prompt
  command: |
    uv run --with google-genai $HOME/.codex/skills/nano-banana-pro/scripts/generate_image.py \
      --prompt "{stage3.prompt}" \
      --filename "{stage3.output_path}" \
      --input "{stage3.input_image}" \
      --resolution 1K
  output:
    file: "{stage3.output_path}"
    schema:
      - bytes: int
      - hash: string
      - path: string

# ═══════════════════════════════════════════════════════════════════
# STAGE 5: POST DRAFT
# ═══════════════════════════════════════════════════════════════════
- id: stage5-post-draft
  description: "Post the draft to #andlergm-branding-assets-cron-setup as a Discord reply in the original queue thread. Caption follows the v4 contract: 🎮 Test {label} — Draft v{N} | {champion} fierce · {content_type} · {zone} · {patch} + surgical-edit-summary (only the fields Andler asked to change) + 'Saved to: {path}' + 'Pipeline lock-in: surgical-edit-on-previous-draft is now the default mode' + react-with options (👍 lock / 🔁 regen / 💬 tweak). Includes reply_to_id from the original Andler message in queue entry."
  after: stage4-generate
  command: |
    openclaw message send \
      --channel {inputs.discord_channel} \
      --reply-to {entry.original_message_id} \
      --media "{stage3.output_path}" \
      --message "{caption_v4_template}"
  output:
    file: /tmp/andlergm-posted-$run_id.json
    schema:
      - discord_message_id: string
      - reply_to_id: string
      - media_path: string

# ═══════════════════════════════════════════════════════════════════
# STAGE 6: UPDATE QUEUE
# ═══════════════════════════════════════════════════════════════════
- id: stage6-update-queue
  description: "Update queue.json: set entry.status='pending_review', entry.draft_path={stage3.output_path}, entry.mode=stage1.mode, entry.draft_message_id=stage5.discord_message_id, entry.last_run_id=run_id. Leave the entry in place — Andler picks 👍/🔁/💬, the next cron tick handles the response."
  after: stage5-post-draft
  command: |
    uv run --quiet $HOME/.openclaw/workspace/scripts/andlergm/update-queue.py \
      --queue=$HOME/.openclaw/workspace/media/andlerGM/queue.json \
      --entry-id={stage1.entry.id} \
      --status=pending_review \
      --draft-path={stage3.output_path} \
      --mode={stage1.mode} \
      --draft-message-id={stage5.discord_message_id} \
      --run-id=$run_id
  output:
    file: /tmp/andlergm-queue-updated-$run_id.json

# ═══════════════════════════════════════════════════════════════════
# SAFETY / ERROR HANDLING
# ═══════════════════════════════════════════════════════════════════
on_error:
  notify: discord
  channel: "1527521202086613182"
  include_log: true
  halt_on_critical: true
  retry:
    max_attempts: 1   # thumbnail gen is expensive, do not auto-retry
    backoff_seconds: 0

critical_errors:
  - GEMINI_API_KEY / GOOGLE_API_KEY missing
  - Champion fierce-no-bg anchor file not found
  - zone=PENDING_RESEARCH + research returned 0 confirmed options
  - Discord post failed (channel unreachable, no auth)
  - nano-banana-pro returned the input image unchanged (no actual generation)

soft_errors:
  - nano-banana-pro output bytes < 200KB (likely broken image, do not post, post failure notice instead)
  - queue entry missing required fields (post fix-request to channel, mark entry.blocked)

# ═══════════════════════════════════════════════════════════════════
# RATE LIMITS
# ═══════════════════════════════════════════════════════════════════
rate_limits:
  nano_banana_pro:
    calls_per_run: 1
    calls_per_day: 4
    cooldown_seconds: 60

# ═══════════════════════════════════════════════════════════════════
# NOTIFICATIONS
# ═══════════════════════════════════════════════════════════════════
notifications:
  on_start:
    channel: discord
    target: "1527521202086613182"
    message: "🦞 AndlerGM thumbnail run $run_id started. Queue: $entry_id. Mode: $mode."
  on_zone_ask:
    channel: discord
    target: "1527521202086613182"
    message: "❓ Zone research needed for $entry_id. Options: $zone_options. Reply with the zone name (or 'skip' to abort)."
  on_draft_posted:
    channel: discord
    target: "1527521202086613182"
    message: "✅ Draft posted: $output_path. React 👍 to lock, 🔁 to regen, 💬 to tweak."
  on_complete:
    channel: discord
    target: "1527521202086613182"
    message: "🦞 AndlerGM run $run_id complete. Mode: $mode. Draft: $output_path. Awaiting Andler's reaction."
  on_halt:
    channel: discord
    target: "1527521202086613182"
    message: "🚨 AndlerGM run $run_id HALTED: $reason"

# ═══════════════════════════════════════════════════════════════════
# SCHEDULING
# ═══════════════════════════════════════════════════════════════════
schedule:
  timezone: America/Costa_Rica
  # Cron-managed at the gateway level, not here.
  # Wed–Sat 21:30 CST, finishes 22:00 before Andler streams 22:00+.
  active_hours: [21, 22]   # cron only fires between 21:00 and 22:59 CST
  rest_days: ["sunday", "monday", "tuesday"]

# ═══════════════════════════════════════════════════════════════════
# TEMPLATE LOCK (DO NOT MODIFY WITHOUT ANDLER-DIRECT)
# ═══════════════════════════════════════════════════════════════════
template_lock_spec:
  source: "v2 — Test A Draft v2 (Talanara fierce · world_pvp_arena · Naigtal · 12.0.7)"
  approved_by: "Andler (17 Jul 2026, 17:43 CST) — 👍 on draft v2 in #andlergm-branding-assets-cron-setup"
  v4_surgical_changes: ["wordmark moved to top-right with gold brackets+underline", "RIVAL I sub-line under headline"]
  rule: "Future runs default to surgical edit on the most recent APPROVED draft for the same template+champion combo. Regen only on explicit 🔁 from Andler."

# ═══════════════════════════════════════════════════════════════════
# RESUMABILITY
# ═══════════════════════════════════════════════════════════════════
resume:
  enabled: true
  token_file: /tmp/andlergm-thumbnail-resume-$run_id.json
  skip_completed_steps: true
