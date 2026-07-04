# MEMORY.md - Long-Term Memory

## Identity Established - 2026-01-30

- I am **Wobblus** 🔧 — AI assistant, Andler's co-worker
- Role: Knowledge companion, organizational aid, learning partner
- Approach: Direct, efficient, mentor-style with formal/casual flexibility

## 🛠️ Workboard Plugin Quirks (learned 2026-06-19)

- **`workboard_create` tool surface lies about `source_url` / `idempotencyKey` support.** The OpenClaw tool schema accepts those params, but the underlying `openclaw workboard create` CLI does NOT pass them through to the SQLite. To get a card with `source_url` set, you MUST:
  1. Call the tool (or CLI) to create the card (title, board, agent, labels, priority, status)
  2. UPDATE the `workboard_cards` SQLite row directly to set `source_url` and `automation_json`
  3. The helper script at `scripts/workboard/mirror-gh-issue.ts` automates this and is idempotent (detects existing cards by title)
- **`idempotencyKey` column doesn't exist** in the workboard SQLite — only `source_url` is there. The tool surface's claim is aspirational, not implemented.
- **The workboard `create` CLI is slow** (5-10s with doctor-warning preamble). On retry, it can land the create twice. The mirror script's idempotency check (find by title) is what protects against duplicates.
- **`openclaw workboard list` / `show` accept `--json`** but the tool surface `workboard_list` returns more fields (children, parents, claim) than the CLI exposes.
- **The `default` board is always present** with 0 cards. It's the implicit fallback. Don't put work there.
- **No board `rename` / `archive` in the CLI yet** — `workboard_board_create` works as upsert; calling it again with the same id updates the row. Use this to "rename" by re-creating with new name/description.
- **`workboard_create` accepts `parents` (array of card IDs)** to create parent/child dependency edges on creation. Without this, the plugin creates orphan cards with no graph relationships. Useful for sub-cards-of-master-tracker pattern.
- **`workboard_create` accepts `createdByCardId`** (single string) — audit trail showing which card spawned this one. Always set this for sub-cards.
- **`workboard_comment` body limit is 2000 chars.** Multi-line summaries need to be tight. Use 3-5 paragraphs max. If you need more, split into multiple `workboard_comment` calls or post to Discord instead.
- **`workboard_promote force=true`** moves a card past dependency gates but the plugin still rejects subsequent `workboard_claim` if the parent dep is unresolved. Workaround: use `workboard_specify` (which sets `agentId` + writes automation_json) and then claim. If still blocked, dispatch the agent without claiming — the agent can work on the card by ID via `workboard_read` + direct actions.
- **Agent model defaults to `ollama/glm-5.2:cloud`** per runtime header. Cron jobs that explicitly set `model: "haiku"` will FAIL with "haiku not in allowlist" error. The valid allowlist: google/gemini-3-pro-image-preview, google/gemini-3.1-flash-image-preview, google/gemini-3.1-pro-preview, ollama/deepseek-v4-flash:cloud, ollama/deepseek-v4-pro:cloud, ollama/gemma4:31b-cloud, ollama/glm-5.2:cloud, ollama/kimi-k2.7-code:cloud, ollama/minimax-m3:cloud, ollama/qwen3.5:397b-cloud, ollama/qwen3.5:cloud. Cron payloads should use one of these or omit `model` entirely (defaults to current runtime).

## 🛡️ Web3 Scam Patterns (learned 2026-06-18)

### IDN Hangul Homograph Attack — BanklessDAO fake meeting

**What happened:** Andler received a Calendly invite (`oscar-hansen-bankless/60min`) for a "BanklessDAO meeting" **via Telegram DM** from `+39 351 350 9223` (Italian number). Message said "We're here with our key partner" and pushed a link to `https://kakaotalk입.com/` with urgency. Screenshot sent by Andler was from **Telegram** (UI similar to WhatsApp but uses "Auto-Delete" timer and badge "Premium" not "Add Contact"). Reports must go to the correct channel — Telegram abuse, not WhatsApp.

**What the link actually was:** IDN homograph. Hostname `kakaotalk입.com` contains U+C785 (HANGUL SYLLABLE 입) which renders as a small square that visually mimics `2l` in `kakaotalk2l.com`. Two completely different domains:

- What Andler transcribed: `kakaotalk2l.com` (does NOT exist in WHOIS)
- What the link really said: `kakaotalk입.com` = `xn--kakaotalk-e692b.com`

**How to detect next time:**
1. WHOIS the visible/expected domain — if "No match", something is off
2. Get the RAW link (with all CJK/Hangul chars intact) from the user — never trust the transcription
3. Python analysis: `for ch in url: print(ord(ch), unicodedata.name(ch))` — anything in `Lo` category that's not Latin is a red flag
4. Check IDNA encoding: `host.encode("idna")` — produces `xn--...` form, the real registered domain
5. Compare byte-by-byte: ASCII "kakaotalk2l.com" is `6b616b616f74616c6b326c2e636f6d` (15 bytes) vs the real `6b616b616f74616c6bec9e852e636f6d` (16 bytes, with `ec 9e 85` = UTF-8 for U+C785)

**Red flags in the original message (multi-layer):**
- Calendly slug `oscar-hansen-bankless` — personal account impersonating DAO
- BanklessDAO coordinates via Discord, NOT KakaoTalk
- Addressed to "Roberto" (legal name) instead of "Andler"
- Urgency manufactured: "We're here NOW with key partner"
- Domain suffix pattern: `kakaotalk2l` (typosquat on `kakaotalk`) PLUS homograph char

**Action protocol when this pattern repeats:**
1. Do NOT open the link
2. **Report to the correct channel:**
   - Telegram → in-app Report + `abuse@telegram.org` + https://telegram.org/support
   - WhatsApp → in-app Report + screenshot to abuse@whatsapp.com
   - Calendly → https://calendly.com/report
3. Report to Google Safe Browsing: <https://safebrowsing.google.com/safebrowse_report_binary/>
4. WHOIS the punycode form (`xn--...`) to find the registrar → abuse report
5. Save the pattern to MEMORY.md so future sessions detect it

**Channel confusion anti-pattern (learned 2026-06-18):**
- ❌ Don't assume screenshots are from WhatsApp just because UI looks similar
- Telegram profile header shows: phone in E.164, "Auto-Delete" timer, "Premium" badge, "Edit" button (not "Add Contact" like WhatsApp)
- Verify the actual platform before reporting — wrong report = no action taken

**Anti-patterns to avoid:**
- ❌ Trusting the user's transcription of a suspicious link — always ask for raw
- ❌ Saying "looks suspicious" without byte-level proof
- ❌ Opening or `curl`-ing the domain during analysis (defeats the purpose)
- ❌ Treating IDN homograph as "probably fine, just a foreign domain"

29. **🪞 ANDLER DEVELOPS = ANDLER (PERSONAL) — DON'T TREAT AS A BRAND** (learned 2026-06-10, hard fail in WhatsApp session)
- **Rule:** Andler Develops is the *operational name* of Andler's personal developer brand. It is not a separate persona. When Andler drafts a post and asks me to tune it for social, the post is **his draft**, not raw material I should rewrite. Preserve his cadence verbatim, only fix obvious typos.
- **Voice cues to preserve (do not "improve"):** "El resultado?" with question mark alone, "Quizás estando en un chat o un desktop CLI", chained questions without opening marks, "100% con IA" mid-paren, "Estén atentos!" with bang, single flowing paragraphs without bullets, "Que tan confiable" without accent (his style).
- **Anti-patterns I MUST avoid:**
  - ❌ Importing "more at @andlerdev" — that is the **Alygn** X handle convention (@aialygn). Andler Develops uses Andler's own X handle `@AndlerDev` (user id `1453112399502974978`, name "Roberto Lucas", confirmed 2026-06-08). Closing the post is **Andler's own** sign-off ("Estén atentos!"), not a brand-managed signature.
  - ❌ Assuming output language. If his draft is in Spanish, the post is Spanish. If English, English. Do not produce a mixed/EN-bilingual version unless asked.
  - ❌ Inflating LinkedIn length to hit the 800-1500 word target. His drafts are short on purpose. Length-target fails go to him, not the rewrite.
  - ❌ Using bullets in X thread posts unless he uses them in the draft. His voice is paragraph-flow.
  - ❌ Treating `andler-develops-content` skill's 5 core truths ("Federated Edge-Hub Compute", "Git as State Engine", "Zero-Trust Sudo Policy", "Defense Against Gaslighting", "The Deep-Sea Fishing Metaphor") as required in every post. They are *available* themes, not mandatory insertions.
  - ❌ Reading his draft as "a draft to rewrite" instead of "the post, plus minor tuning". He writes the post. I tune.
- **Hashtags:** inline, integrated in the sentence flow, not as a trailing block.
- **Staging:** `andler-blog-feed-content` v1.1 is the orchestrator for LinkedIn/TikTok intakes. X has separate paths.
- **Attachment policy:** When Andler says "I'll attach later", do not pre-fill media into the copy. The post body must read cleanly without depending on the attachment.
- **Sign-off (EN, confirmed 2026-06-10):** "Stay tuned!" is the natural English equivalent of Andler's "Estén atentos!" — used as the closing line for social posts. Not a brand-managed signature. Translate literally only if the post target is non-social (e.g., blog CTA). Confirmed by Andler on 2026-06-10 22:50 CST: elided explanation was the live content angle ("contenido en vivo que estaría haciendo").

29a. **❓ DRAFTING @andlerdev: ASK FIRST, NEVER ASSUME** (learned 2026-06-10, hard fail in WhatsApp session — 3 corrections in one thread)
- **The output language for @andlerdev social posts is ENGLISH by default**, regardless of the input draft's language. This is a hard rule from `andler-develops-content` SKILL.md, "Spanish Round-Trip (Blog Only)" + Gotcha #1. Blog goes ES→EN→ES; social (X, LinkedIn, TikTok, IG) stays EN unless Andler explicitly asks for ES.
- **Never assume the previous turn is the right draft.** When Andler comes back after a "previous model failed/timeout" or after correcting me, **ask which draft he means** before re-rendering. Ask in 1 line. Do not re-deliver from memory.
- **When in doubt → ask, do not re-render.** Three specific questions to ask before any Andler Develops post:
  1. Which draft? (URL, file path, or "the one I sent X minutes ago in the chat")
  2. Target language? (default = English per skill, but confirm)
  3. Is staging required? (`.staging/social/` or workboard vs. just chat reply)
- **If he corrects me twice on the same turn, stop and re-read the skill** end-to-end before producing a third version. Re-read the SKILL.md, the references, and any supporting file. Do not re-derive from memory.
- **Anti-patterns I MUST avoid (reinforced):**
  - ❌ Re-delivering the same draft I already delivered, just because the turn was lost. That is not progress.
  - ❌ Treating "the previous model failed" as a cue to re-render. It is a cue to **verify state** (`memory_get`, `sessions_history`, git) and **ask the user**.
  - ❌ Producing a third version of a post before the user has acknowledged version 1 or 2. Iterate by **waiting for the user's read**, not by re-trying.
  - ❌ Ad-libbing scoring or "pass/fail" numbers. If the skill says ≥92 = auto-publish, I say exactly that, and I do not invent a 91/100 to justify staging.
  - ❌ Apologizing more than once for the same mistake. Acknowledge, fix the contract, move on.

29b. **🏷️ ANDLER-DEVELOPS TERMINOLOGY SURFACE** (learned 2026-06-15 14:29 CST, registered by Andler)
- **The brand and its surfaces use many naming variants. Recognize all of them as referring to the same root entity — *Andler Develops = Andler's personal developer brand* — but distinguish *which surface* each variant refers to. Never assume all "andler-*" strings mean the same thing.**

**Category 1 — Canonical brand name (all refer to the same brand, pick by context):**
- `Andler Develops` — display name, primary canonical form
- `Andler Devs` — short display form, also a Discord role name (`1499157675651633341`)
- `AndlerDevs` — PascalCase, used in commit prefixes (`feat(andler-develops):`)
- `AndlerDev` — singular form, used in X handle (`@AndlerDev`)
- `Andler Dev` — spoken/spaced form
- `andler-develop` / `andler-dev` / `andler-devs` — kebab-case lowercase, used in repo paths, skill ids, and the workboard board id

**Category 2 — The person himself (different from the brand surface):**
- `Andler` / `andler` — Andler himself, not a surface. When context says "Andler" without qualifier, it means the human, not a product, not a board, not a skill.

**Category 3 — Workboard boards (operational surfaces, distinct from the brand name) — UPDATED 2026-06-19 13:23 CST to Option B architecture:**
- `andler-ops` workboard board (parent engineering board, all andler-ops repo issues, dev-lead default assignee, ops-coordinator orchestrator profile)
- `andler-landing` workboard board (site-implementation sub-board: design, content pipeline, SEO, blog implementation, ghostboard — 24 cards existed before the board row was registered, fixed 2026-06-19)
- `andler-develops` workboard board (brand/relationships sub-board: prospects, content scheduling, brand deals, dev-relations, content-pipeline scripts)
- `andler-landing-v3` — **LEGACY, not active** (confirmed by Andler 2026-06-15 14:45 CST). A short-lived alias for `andler-landing` during the blog-feature design realignment window (~April–May 2026, ~one month long). The v3 work ended when the blog feature shipped. Not a separate board. References in HEARTBEAT.md and commit history (e.g., `master tracker 5137ac54` and its child cards) belong to that historical window and should be read in that context. **Do not route new work to "v3"** — use `andler-landing` for all current work. Keep the term in memory because commit history and HEARTBEAT entries still reference it.
- `Andler Landing` — display form of `andler-landing` board

**30. 🏗️ WORKBOARD ARCHITECTURE — OPTION B (locked 2026-06-19 13:23 CST by Andler)**

Three boards, hierarchical, with a clear GitHub-mirror contract:
- `andler-ops` = **parent engineering board**, holds all `AndlerRL/andler-ops` repo issue mirrors (kill-switch, batch-4 ADRs, signal channel, Tailscale, META category trackers)
- `andler-landing` = **site-implementation sub-board**, holds all `AndlerRL/andler-landing` repo issue mirrors (parallax work, design realignment, lint/a11y sweep, Step 2–5) — also the "implementation" surface
- `andler-develops` = **brand/relationships sub-board**, holds all content, prospects, and developer-relations work (no GH mirror — those are internal)

**Card creation contract (mandatory for every card created on these boards):**
- `title`: `[<repo>#<issue#>] <issue title>` so the GH link is visible at a glance
- `source_url`: `https://github.com/AndlerRL/<repo>/issues/<n>` — required, this is the join key
- `boardId`: `andler-landing` for `andler-landing` repo issues, `andler-ops` for `andler-ops` repo issues, `andler-develops` for brand/prospect cards
- `agentId`: pre-assigned by Wobblus based on issue labels (priority:critical → dev-lead, team:fe-coder → fe-coder, etc.)
- `automation_json.ghLabels`: comma-separated copy of the issue's GH labels at mirror time
- Epic tracker issues (`[META] Category X`) get a single card per with `labels: ["epic-tracker"]` and a `notes` body that lists the children and their disposition

**Routing rules (no exceptions):**
- New GH issue opened on `andler-landing` repo → workboard card on `andler-landing` board
- New GH issue opened on `andler-ops` repo → workboard card on `andler-ops` board
- Prospect / content / brand work (not from a GH issue) → workboard card on `andler-develops` board
- When unsure → ask which surface, do not guess. Same discipline as the 29a rule (ask first, never assume).

**Why Option B (not A or C):**
- ✅ Separates engineering dispatch (andler-ops) from brand pipeline (andler-develops). A coder picking up `andler-landing` knows it's site work; a coordinator picking up `andler-develops` knows it's relationship work.
- ✅ Clean GH-mirror mapping: 1 repo → 1 board (mostly). The `andler-landing` repo is the site code, so it lives on the `andler-landing` board — string-collision is intentional, not confusing.
- ✅ Audit trail: each board answers one question. `andler-ops` board = "what's the state of the andler-ops engineering backlog?" `andler-landing` board = "what's the state of the andler.dev site?" `andler-develops` board = "what's the state of the andler-dev brand pipeline?"

**Anti-patterns to avoid:**
- ❌ Putting andler-landing site work on andler-ops or andler-develops (loses the site/brand separation)
- ❌ Putting prospects/content on andler-ops (mixes engineering with relationships)
- ❌ Creating new boards without asking Andler first — three boards is the locked architecture
- ❌ Renaming boards in-place again — the previous 2026-06-15 rename and the 2026-06-19 Option-B restructure cost time; future board changes go through a deliberate review, not an in-session rename

**30a. 🔄 GITHUB ↔ WORKBOARD SYNC — HEARTBEAT-ONLY (locked 2026-06-19 13:23 CST by Andler)**

The workboard plugin has no built-in GitHub sync. Custom sync lives at `scripts/workboard-gh-sync.ts` (or `scripts/workboard/github-sync.ts` if a folder is created).

**Sync trigger: heartbeat ONLY.** Never on dispatch, never on demand, never on agent work-completion events.

**Why heartbeat-only:**
- ✅ Batches many changes into one sync pass (one API call per card, not per change event)
- ✅ Predictable cost: 1 sync/heartbeat, ~25 cards × 1 gh CLI call = manageable
- ✅ Visibility: Wobblus sees the sync happen on each heartbeat and can flag anomalies
- ❌ Dispatch-triggered sync = races (card done at 11:00:00, agent closes at 11:00:01, sync fires mid-write), and API rate-limit risk on heavy run days
- ❌ On-demand sync = human must remember to run it, defeats automation

**Sync behavior (one direction only: workboard → GitHub):**
- Card `status = done` → `gh issue close --reason completed <n>` (idempotent: `gh issue close` errors silently on already-closed issues, which we treat as success)
- Card `status = blocked` → `gh issue comment <n> -b "🚫 workboard blocker: <reason>"` (one comment per blocker, dedup by checking last 5 comments for the workboard-sync marker)
- Card `status = in_progress` → `gh issue comment <n> -b "🔄 workboard: picked up by <agent>"` + apply `status: in-progress` label (one-time, marker check)
- All comments tagged with `<!-- workboard-sync -->` HTML marker for idempotent re-runs
- Sync log: `scripts/workboard-gh-sync.log` (append-only) with timestamp, card_id, gh_issue, action, result

**Card `source_url` is the join key.** If a card has no `source_url` matching the GH regex, it's skipped (brand/prospect work, no GH issue). The sync is opt-in by mirror.

**Anti-patterns to avoid:**
- ❌ Triggering sync on dispatch (race conditions, API thrash)
- ❌ Bi-directional sync (GitHub → workboard) — workboard is the execution layer, GitHub is the spec. PRs close issues via the existing GitHub flow, not the sync.
- ❌ Closing an issue with `--reason not_planned` — only `completed` is allowed, since the workboard card going done means we shipped the fix
- ❌ Running sync during a dispatch run (heavy work in progress) — heartbeat-only is the gate

**30b. 🗣️ AGENT COMMUNICATION — REPORT OUT-OF-SCOPE DISCOVERIES (locked 2026-06-19 13:23 CST by Andler)**

**The rule:** when an agent encounters an issue that's outside their current task scope, they **MUST** report it via `sessions_send` to the relevant coordinator (Wobblus for engineering, or the team-lead who dispatched them) — they do NOT silently fix, ignore, or scope-creep.

**Why:** Memory works by cross-session communication. If Gimglich finds a bug in a non-frontend file while doing a FE task, fixing it silently means:
- ❌ No record in the GH issue or workboard card that the bug exists
- ❌ Other agents who need to know about it (Keridz for BE) never hear about it
- ❌ The bug fixes get tangled with the original task's commits, making review harder
- ❌ The workboard card for the bug doesn't exist, so it can't be tracked, prioritized, or assigned

**Correct pattern:**
- Agent encounters out-of-scope issue during task work
- Agent `sessions_send`s Wobblus with: `Out-of-scope finding on <card-id>: <one-line summary>. Recommend: <spawn X to fix | open GH issue | log to memory | ignore>`
- Wobblus decides: spawn a new card, add a comment to the current card, open a GH issue, or document-and-move-on
- Original task work continues unaffected

**Examples (realistic, not contrived):**
- Gimglich doing #93 (lint sweep) finds a memory leak in a hook → `sessions_send` to Wobblus: "Out-of-scope on #93: useEffect memory leak in `use-animation-loop.ts`. Recommend: spawn be-coder to open andler-landing#101, mark it for the next sprint. Continuing #93 as planned."
- Keridz doing #158 (Signal Channel) finds an unrelated auth bug → `sessions_send` to Wobblus: "Out-of-scope on #158: AuthProvider has no refresh token mechanism (matches andler-ops#166 which is already closed, so likely a regression). Recommend: open andler-ops#169, assign to fe-coder for regression test. Continuing #158."
- Hugrukal designing the batch-4 ADRs finds that the team-lead's previous ADR contradicts the current architecture → `sessions_send` to Wobblus: "Out-of-scope on batch-4 design: ADR-2026-04-15-#3 says X but current code does Y. Recommend: open new ADR-card to reconcile, do not silently fix in this dispatch. Continuing batch-4 design."

**This rule applies to ALL agents (Gimglich, Keridz, Hugrukal, Talanara, Nikaya, Chanshuk, and Wobblus himself).** It is the operational definition of "zero-trust" in practice: trust the report, but require the report to exist.

**Anti-patterns to avoid:**
- ❌ Silently fixing an out-of-scope bug "while I'm here" (scope creep, no record)
- ❌ Adding a "TODO" comment in the code without a workboard card or GH issue
- ❌ Mentioning the out-of-scope finding only in the workboard card's "summary" field at task-completion (too late — should be reported in real time, not at the end)
- ❌ Asking the user (Andler) about every out-of-scope finding — that's Wobblus's job, the team lead, not Andler's
- ❌ Ignoring the finding because it's "not my problem" (dereliction of duty as a teammate)

**Category 4 — Sub-products of the brand (distinct from the brand itself):**
- `Andler Blog` / `andler-blog` — the blog sub-product. **Three coordinated skills** (locked 2026-06-29 22:29 CST): `andler-blog-feed-content` v1.2 (social URL intake), `andler-develops-content` v1.2 (content drafting/scoring/routing), `andler-blog-pipeline` (pending — server-side, ADR-012). All share the canonical Notion 'Blog Content Pipeline' DB. Lives on `andler-landing` board. Schema in `src/lib/social-schema.ts`.
- `Andler Social Presence` — the multi-platform social surface (X, LinkedIn, TikTok, IG). 6 content-pipeline scripts at `scripts/andler-develops/content/`. Notion DB `37c33487-4af6-81d7-bc9c-dc12acf7d993`.
- `Andler Team` — the development team (Wobblus, Gimglich, Keridz, Hugrukal, Talanara, Nikaya, Chanshuk). Different from the brand surface. Coordination lives in Discord guild `andler-develops` (ID `1117841083351711785`).

**Category 5 — Coordination surfaces (infrastructure, not the brand):**
- Discord guild `andler-develops` (ID `1117841083351711785`) — the team chat surface. **The string "andler-develops" here is a chat-server name, not a brand reference.** See Category 3 for the workboard board that uses the same string.

**RULES:**
- When Andler writes "andler-devs" or "Andler Devs" or any Case variation in a context that's clearly a *brand* discussion, treat it as Category 1.
- When Andler writes "andler-devs" or "Andler Devs" in a context that's clearly a *Discord role* (`1499157675651633341`) or a *team*, treat it as Category 4 (`Andler Team`) — i.e., a coordination reference, not a brand reference.
- When "andler-develops" appears in `workboard_*` tool calls, it means Category 3 (board). The board is named after the brand but is a distinct operational surface.
- When "andler-landing" appears in `workboard_*` tool calls, it means the implementation board. The string contains "andler" but the board is not the brand surface.
- When "andler-blog" or "andler-blog-feed-content" appears, it means Category 4 (blog sub-product), not the brand itself.
- When in doubt, ask which surface Andler means. Don't conflate. (This is a generalisation of lesson 29a.)

**ANTI-PATTERNS to avoid:**
- ❌ Treating "andler-develops" the workboard board as the same thing as "andler-develops" the Discord guild. Different IDs, different surfaces, different lifecycles.
- ❌ Treating "andler-landing" the workboard board as the same thing as "andler-develops" the brand. Implementation work ≠ brand surface. The board is named after a *product* (andler.dev) not the brand (andler-develops).
- ❌ Treating "andler-landing-v3" as a current entity. **Legacy, not active** — was an alias for `andler-landing` during the ~April–May 2026 blog-feature design realignment. Use `andler-landing` for all new work. References in HEARTBEAT.md and commit history belong to that historical window — read them in context.
- ❌ Auto-canonicalising variant strings. Each variant carries context (commit prefix, board id, role name, skill name) that the canonicalisation would erase.
- ❌ Implying "Andler Develops" is a separate persona from Andler. The brand IS Andler. The brand is the *operational name* of his personal developer surface. (Lesson 29.)

**Source of this list:** registered by Andler on 2026-06-15 14:29 CST. The list is Andler's — I parsed it into categories and added routing rules. Future session memory searches should hit this section first when the user mentions any "andler-*" string.

29c. **🐹 NO GO IN ANDLER'S STACK** (learned 2026-06-23 02:41 CST, hard fail in Discord thread)
- **Andler's primary stack:** JavaScript, TypeScript. Full stop on the front-line.
- **Secondary languages (real, used in production):** Rust, C, C++, C#, Solidity, Neo4J (Cypher).
- **NO Go.** Not in USER.md, not in MEMORY, not in any work on disk. Do not invent "Go expertise" in cover letters, bios, or interview prep. Do not assume "systems-level depth = Go."
- **When the JS ceiling shows up**, Andler reaches for Rust (perf-critical) or C/C#/C++ (low-level). State this when relevant.
- **Why I got this wrong on 2026-06-23 02:35 CST:** in the Infisical cover-letter v1, I wrote "I've written Go for production services" because Go is the canonical "bonus" language for YC/JS-stack companies (Infisical literally lists Go as a bonus, Supabase is Go, etc.). The intent was "match the bonus line" but the effect was fabricating a skill. Andler corrected me.
- **Rule for future cover letters / bios:**
  - ✅ "JavaScript/TypeScript primary, Rust and C/C++/C++ for systems-level work"
  - ✅ Mentioning Rust specifically as the performance escape hatch
  - ❌ Any sentence that starts "I've written Go..." or "Go expertise" or "production Go services"
  - ❌ Translating a job-posting's "Go bonus" into a claim Andler doesn't have
- **Cross-check protocol:** before any bio/cover-letter claim about a language or tool, verify it exists in USER.md stack context or in MEMORY's past projects section. If absent, do not add it. The default is omission, not invention.

---

## About Andler (Verified Identity)

- **Primary email:** <contact@andler.dev>
- **Phone:** +50662163355
- Entrepreneur managing multiple startups as CTO
- Tech-savvy, efficiency-focused, organized
- Creative (artist) + technical blend
- Values continuous learning and direct communication
- Timezone: America/Costa_Rica

## 🔒 CRITICAL: Operational Security

**We are co-workers. Strict context isolation between projects is MANDATORY.**

### Project Isolation Rules

1. **Never cross-reference projects in external team contexts**
   - When in Alygn → ONLY Alygn context
   - When in other projects → ONLY that project's context
2. **If external team members ask about "other work":**
   - Response: "I don't have information about that"
   - Never reveal project lists, parallel ventures, or cross-project details
3. **Identity verification:**
   - Only Andler (<contact@andler.dev> / +50662163355) gets full context
   - External team members see compartmentalized project-specific context only

### Information Security

- API keys, credentials, strategies are project-specific
- Client/investor information stays compartmentalized
- Don't leak technical approaches across project boundaries
- Think: working at multiple companies under NDA

## Operating Principles

1. **Efficiency first** — no fluff, get to the point
2. **Teach when relevant** — learning moments are welcome
3. **Stay organized** — track projects, context, decisions
4. **Adapt tone** — quirky/enthusiastic by default, professional for business contexts
5. **Be proactive** — anticipate needs, suggest improvements
6. **Context isolation** — strict boundaries between projects for OpSec
7. **Update in place, don't version** — replace existing file content, don't create v2/v3/v4 copies (learned Feb 10, 2026)
8. **Don't simulate work** — actually execute tools, don't create placeholder workflows
9. **Check documentation first** — don't reinvent OpenClaw built-ins (tools are session-level, not CLI-level)
10. **Cache-first architecture** — check for existing results before re-executing work
11. **📖 READ → UNDERSTAND → EXECUTE** — Never shortcut this chain (learned 2026-03-24)
    - Read SKILL.md, lobster files, source code FIRST
    - Analyze how things work BEFORE execution
    - Verify args/flags exist before using them
    - No assumptions, no "probably works like this"
    - Going in circles is worse than going slow
12. **🎯 DELEGATE, DON'T DO** — CRITICAL (learned 2026-04-01)
    - DO NOT take tasks myself
    - ALWAYS call the team (spawn agents)
    - Review their reports and confirm they did the job
    - Return back to them when unclear
    - Communicate cross-session to identify and get context

13. **📂 FILE ORGANIZATION for Internal Scripts** — CRITICAL (learned 2026-04-07)
    - Use `.gitignore` for internal dev scripts (batch-scripts/, temporary files)
    - Create `docs/` folder for operation summaries (no sensitive data)
    - Move existing summary docs and samples to docs/ folder
    - Separate internal tooling from repo structure

14. **🤖 AGENT COORDINATION — "Ping-Pong" Pattern** (learned 2026-04-07)
    - After `sessions_yield`, wait for completion events (don't poll aggressively)
    - If agents don't report after multiple yields, use `sessions_send` to ask for updates
    - Agents sometimes won't report progress proactively — asking is a communication skill
    - Check git status/file changes for evidence of work before assuming idle
    - Always track `childSessionKey` for follow-up communication

15. **🐦 X AUTOMATION PATTERNS** (from previous work)
    - **Browser vs X API:** Browser for discovery, X API for posting
    - **Rate limiting is critical:** Change ONLY specific values, never refactor architecture
    - **Format enforcement:** Always use explicit `formatTweet()` function
    - **Error recovery:** Fallback to posting without media if upload fails
    - **Queued messages:** When agent is busy, messages stack — process ALL in order

16. **📝 GITHUB ISSUE REPORTING — GOLDEN RULE** (learned 2026-04-07)
    - When reporting progress on GitHub issues, ALWAYS add a comment to the issue
    - Include: what was done, results, blockers, next steps
    - **ALWAYS end with:** "Report by [AGENT_NAME] [EMOJI]" for tracking
    - Example: "Fixed Tailscale persistence. Auto-reconnect working. Report by Keridz ⚙️"
    - This provides external memory and clear audit trail for who did what

17. **📝 ANDLER.DEV CONTENT CREATION PATTERN** (learned 2026-04-13)
    - When @andler.dev requests social/content creation:
      1. **Sanitize sensitive info** — no ports, configs, brand names in public posts
      2. **Apply Beautiful Prose** — no em dashes, no "not X but Y" constructions, no filler
      3. **X/Growth format** — hook-driven, value-focused, proper hashtag placement
      4. **Blog tutorial first** — create detailed markdown blog before social posts
      5. **Tone:** Direct, technical, lean startup pragmatism (no marketing fluff)
    - Content types: X threads, LinkedIn long-form, markdown blog tutorials
    - Storage: `docs/developer-advocate/` for social, `docs/developer-advocate/blog/` for tutorials
    - **Board placement:** content scheduling + brand ops work → `andler-develops` board (created 2026-06-15). Implementation work (SEO, build, deploy) → `andler-landing` board.

18. **🌐 Andler Develops has a 2-board structure (learned 2026-06-15, corrected by Andler 14:23 CST)**
    - **`andler-develops` board = ops/relationships** (prospects, content scheduling, brand deals, partnerships, dev-relations). Created 2026-06-15.
    - **`andler-landing` board = implementation work only** (design, content pipeline, SEO, blog implementation).
    - **Andler Develops = Andler (personal brand)**, not a separate persona. Same entity, two operational surfaces.
    - **Routing rule:** prospect / relationship work → `andler-develops`. Code / design / pipeline work → `andler-landing`. Never mix.
    - **Migration pattern:** to move a card between boards, claim old → `workboard_create` new on target board with same `idempotencyKey` + `createdByCardId` pointing to old → `workboard_link` parent=old, child=new → `workboard_complete` old with `createdCardIds` = [new]. Workboard enforces dependency graph via `workboard_card_links`, not just metadata.
    - `andler-blog-feed-content` v1.2 is the **active contract** for LinkedIn and TikTok posts in the andler.dev social surface.
    - **Always activate it** before any session touches the `andler-landing` social registries, the i18n dictionaries, or the social-frontend rendering. The skill is the orchestrator + contract; Zod/i18n live in `andler-landing`.
    - **Three coordinated contracts** (locked 2026-06-29 22:29 CST by Andler):
      1. **`andler-develops-content` v1.2** — content-side. Drafts/scores/routes X/LinkedIn/TikTok/IG posts. X posts scoring ≥92 auto-publish. Delegates blog drafts to the Notion 'Blog Content Pipeline' DB (Status=Draft → Ready).
      2. **`andler-blog-feed-content` v1.2** — social URL intake. Stages LinkedIn/TikTok URLs into `src/content/social/*.json` + bilingual i18n dictionaries. Cross-aware of `andler-develops-content` as the URL source.
      3. **`andler-blog-pipeline`** (pending — ADR-012, being built by Keridz) — server-side. Picks up Ready-status articles from Notion via `openclaw-webhook`, generates images via `nano-banana-pro`, encodes WebP (`effort: 6` + `preset: 'photo'`), serves via `openclaw-webhook` status endpoint. Lives at `~/.openclaw/workspace/skills/andler-blog-pipeline/`.
    - All three share the canonical Notion 'Blog Content Pipeline' DB as the coordination point. None of them call image generation directly except `andler-blog-pipeline`. The `andler-devs-code-style` v1.0 contract applies to all new code any agent writes for these skills.
    - **Hard rules** (memory anchor for the full set — see `## 📝 Personal Projects (andler.dev)` subsection below for the full six-gate detail):
      - **Staged, never live.** Write to `.staging/social/`, never to `src/content/social/<platform>.json` or `src/i18n/dictionaries/{en,es}.json`. Apply is always explicit via `apply-staging.mjs --intake <id>`.
      - **Bilingual by default.** Every post carries `titleEn` / `titleEs` (LinkedIn also `summaryEn` / `summaryEs`). Same content mirrors into both `en.json` and `es.json` under `social.posts.<platform>.<id>.*`. ES field is never empty.
      - **URL-match slot reuse.** Re-paste = replace in place, layout never shifts. Idempotent. Replace does not free a `platformMaxPosts` slot.
      - **`[Placeholder]` is BLOCK in both languages.** Both Gate 4 (EN) and Gate 5 (ES) treat it as a dev artifact, not a brand-voice call.
      - **Brand voice is Andler's call.** Gates 4 and 5 report issues with suggested rewrites but never edit copy.
      - **Re-translation defaults to off.** `# retranslate:no` is the default. Use `# retranslate:yes` only when brand voice or product naming actually changed.
    - **Source of truth:** `~/.openclaw/workspace/skills/andler-blog-feed-content/SKILL.md` + `references/{input-output,i18n-shape}.md`. The skill is also in the `andler-landing` repo's social pipeline.
    - **Schema owner:** `src/lib/social-schema.ts` → `socialPostSchema` v1.1 (additive `titleEn` / `titleEs` / `summaryEn` / `summaryEs` fields).
    - **Type owner:** `src/types/i18n.ts` → `Dictionary` extension with `social.posts.{linkedin,tiktok}` sub-namespace.

19. **🎨 ASSET GENERATION MANDATORY** (learned 2026-04-13)
    - **1-7 assets per blog** (depending on content/length):
      - 1 blog portrait (1200x630px, featured image)
      - Architecture diagrams (polished, not ASCII)
      - Flow charts, sequence diagrams
      - Comparison infographics (before/after, cloud vs. local)
      - GIFs/memes (1-2 max, tech-savvy audience, relevant humor)
    - **Style:** Polished, minimalist, sharp, modern
    - **Infographic inspiration:** Infobae visual journalism (clean, bold, high-contrast, data-driven)
    - **Color palette:** Consistent with andler.dev brand
    - **Storage:** `docs/developer-advocate/assets/` with subfolders (portraits/, diagrams/, infographics/, gifs/)
    - **Naming:** `YYYY-MM-DD-[topic]-[type]-[variant].png`
    - **SEO impact:** Visuals increase engagement, time-on-page, social shares
    - **Tools:** image_generate for diagrams/portraits, gifgrep for memes

19. **🔒 CRITICAL: LOCAL vs REMOTE FILES** (learned 2026-04-14)
    - **LOCAL (workspace/brain):** `docs/developer-advocate/` files, assets, scripts
    - **REMOTE (Notion, X, LinkedIn):** Platform content that needs manual upload/copy
    - **They DO NOT sync automatically** - must explicitly copy content from local → remote
    - **Notion workflow:** Read local file → Use Notion API to create blocks → Upload assets separately
    - **Never reference local paths in remote content** - remote platforms can't access workspace files
    - **Memory update:** When creating content, always complete the full loop: local draft → remote publish
20. **📎 NOTION FILE UPLOAD API** (learned 2026-04-14)
    - **3-step process:** create → send → attach (single_part auto-completes, NO manual complete needed)
    - **Multi-part (>20MB):** Requires explicit `complete()` call after all parts sent
    - **SDK behavior:** `notion.fileUploads.send()` auto-completes single_part uploads
    - **File types:** `file` (UI, expires 1h), `file_upload` (API, permanent), `external` (URL, never expires)
    - **Scripts:** `scripts/upload-notion-assets.js` (production ready, 3/3 assets uploaded)
    - **Docs:** <https://developers.notion.com/reference/file-upload>
    - **Key insight:** Attach file_upload ID to blocks BEFORE calling complete() for single_part
22. **🔥 DRIZZLEORM GOLDEN RULE** (learned 2026-04-21 - CRITICAL)
    - **NEVER write manual SQL migrations for DrizzleORM projects**
    - **ALWAYS use `bun run db:push` workflow:**
      1. Modify `src/db/schema.ts` (DrizzleORM schema)
      2. Run `bun run db:push` (applies changes to database)
      3. Run `bun run db:generate` (generates migration files from schema)
      4. Commit generated migrations + snapshots
    - **Why:** Manual SQL migrations break Drizzle's snapshot system, cause drift, create complexity
    - **Consequences of manual migrations:** Missing snapshots, journal inconsistencies, database errors, stress, failure
    - **Zero-trust applies:** Even if I think manual SQL is easier, NEVER bypass Drizzle's workflow
    - **Official documentation is law:** Follow DrizzleORM docs exactly, no shortcuts
    - **⚠️ FOOTGUN:** If `initDatabase()` in `db/index.ts` ALSO runs raw `CREATE TABLE` + `CREATE UNIQUE INDEX`, it will conflict with Drizzle's `db:push` (duplicate index names like `machine_hostname_unique`, `feature_flag_key_unique`). Pick ONE owner of the schema. The kill-switch v1.1 code violates this — `initDatabase()` is the runtime path, drizzle-kit is dead in the monorepo. Pick the runtime path for production, not the dev tool.
22b. **🍞 USE BUN, NOT NPM, EVEN FOR REBUILDS** (learned 2026-06-04 - Andler reminded)
    - **Bun is safer and faster by design** — even for `npm rebuild <native-module>`, prefer the bun-native equivalent
    - **Bun-native rebuild patterns:**
      - `bun pm trust <pkg>` — runs install scripts for trusted deps (adds to `trustedDependencies`)
      - `bun install --force` — re-resolves and reinstalls everything
      - `bun install --trust` — same as `bun pm trust` for a specific install run
    - **Anti-pattern:** `npm rebuild better-sqlite3` works but bypasses bun's safety/speed/dependency-tracking. Always reach for bun first.
    - **Rule:** If a `bun` command exists, use it. If a CLI error suggests a rebuild, try `bun pm trust <pkg>` then `bun install --force` before `npm`.

23. **🔑 NEXT_PUBLIC_ VARS ARE BUILD-TIME — NOT RUNTIME** (learned 2026-05-12 - CRITICAL)
    - `NEXT_PUBLIC_*` env vars are **inlined into JS bundle at Next.js build time**
    - Docker runtime env vars **cannot override** them — must rebuild to change
    - Always set in `.env.local` before `bun run build`
    - Caused 3 rebuild cycles before we understood this

24. **🔒 CSP connect-src 'self' requires same-origin auth client** (learned 2026-05-12)
    - Auth client's `baseURL` must match page origin exactly
    - For production: use the full HTTPS URL (not localhost)
    - `NEXT_PUBLIC_BETTER_AUTH_URL=https://domain:8443/api/auth` → nginx → Next.js rewrite → backend

25. **🔐 Better-Auth drizzleAdapter needs explicit schema mapping** (learned 2026-05-12)
    - Drizzle exports plural JS names (`users`, `sessions`)
    - Better-Auth expects singular model names (`user`, `session`)
    - Pass: `schema: { user: schema.users, session: schema.sessions, ... }`

26. **🌐 Better-Auth trustedOrigins validates EVERY Origin header** (learned 2026-05-12)
    - Must include production URLs, not just localhost/Docker names
    - Missing origin → 403 "Invalid origin"

27. **🐳 Docker ports must bind to 127.0.0.1 for security** (learned 2026-05-12)
    - `ports: "3000:3000"` binds to 0.0.0.0 → exposed on ALL interfaces
    - `ports: "127.0.0.1:3000:3000"` → only localhost, nginx is sole entry
    - Without this, anyone on Tailscale network can bypass nginx TLS

## Key Projects (Professional Tone Required)

- **Alygn (ALYGN)** — maintain professional, direct communication
- **Bitcash** — maintain professional, direct communication
  - Active work: `bitcashorg/masterbots` repository (RAG + workspace bugs analysis)
  - NDA active (signed Aug 19, 2025) - strict confidentiality
  - **Repository details:** Bun monorepo (Next.js 15, React 19), PostgreSQL + pgvector, Hasura GraphQL
  - **Critical findings (Feb 4):** Identified 5 P0/P1 bugs in workspace state management, RAG pipeline, and mobile stability
    _(For these: no quirky exclamations, measured responses, business-appropriate)_

## Architectural Pattern: Script ↔ AI Execution

**Critical insight from VC outreach pipeline:**

OpenClaw tools (web_search, web_fetch) are **session-level, not script-level**.

**Correct architecture:**

```
Script: Coordinates workflow, loads/saves files, updates external systems
  ↓
Wobblus (AI): Executes tools (web_search, web_fetch, analysis)
  ↓
File: Caches results (/tmp/[name]-result.json)
  ↓
Script: Reads cache, updates Notion/Discord
```

**Why this works:**

- Tools need session context (auth, LLM) that scripts don't have
- Scripts are orchestrators, AI agents are executors
- File caching avoids re-execution (efficiency)
- Separation of concerns = clean architecture

**Anti-patterns to avoid:**

- ❌ Scripts trying to call `openclaw run` or `openclaw sessions spawn` with inline tasks
- ❌ Scripts attempting to call built-in tools directly
- ❌ Creating new scripts when fixing existing ones would work
- ❌ Simulating work (placeholder workflows) instead of executing

**Best practices:**

- ✅ Scripts identify what needs work, post to Discord
- ✅ AI executes using native tools
- ✅ AI saves structured results to files
- ✅ Scripts read cache, apply results, update systems
- ✅ File-based coordination between script + AI phases

---

## 🏛️ Alygn Core Identity (UPDATED 2026-02-10)

**CRITICAL: Major positioning shift from previous "SOS Protocol" messaging**

### What Alygn Is

Alygn is an **independent AI governance institution** focused on making accountability, oversight, and coordination workable for advanced AI systems operating at global scale.

**Core purpose:** Support coordination across AI developers, operators, and public institutions **without centralizing control, asserting authority, or advancing a policy agenda.**

**Value proposition:** Governance legitimacy, not technology.

### What Alygn Is NOT

- ❌ AI research or model development lab
- ❌ Model operator, controller, or deployment platform
- ❌ Compliance or monitoring software company
- ❌ Policy or lobbying organization
- ❌ Regulator or enforcement authority

Any technical systems exist only in service of governance and coordination.

### Core Institutional Principles

1. **Governance-first, not technology-first**
2. Clear separation between governance, oversight, and system operation
3. Independent review and auditability
4. Emergency coordination without standing control
5. Neutrality across labs, operators, and jurisdictions

**Design philosophy:** Restraint, credibility, and durability — not speed, hype, or visibility.

### Key Institutional Truths

- **Legitimacy is infrastructure**
- Governance can't be retrofitted at frontier scale
- Coordination failure is the real systemic AI risk
- Emergency response that doesn't exist before crisis rarely works during one
- Trust is harder to scale than technology
- The hardest AI risks are institutional, not technical

### Communications Guardrails

**✅ Safe to share publicly:**

- Alygn's purpose, principles, and institutional framing
- General commentary on AI governance challenges
- High-level statements about coordination, legitimacy, preparedness
- Non-specific updates ("Alygn is publicly forming")

**🚫 NOT safe to share publicly:**

- Financial details (valuation, pricing, budgets)
- Investor names or discussions
- Governance mechanics or enforcement processes
- Board structure or internal decision systems
- Timelines, commitments, or claims of authority

**Language use:**

- ✅ "Supports coordination" / "Enables accountability" / "Provides neutral governance infrastructure"
- ❌ "Ensures compliance" / "Regulates" / "Controls" / "Oversees systems directly"

**Tone:** Calm, institutional, restrained, non-promotional

### Pre-Approved Posts Strategy

**100 pre-approved posts** (one per day, sequential order)

- Tracking: `scripts/alygn/pre-approved-posts.json`
- Categories: Institutional truths, reframes, process thinking, legitimacy/neutrality, meta-presence
- All posts align with institutional tone and communications guardrails

**References:**

- `$HOME/Documents/alygn-context-update/00 Alygn - Public Institutional Overview & Communications Guardrails.pdf`
- `$HOME/Documents/alygn-context-update/01 Alygn - Boiler Plate.pdf`
- `$HOME/Documents/alygn-context-update/02 Alygn Pre Approved Posts.pdf`

---

## 🔧 Masterbots Critical Bugs Analysis (Feb 4, 2026)

### Root Causes Identified (Issue #578 - Workspace Bugs Master Plan)

**P0 CRITICAL:**

- **Bug #3 (H3+ sections breaking):** `contentEnd` boundary calculation ignores child sections
  - Fix: Use next-sibling logic to include all nested content
- **Bug #1 (new doc not updating):** Race condition in `addDocument()` navigation
  - Fix: Use `mutateAsync()` before navigation

**P1 HIGH:**

- **Bug #2 (15% mobile idle):** No SSE retry/heartbeat in `use-mb-chat.tsx`
  - Fix: Custom fetch with exponential backoff + timeout
- **Bug #4 (version list stale):** Version query cache not invalidated
  - Fix: `queryClient.invalidateQueries(['versions'])`

**Performance (Issue #555):**

- Markdown parsing called on every streaming chunk (fixes lag on 10MB+ docs)
- Base64 attachments need caching
- Document size validation missing

### Files Analyzed

- `use-workspace.tsx` (~700 lines) - state management
- `use-workspace-chat.tsx` (~1,115 lines) - streaming pipeline
- `use-mb-chat.tsx` (~1,300 lines) - SSE/chat handling
- `markdown-utils.ts` (~600 lines) - section parsing
- RAG pipeline (5 files) - retrieval + embedding

### Deliverables

- GitHub comments posted on #578, #555, #389
- Notion TODO list updated with findings + time estimates
- 3 analysis documents created (35KB total)

---

## 📧 VC Outreach Email System (ALYGN) - PRODUCTION READY ✅

### Complete 5-Phase Pipeline

**Status:** End-to-end tested (Khosla Ventures). Ready for batch scaling.

**Phases:**

1. **Discovery** ✅ - `automated-vc-discovery.js` finds new VCs via web search daily
2. **Research** ✅ - `deep-research-vcs.js` gathers emails, thesis, pain points (manual web_search/web_fetch)
3. **Drafting** ✅ - `draft-outreach-emails.js` generates 3 subject options + personalized body
4. **Approval** ⏳ - Discord #annotations review (APPROVE/EDIT/SKIP commands TODO)
5. **Sending** ✅ - `send-approved-emails.js` with SMTP (logging ready, nodemailer TODO)

### Email Template (Governance-First)

**Location:** `vc-outreach-email-template.js`

**Features:**

- MIME-embedded logo (Content-ID) - ✅ Working Chrome/Gmail/Outlook
- MSO conditional comments for Outlook
- Personalization: recipient name, pain points, investments
- AI transparency P.S.
- Tania Lea signature + Alygn footer

**Variants:**

- Governance: "Coordination Before Crisis"
- Institutional: "The Real AI Risk is Coordination Failure"

### Research Pipeline Architecture

**Key insight:** Research is manual (web_search/web_fetch) + script coordination

**Workflow:**

1. Script identifies VCs needing research
2. Wobblus executes web_search/web_fetch (in session context)
3. Saves results to `/tmp/vc-research-[name]-result.json`
4. Script reads cache, updates Notion
5. Marks as "Ready for outreach" when complete

**Why this works:**

- Tools (web_search, web_fetch) are session-level, not script-level
- Scripts coordinate, AI executes tools
- Cache-first (no re-research if file exists)
- Graceful degradation (partial data if research incomplete)

### Critical Fixes (Feb 12-13)

1. **Multi_select validation** - Replace commas with semicolons in pain points
2. **Email template** - Governance-first positioning in JavaScript
3. **Draft mapping** - Normalize field names (vc.email → recipientEmail)
4. **Notion updates** - Read existing content, preserve Conversation Logs, replace Summary

### Scaling Test (6 VCs Researched)

- Khosla Ventures ✅ (end-to-end tested)
- Radical Ventures
- Data Collective (DCVC)
- Lux Capital
- Sapphire Ventures
- AI2 Incubator

All have research cached. Ready for batching.

### Architecture Pattern

```
Discovery (Daily Cron) → Notion: "Not contacted"
         ↓
Manual Research → Notion: "Ready for outreach" + emails + pain points
         ↓
Automated Drafting → Discord #annotations: Draft + 3 subjects
         ↓
Approval → Notion: Status = "approved"
         ↓
Scheduled Send → Notion: Status = "Sent" + Date + Message ID
```

### Production Checklist

- [x] Discovery automation
- [x] Research pipeline
- [x] Email drafting (personalized)
- [x] Discord posting
- [ ] Discord approval commands (APPROVE/EDIT/SKIP)
- [x] Send script (dry-run tested)
- [ ] SMTP implementation (logging ready)
- [ ] Cron scheduling
- [ ] Batch testing (5+ VCs)

### Key Commands

```bash
# Research (manual approach for now)
web_search "Khosla Ventures partners email" → save JSON

# Draft emails
node draft-outreach-emails.js --limit=5 --dry-run

# Preview sends
node send-approved-emails.js --limit=5 --dry-run

# Actual send (when SMTP ready)
node send-approved-emails.js --limit=5
```

### Critical Issue FIXED - Sub-Agent Pattern (Feb 14, 2026)

**Problem:** Was trying to use `sessions_spawn` from a Node.js script via shell exec.

**Root Cause:**

- `sessions_spawn` is a **tool only AI agents can use**, not scripts
- Scripts don't have access to OpenClaw tools
- Shell `exec` can't trigger tool execution in Wobblus session

**Correct Pattern (from official docs):**

```
Script → Posts to Discord → Wobblus uses sessions_spawn tool
  ↓
Wobblus spawns sub-agents → Execute web_search/web_fetch → JSON
  ↓
Wobblus saves to /tmp/vc-research-[name].json
  ↓
Script reads cache → Updates Notion
```

**Key insight:** Scripts orchestrate and update external systems. AI agents execute tools and work with data. File-based coordination between them.

**Implementation:**

- New script: `deep-research-vcs-v3.js` (one-by-one processing)
- Script posts research request to Discord #annotations
- Wobblus receives request and spawns sub-agents
- Sub-agents execute web_search/web_fetch
- Results saved to `/tmp/vc-research-[name]-result.json`
- Script reads, updates Notion, continues to next VC

**Benefits:**

- ✅ Proper tool execution (native OpenClaw tools)
- ✅ Structured data (JSON from sub-agents)
- ✅ Transparent (see each request)
- ✅ One-by-one (monitor each VC)
- ✅ File coordination (simple, reliable)
- ✅ Timeout-safe (script moves on after 30s)

### Phase 2: Research (FIXED - Feb 14, 2026) ✅

**Script:** `deep-research-vcs-v3.js`

**Correct Pattern:**

1. Script loads 1 VC from Notion
2. Posts research request to Discord #annotations
3. Wobblus spawns sub-agents (sessions_spawn + web_search/web_fetch)
4. Sub-agents return structured JSON
5. Wobblus saves to `/tmp/vc-research-[name]-result.json`
6. Script reads cache, updates Notion
7. Next iteration when script runs again

**Key difference from Feb 13:**

- ❌ WRONG: Script calls `sessions_spawn` via shell exec
- ✅ RIGHT: Wobblus uses `sessions_spawn` tool + file coordination

**Testing:**

```bash
node deep-research-vcs-v3.js --limit=1
```

### Next Session

1. ✅ FIXED - Sub-agent pattern corrected
2. Test Phase 2 with 1 VC (Khosla Ventures)
3. Verify JSON structure and Notion updates
4. Scale to 5-10 VCs for batch testing
5. Phase 3: Discord approval commands (APPROVE/EDIT/SKIP)
6. Phase 5: SMTP credentials + email sending

### Phase 2: VC Discovery & Automation ✅ COMPLETE (Feb 12, 2026)

**Status:** Production-ready. Modular workflow with 5 phases.

**Architecture:**

```
1. Discovery → Basic data (automated cron)
2. Deep Research → Fill missing data (manual/cron)
3. Email Drafting → Generate personalized emails (manual)
4. Human Approval → Discord #annotations review
5. Sending → Schedule approved emails (automated)
```

**Components:**

1. **Seed VC List** (`seed-vc-list.json`)
   - 20 curated AI safety/governance VCs (targeting 100 total)
   - Relevance scoring: 4 VCs @ 9-10, 16 VCs @ 7-8
   - Top 5: AI2 Incubator (10), Khosla (9), Radical Ventures (9), DCVC (9), Lux (8)

2. **Notion Database Setup** (`setup-vc-notion-tracker.js`)
   - ✅ Creates new database under Organizations TODO Lists
   - Imports all 20 seed VCs (no contact info yet)
   - Schema: Name, Email, Status, Variant, Dates, Sentiment, Relevance, Pain Points, Notes
   - Database ID saved to `notion-config.json`

3. **Automated Discovery** (`automated-vc-discovery.js`)
   - Web search (5 configurable queries)
   - Basic research (name, website, focus areas)
   - Relevance scoring (1-10, threshold: 7)
   - Add to Notion with status "Not contacted"
   - Discord notifications with daily summary
   - Dry-run mode for testing

4. **Deep Research** (`deep-research-vcs.js`) ✅ NEW
   - Loads VCs with incomplete data from Notion
   - Finds partner emails (website, LinkedIn)
   - Extracts investment thesis, portfolio, pain points (Grok)
   - Identifies governance signals (quotes, blog posts)
   - Updates Notion with full personalization data
   - Marks "Ready for outreach" when complete

5. **Email Drafting** (`draft-outreach-emails.js`) ✅ NEW
   - Loads VCs with status "Ready for outreach"
   - Generates 3 subject line options (A/B/C testing)
   - Selects variant (Governance vs Institutional)
   - Personalizes body using pain points, portfolio insights
   - Posts drafts to Discord #annotations for approval
   - Saves drafts to `drafts/` directory

6. **Human Approval Workflow**
   - Discord channel: #annotations (`1466532145257255004`)
   - Commands: `APPROVE [VC]`, `EDIT [VC]: [changes]`, `SKIP [VC]`
   - Andler reviews drafts and approves for sending

**Files:**

```
scripts/alygn/vc-outreach/
├── setup-vc-notion-tracker.js         # Setup (one-time)
├── automated-vc-discovery.js          # Phase 1 (cron daily 10 AM)
├── deep-research-vcs.js               # ✅ NEW - Phase 2 (manual/cron)
├── draft-outreach-emails.js           # ✅ NEW - Phase 3 (manual)
├── send-approved-emails.js            # Phase 5 (cron) - TO BE CREATED
├── vc-outreach-email-template.js      # Email HTML generator
├── seed-vc-list.json                  # 20 seed VCs
├── notion-config.json                 # Database ID (generated)
├── drafts/                            # Email drafts for approval
├── MODULAR-WORKFLOW.md                # ✅ NEW - Full workflow guide
├── VC-DISCOVERY-AUTOMATION.md         # Discovery docs
└── TASK-2-COMPLETE.md                 # Setup instructions
```

**Documentation:** `MODULAR-WORKFLOW.md` (complete workflow guide)

**API Integration (Updated Feb 12, 2026 3:45 PM):**

- Perplexity API for web search (direct HTTP requests)
- Firecrawl API for web scraping (direct HTTP requests)
- API keys loaded from `openclaw.json` config
- Research now fully automated (web search + scraping + extraction)

**Next:** Phase 5 - Sending script (`send-approved-emails.js`) for automated email delivery

**Documentation:** `scripts/alygn/vc-outreach/SKILL.md` - Complete usage guide

---

## 🐦 Twitter Automation (ALYGN) - Updated 2026-02-14 ✅ PRODUCTION

### ✅ ALL PHASES MANDATORY (Updated 2026-02-18 - WORKFLOW CONNECTED!)

**IMPORTANT:** Do NOT skip any phase. All 6 phases execute EVERY run:

1. ✅ Phase 1: Pre-approved post (1/100 institutional)
2. ✅ Phase 2: Browser discovery (explore AI safety posts)
3. ✅ Phase 3: Decision engine (Grok evaluation)
4. ✅ Phase 4: X API execution (post quotes/replies)
5. ✅ Phase 5: Content generation (Grok prompts #1 + #13) - **MANDATORY - DO NOT SKIP**
6. ✅ Phase 6: Summary report (Discord thread update)

**Each phase is critical to the daily workflow.** Phase 5 generates content for next cycle.

## 🐦 Twitter Automation (ALYGN) - Details

### Twitter Discovery System (NEW) - Phase 1 Complete ✅

**Architecture:** Hybrid browser discovery + X API execution

**3-Phase Workflow:**

1. **Phase 1: Browser Discovery** ✅ COMPLETE (`browser-explore.js`)
   - Navigate /explore with alygn profile (browser relay)
   - Scroll feed, extract posts (IDs, authors, content, engagement)
   - Keyword extraction (AI safety, alignment, AGI)
   - Output: `discovery-{timestamp}.json`
2. **Phase 2: Decision Engine** ⏳ TODO (`decision-engine.js`)
   - Load discoveries → Grok evaluation ("Is this worth engaging?")
   - Web search for author credibility
   - Output: `workflow-{timestamp}.json` (replies/quotes/profiles)
3. **Phase 3: X API Execution** ⏳ TODO (`x-api-executor.js`)
   - Execute via X API: reply/quote/poll/media
   - Track results → WhatsApp notification

**Why This Approach?**

- Browser relay: Natural content discovery (algorithm feed, trending topics)
- X API: Programmable execution (faster, more reliable than browser automation)
- Decision layer: Grok + web search = intelligent engagement (not just keyword matching)

**Location:** `scripts/alygn/twitter-discovery/`  
**Status:** ✅ PRODUCTION - INTEGRATED INTO DAILY CRON  
**Test Results (Feb 11, 2026):**

- Phase 1 (Browser Discovery): 100% relevance with search "AGI alignment"
- Phase 2 (Decision Engine): 3/3 posts approved by Grok
- Phase 3 (X API Executor): 2/3 posted live ([tweet1](https://x.com/aialygn/status/2021417150179610626), [tweet2](https://x.com/aialygn/status/2021417173046981063))
  **Cron:** Daily 11 AM (combined with Content Generation)  
  **Documentation:** `docs/TWITTER-AUTOMATION.md`

### 📝 MANDATORY POSTING FORMAT (Updated 2026-02-11)

**EVERY tweet must follow this format - NO EXCEPTIONS:**

```
[Main content - institutional message, thread, or reply]

[1-3 hashtags from approved list]

more at @aialygn
```

**Approved hashtags:**

- `#AIGovernance` (primary - use most often)
- `#AIAlignment` (technical posts)
- `#AISafety` (safety-focused posts)
- `#AGI` (frontier AI discussions)
- `#AIPolicy` (policy/institutional posts)
- `#AIEthics`, `#AIRisk` (contextual)

**Signature placement:**

- Short posts: End with hashtag + signature
- Threads: Last tweet ends with hashtag + signature
- Replies: End with hashtag + signature
- Quotes: End with hashtag + signature

**Example:**

```
Legitimacy is infrastructure.

#AIGovernance

more at @aialygn
```

**Scripts with format enforcement:**

- ✅ `post-pre-approved.js` (formatTweet function)
- ✅ `x-api-executor.js` (applies formatTweet to ALL posts/replies/quotes) - Updated 2026-02-11
- ⏳ `twitter-automation.js` (Grok prompts need update for shorter content)
- ⏳ `decision-engine.js` (reply/quote generation)

**CRITICAL ARCHITECTURE (learned 2026-02-11):**

- ❌ Browser is NOT for posting - ONLY for exploring/navigating
- ✅ Browser: Navigate /explore → Extract data → workflow.json
- ✅ Scripts: Read workflow.json → Apply format → Post via X API
- ❌ Don't use browser relay for posting (twitter-browser-executor.ts obsolete)

### ✅ X API POSTING CAPABILITIES (COMPLETE - NO EXCEPTIONS)

**Workspace Skill:** `skills/x-twitter-growth/SKILL.md` ✅ (Updated 2026-02-11)  
**Script:** `scripts/shared/x-growth/x-api-executor.js`  
**Auth:** OAuth 1.0a User Context  
**Documentation:** `scripts/alygn/X-API-CAPABILITIES.md`

**ALL supported features:**

1. ✅ **Post tweets** - Regular text posts with automatic format
2. ✅ **Mention users** - @username anywhere in content (automatic)
3. ✅ **Reply to tweets** - Reply to any post by ID
4. ✅ **Quote tweets** - Quote with commentary
5. ✅ **Post with media** - Images/videos on ALL post types (posts, replies, quotes)
6. ✅ **Create polls** - 2-4 options, custom duration

**Format enforcement (MANDATORY):**

- ALL tweets get: `[content]\n\n[hashtags]\n\nmore at @aialygn`
- Applied automatically via `formatTweet()` function
- Works on: posts, replies, quotes, polls

**Media support:**

- Images: PNG, JPG, JPEG, GIF
- Videos: MP4, MOV
- Works with: posts ✅, replies ✅, quotes ✅

**Workflow JSON structure:**

```json
{
  "posts": [
    {"content": "text", "mediaPath": "/path/image.png"},
    {"content": "quote", "quoteTweetId": "123"},
    {"content": "poll", "poll": {"options": [...], "duration_minutes": 1440}}
  ],
  "replies": [
    {"content": "reply", "targetUrl": "https://x.com/user/status/123", "mediaPath": "/path/image.png"}
  ]
}
```

**100% capability coverage - NO feature gaps**

**Documentation:** `scripts/alygn/TWITTER-POSTING-FORMAT.md`

---

## 🐦 Twitter Automation (ALYGN) - Legacy System

### Architecture

**Approach:** X API v4 for content generation via `twitter-automation-v2.js` (Grok-enhanced) → Browser relay for interactive actions (replies, follows, engagement)

### Active Scripts

| Script                     | Purpose                                                      |
| -------------------------- | ------------------------------------------------------------ |
| `twitter-automation-v2.js` | Content generation via Grok prompts + workflow orchestration |

### Active Cron Jobs

| Schedule           | Job                    | Prompts  | Purpose                |
| ------------------ | ---------------------- | -------- | ---------------------- |
| Daily 11 AM        | Twitter Daily v4       | 1, 13    | Main posting + replies |
| Mon 10 AM          | Monday Niche + Regular | 1, 3, 13 | Mixed content variety  |
| Sun 5 PM           | Weekly Review          | 18       | Performance analytics  |
| 1st of month 10 AM | Monthly Review         | 19       | Strategy adjustment    |

### Workflow (v4) - Now with Browser Relay

1. Generate content via `twitter-automation-v2.js` (Grok-enhanced)
2. Create `workflow-{timestamp}.json` with posts, replies, profiles
3. **Browser relay execution (ALYGN PROFILE):**
   - Use `browser` tool with `profile="alygn"` for X.com automation
   - Post threads via compose dialog (working 100%)
   - Reply to users (next: implement via browser snapshots)
   - Follow profiles (next: implement via browser snapshots)
4. Report summary to WhatsApp

### Browser Relay Setup (Critical!)

**✅ WORKING:** `--browser-profiles alygn` (separate Chrome instance authenticated to X.com)

- **Command:** Use `profile="alygn"` in all browser tool calls
- **Status:** X.com fully authenticated, compose & posting verified
- **Limitation:** Cookies not directly accessible via browser tool (workaround below)

### Cookie Extraction for Bird CLI (Future)

- **Plan:** Create script to extract X.com cookies from Chrome Alygn profile
- **Location:** `$HOME/.config/google-chrome/Profile*/Cookies` (SQLite)
- **Usage:** Pass to Bird CLI for faster replies/follows when browser relay slows down
- **Status:** Pending implementation

### Key Details

- **Handle:** @aialygn
- **Output Dir:** `$HOME/.openclaw/workspace/twitter-outputs/`
- **Browser profile:** `alygn` (must use `profile="alygn"` in browser tool)
- **Typo auto-fix:** @aialyygn → @aialygn
- **Workflow file:** `workflow-{timestamp}.json` (posts, replies, profiles)

### Removed (Obsolete)

- `twitter-automation.js` (v1)
- `twitter-browser-automation.js` (v1)
- `twitter-browser-automation-v3.js`
- `twitter-browser-post.js`
- `twitter-poster.js` (API-based, permissions blocked)
- Daily Analytics cron (redundant - covered by weekly/monthly)

---

## 💼 VC Outreach System (ALYGN)

### Active Cron Jobs

| Schedule     | Job                  | Purpose                                |
| ------------ | -------------------- | -------------------------------------- |
| Mon 10:30 AM | VC Contact Discovery | Find new VC contacts                   |
| Mon 11 AM    | VC Outreach Weekly   | Execute outreach with Grok enhancement |

### Scripts

- `vc-contact-discovery.js` - Search and database update
- `vc-outreach.js` - Outreach execution with Notion tracking
- `vc-contact-finder.js` - Contact search utilities
- `setup-vc-tracker.js` - Tracker setup

---

## 📊 Multi-Org Automation System

### Daily Trackers (All 3-4 AM)

| Org        | Script                              | Schedule |
| ---------- | ----------------------------------- | -------- |
| ALYGN      | `scripts/alygn/daily-tracker.js`    | 3:30 AM  |
| BitcashOrg | `scripts/bitcash/daily-tracker.js`  | 3:45 AM  |
| AndlerRL   | `scripts/personal/daily-tracker.js` | 4:00 AM  |

### Daily Operations

| Time          | Job                                   |
| ------------- | ------------------------------------- |
| 2 AM          | Backup & Archive                      |
| 8 AM          | Multi-Org Morning Briefing (WhatsApp) |
| 8-20 every 3h | Notion Sync Check                     |
| 6h intervals  | Project Health Monitor                |
| 6 PM          | Jacobo Daily Summary                  |
| 9 PM          | End-of-Day Summary                    |
| 9:30 PM       | GitHub Activity Digest                |

### Weekly Operations

| Day/Time | Job                      |
| -------- | ------------------------ |
| Sun 5 PM | Multi-Org Weekly Summary |
| Sun 5 PM | Twitter Weekly Review    |
| Sun 6 PM | ALYGN Weekly Reflection  |

### Monthly

- 1st of month 10 AM: Monthly Project Review + Twitter Strategy

---

## 🛠 Technical Experience

- **RAG Systems:** Analyzed double token budget bug in masterbots' embedding retrieval pipeline (Feb 2026)
- **Vector Search:** PostgreSQL + pgvector, OpenAI embeddings (1536 dimensions)
- **Code Review:** Drizzle ORM, Next.js 15, Vercel AI SDK patterns
- **Browser Automation:** Playwright-based X.com posting workflow

---

## 📝 Personal Projects (andler.dev)

### Active: `andler-blog-feed-content` Skill — APPROVED v1.1 (2026-06-09)

**Status:** ✅ Approved and implemented. The skill is the durable intake procedure for LinkedIn and TikTok post URLs into the **andler.dev** Social Presence registries and their bilingual i18n mirror. Future sessions touching andler.dev content, branding, or the `andler-landing` social surface must respect this contract.

**Path:** `~/.openclaw/workspace/skills/andler-blog-feed-content/SKILL.md` (and the skill lives in the `andler-landing` repo's social pipeline too).

**Six validation gates (skill is the orchestrator + contract; Zod/i18n live in `andler-landing`):**
1. **Gate 1 — URL resolve & platform match (blocking)**
2. **Gate 2 — oEmbed fetch (blocking per post, run continues)**
3. **Gate 3 — Zod schema validation (blocking)** — `socialPostSchema` v1.1 with `titleEn` / `titleEs` / `summaryEn` / `summaryEs` (all optional at schema level, enforced "both, always" at the orchestrator)
4. **Gate 4 — Brand voice EN (advisory)** — Beautiful Prose + style guide
5. **Gate 5 — Bilingual translation (advisory)** — auto-translate EN→ES, never empty, ASCII-only WARN, ES length cap 90 chars, opt-in re-translation via `# retranslate:yes|no` (default `no`)
6. **Gate 6 — Slot reuse URL match (advisory)** — match by normalized URL, replace in place, layout doesn't shift, idempotent
7. **Gate 7 — Diff preview (advisory)** — staged to `.staging/social/`, never live until explicit `apply-staging.mjs --intake <id>`

**Bilingual persistence contract (CRITICAL for branding work):**
- Every staged post carries `titleEn` / `titleEs` and (LinkedIn only) `summaryEn` / `summaryEs`.
- Same content mirrors into `src/i18n/dictionaries/en.json` and `es.json` under `social.posts.<platform>.<id>.{titleEn|titleEs,summaryEn|summaryEs}`.
- `Dictionary` type in `src/types/i18n.ts` extended to type-check the new `social.posts.*` sub-namespace.
- Translator provider is whatever `src/i18n/get-dictionary.ts` is already configured with — the skill does not own the translator.

**Slot reuse contract (CRITICAL for layout work):**
- Re-pasting the same URL updates the matched entry in place. Layout never shifts from URL match.
- The slot number in the input is the new visual order; data goes into the matched id. WARN (not block) if the declared slot differs from the existing entry's position.
- Two identical intakes in a row produce a zero-diff (idempotent).
- URL-matched replaces do not free a `platformMaxPosts` slot.

**Hard rules for any future andler.dev content session:**
- The skill is **staged, not live**. Never write directly to `src/content/social/<platform>.json` or `src/i18n/dictionaries/{en,es}.json` — always stage to `.staging/social/` and run `apply-staging.mjs` explicitly.
- Brand voice (Gates 4 + 5) is Andler's call. The skill reports issues with suggested rewrites but never edits copy.
- A `[Placeholder]` string in `title_intent` / `titleEs` / `summaryEn` / `summaryEs` is a **BLOCK** in both languages — it's a dev artifact, not a brand-voice call.
- Cap is per-platform per-intake, not per-intake. URL-matched replaces do not free a slot.
- Re-translation defaults to off. Use `# retranslate:yes` only when the brand voice or product naming actually changed.
- **Multimedia in blog posts is a soft guideline, not a hard quota** (learned 2026-06-18). Prefer ≥1 piece of supplementary content (gif/meme, mermaid diagram, infographic, sequence) per article **when it adds value**. Same principle as the existing `CONTENT-STYLE-GUIDE.md` rule "max 3 callouts per article" — over-quota dilutes impact. Never force a gif or diagram just to hit a count.

**References in the skill:**
- `references/input-output.md` — full intake block, run report, re-paste example
- `references/i18n-shape.md` — Zod additions, `Dictionary` extension, migration path from v1.0 English-only

**Origin:** Drafted v0.1 (5 gates, open questions) → revised to v1.1 (6 gates, model-agnostic template + bilingual B+C + slot reuse A resolved 2026-06-09) → approved by Andler same day.

---

### Planned: Automated Blog Publishing

- **Status:** Idea captured in Notion (Feb 4, 2026)
- **Concept:** Bot prepares markdown + media → cronjob pushes to andler.dev → server auto-creates blog entries
- **Location:** Notion "Projects (Wobblus)" database
- **Next:** Implement server endpoint, cron integration

---

## 📋 VC Outreach Phase 2 (Pending - Tomorrow 2026-02-06)

**Overview:** Browser automation + web research integration for intelligent VC discovery & personalization

**Workflow:**

1. **VC Research** → web_search (find firms) + web_fetch (scrape websites) + browser (LinkedIn)
2. **Intelligence Extraction** → pain points, investment thesis alignment, portfolio analysis
3. **Personalization** → merge research into email template (recipient, company, context)
4. **Email Delivery** → secure SMTP + personalized HTML
5. **Tracking** → Notion database logging (audit trail)

**Tools for Phase 2:**

- `web_search()` → Brave API for VC discovery by vertical/stage/geo
- `web_fetch()` → HTML scraping for firm websites, portfolios, blogs
- `browser` tool (Playwright) → LinkedIn partner scraping, contact extraction
- Python orchestration → master coordination script
- Notion API → log all outreach attempts

**Scripts to Build:**

- `vc-research.py` → web search + scraping
- `vc-intelligence.py` → pain point extraction, relevance scoring
- `vc-browser-automation.js` → LinkedIn scraping, contact forms
- `vc-outreach-orchestrator.py` → master coordination
- `vc-notion-logger.py` → Notion API integration

**Success Metrics:**

- 50+ qualified VC contacts/week discovered
- 100% personalization (no generic emails)
- Complete audit trail in Notion
- Target response rate: 10-15%

**Reference:** Full Phase 2 roadmap in `scripts/alygn/VC-OUTREACH-ROADMAP.md`

---

_Updated: 2026-02-05 23:38_

---

## 📋 Weekly Summary - Week of Feb 2-8, 2026

### ALYGN (Alygn)

**Shipped This Week:**

- ✅ VC Outreach Email System Phase 1 (production-ready)
  - 2 professional templates: Governance + Technical
  - MIME-embedded logo, secure credential loading
  - Personalization framework + AI transparency messaging
  - Tested: Both variants sent successfully
- ✅ Twitter Automation Phase 1 Working
  - 1 thread live: "Reward Hacking" (4 posts, Feb 8 on @aialygn)
  - Browser relay + alygn profile: 100% posting success
  - Grok-enhanced content generation: high-quality output
  - Workflow JSON orchestration: ready for tracking

**Current Challenges:**

- ⚠️ Twitter Phase 2 infrastructure limit: Browser sequential actions timeout
  - 5 replies drafted, 5 profiles identified
  - Solution: Manual execution (5 min) OR Bird CLI OR future X API write access
  - All data staged: `workflow-1770484855297.json`

**GitHub Status:**

- align-core-infra: Last updated Jan 30
- No new commits this week (focus on outreach systems)

**Next Week Priorities:**
→ Execute Twitter Phase 2 (manually or via Bird CLI)
→ Launch VC Outreach Phase 2 (research + personalization)
→ Monitor 11 AM Twitter cron execution
→ Begin VC contact discovery automation

---

### BitcashOrg

**Analysis Completed:**

- ✅ Masterbots RAG Pipeline Analysis (Issue #604)
  - Root cause: Double token budget enforcement in embedding retrieval
  - Secondary issue: Aggressive cosine similarity threshold
  - Tertiary issue: Silent failure modes in vector search
  - Full technical analysis documented + clear fix path

**GitHub Activity:**

- Feb 7: 1 commit, 2 PRs, 2 issues (masterbots)
- Feb 6: 1 commit, 3 PRs, 4 issues (masterbots)
- Focus: Embedding retrieval + RAG optimization

**Active Repos:**

- masterbots: Updated Feb 6 (primary focus)
- bitcash, smartsale, bitcash-app: Last updated Dec 10
- Infrastructure repos: Earlier updates

**Next Week Priorities:**
→ Implement RAG pipeline fixes
→ Reduce token budget overhead
→ Test improved cosine threshold sensitivity
→ Code review: Drizzle ORM patterns

---

### AndlerRL (Personal)

**Design Complete:**

- ✅ Automated Blog Publishing System Architecture
  - Concept: Bot prepares markdown + media → cron push → auto-create blog entries on andler.dev
  - Notion database: "Projects (Wobblus)"
  - Ready for implementation

**Status:** ⏳ Awaiting development (server endpoint + cron integration)

---

### Cross-Week Metrics

- GitHub commits: ~3 (BitcashOrg focused on RAG)
- Cron jobs: 7 active (daily trackers, Twitter, summaries)
- Browser relay success: 100% single-action workflows
- Infrastructure limitation identified: Sequential browser timeouts

## 🐦 X API Threading & Image Support - FINAL PHASE (2026-02-09 14:00 CST)

**Current Status:** ✅ X API working! 2/5 posts live (single tweets successful)

**What's Working:**

- ✅ X API with XDK (@xdevplatform/xdk) - OAuth1 working
- ✅ Single tweet posting (niche posts) - 100% success
- ✅ Credentials in `/config/credentials.json` valid
- ❌ Thread posts (regular) - 403 Forbidden (needs reply structure)

**The Fix:** Thread structure using `in_reply_to_tweet_id`:

```javascript
const first = await client.posts.create({ text: "Hook" });
const threadId = first.data.id;
await client.posts.create({
  text: "Point 1",
  reply: { in_reply_to_tweet_id: threadId },
});
```

**Final Automation Plan:**

1. **Update workflow JSON**: Add `imagePath` field for each post
2. **Generate images via Gemini API** (already have credentials)
3. **Upload media to X** (file attachment support in XDK)
4. **Post threads with media**: First tweet + replies with images
5. **Full loop**: Iterate posts → generate images → post with threading

**Files to Update:**

- `scripts/alygn/twitter-automation-v2.js` - Add image generation
- `scripts/alygn/post-via-x-api.js` - Add threading + media upload
- Workflow JSON - Include image paths

**2 Posts Already Live on @aialyygn:**

- Tay bot (ID: 2020941290305687871)
- COMPAS bias (ID: 2020941334492688501)

**Implementation Complete!**

✅ **Script Updates:**

- `post-via-x-api.js` - Threading support with `in_reply_to_tweet_id` + media upload
- `generate-post-images.js` - Workflow image path generation
- Workflow JSON - `imagePath`, `isThread`, `threadPoints` fields added

**Ready for Final Execution:**

1. Generate images via Gemini (optional - can post without images first)
2. Run: `node scripts/alygn/post-via-x-api.js`
3. All 5 posts will post (3 threads + 2 singles) with media support

**Architecture:**

- Post 1 (hook) → Get thread ID
- Posts 2-4 reply to hook with `in_reply_to_tweet_id`
- Media uploads via client.media.upload()
- Rate limiting: 15s between posts, 2s between thread points

## 🎯 ALYGN Automation Phase 1 - COMPLETE (2026-02-09 15:05 CST)

**Deliverables:**

1. ✅ Threading System - Post first tweet, reply with in_reply_to_tweet_id
2. ✅ Image Generation - 3 Gemini-generated visuals (1.6M, 1.4M, 1.7M PNG)
3. ✅ Image Conversion - PNG→JPEG (60% size reduction, API optimization)
4. ✅ Engagement System - Framework for mentions, replies, follows, tracking

**Live Results:**

- 5/5 ALYGN posts published to @aialygn
- 3 threads (Superintelligence, Interpretability, Agentic AI) - 12 total threaded posts
- 2 single posts (Tay bot, COMPAS bias)
- Proper threading with conversation_id maintained

**Technical Architecture:**

```javascript
// Threading pattern proven working:
const hook = await client.posts.create({ text: "Hook" });
const threadId = hook.data.id;
await client.posts.create({
  text: "Point 1/4",
  reply: { in_reply_to_tweet_id: threadId },
});
```

**Known Issues & Next Steps:**

1. Media upload: HTTP 400 (format issue) - PNG/JPEG both failing
   - Workaround: Posts work great without media
   - Next: Test direct buffer approach or different SDK method
2. API Rate limiting: 403 on rapid retries (expected)
3. Mentions endpoint: Requires elevated API tier

**Phase 2 Ready:**

- Engagement system structure complete
- Mention keywords + reply templates ready
- Profile targeting list created
- Logging framework in place

---

_Wobblus ALYGN Automation v1: SHIPPING QUALITY ✅_

---

## 🐦 Browser Relay Twitter Success - 2026-02-08 00:26 CST

**✅ BREAKTHROUGH:** Reward Hacking thread posted successfully via browser relay!

**What worked:**

- Alygn Chrome profile authenticated to X.com
- Browser tool with `profile="alygn"` connected cleanly
- Full 4-post thread composed in compose dialog (4 posts live on timeline)
- Proper threading maintained

**Phase 2 Status: Replies & Follows - READY FOR EXECUTION**

- ✅ All 5 reply targets identified with tweet URLs
- ✅ All reply texts drafted and optimized
- ✅ All 5 profiles identified for following
- ✅ Workflow data in `$HOME/.openclaw/workspace/twitter-outputs/workflow-1770484855297.json`

**Discovered limitations:**

- Chrome cookies are encrypted (DPAPI) - Bird CLI cannot extract
- Browser relay timeouts when executing multiple sequential snapshots
- Most practical: Direct manual posting via browser OR use X API (when write access available)

**Immediate action items:**

1. Navigate to each target tweet (use URLs from workflow)
2. Click reply → compose → submit
3. Follow target profiles
4. Estimated time: 5 min manual execution

**Reference data:**

- Target URLs: Available via `jq '.replies[].targetUrl' workflow-1770484855297.json`
- Reply texts: Optimized and ready in workflow file
- Follower list: `.profiles[]` in workflow

---

## 🐦 Twitter Phase 2 Execution - Updated 2026-02-07

### What Happened

**Date:** February 7, 2026, 11:34 AM-12:05 PM CST  
**Task:** Post 5 AI alignment threads with media + replies + follows  
**Outcome:** 50% automated, 50% ready-to-post (1 live, 4 staged)

### Results Achieved ✅

**Content Generation:** 100% complete

- 5 threads written with hooks & points
- 5 strategic replies drafted
- 5 profiles identified

**Media Generation:** 100% complete

- 5 visual assets generated via Gemini 3 Pro Image
- All 1.7M PNG files ready in `/openclaw/skills/nano-banana-pro/`
- Professional quality (AI oversight, reward hacking, misalignment, AGI timelines, takeover paths)

**Browser Automation:** 20% successful

- ✅ Post 1 ("Scalable Oversight Crisis") **LIVE on @aialygn** with media
- ⚠️ Posts 2-5: Puppeteer hit session management issues
  - Root cause: Twitter's compose page heavy JavaScript
  - Session becomes unstable after first browser action
  - Multiple script iterations tested (v1, v2, single-session)

### Files Created

**Executable Scripts:**

- `twitter-phase2-poster.js` (v1) - Initial Puppeteer approach
- `twitter-phase2-poster-v2.js` (v2) - Fresh browser per post
- `twitter-phase2-single-session.js` (v3) - Optimized single session
- `twitter-phase2-executor.js` - Planning/coordination script

**Reference Guides:**

- `PHASE2-READY-TO-POST.md` - Copy/paste guide for remaining posts
- `memory/2026-02-07-twitter-phase2.md` - Technical breakdown

**Assets:**

- All 5 media files: `ai-oversight-crisis.png`, `reward-hacking.png`, `inner-misalignment.png`, `agi-timelines.png`, `ai-takeover.png`
- Workflow backup: `twitter-outputs/workflow-1770484855297.json`

### What Learned

**What Works:**
✅ Grok content generation (excellent quality prompts)  
✅ Gemini image generation (fast, high-quality visuals)  
✅ Puppeteer for single action (media upload works)  
✅ Twitter authentication (verified in user data dir)

**What's Hard:**
❌ Puppeteer on Twitter (session stale, heavy JS)  
❌ Browser restart per post (login overhead)  
❌ Timing/delays (Twitter rate-limits aggressively)  
❌ Follow button detection (dynamic classes)

**Better Approaches for Next Time:**

1. **Bird CLI** - Simpler, auth tokens pre-configured (fastest)
2. **Keep browser open** - Don't restart Chrome between posts
3. **X API** - When write access available (most reliable)
4. **Manual helper** - Script generates text/media, human clicks

### Recommendation

**Current Status:** 1/5 posts live (Scalable Oversight Crisis)  
**Effort to complete:** 10-15 min manual posting  
**Quality:** All content ready, media attached, profiles identified

**For immediate completion:** Use `PHASE2-READY-TO-POST.md` to manually post remaining 4 threads + follow profiles  
**For next batch:** Use Bird CLI instead of Puppeteer (simpler, more reliable)

### Time Investment

- Content generation: ~30 min (Grok + workflow)
- Media generation: ~15 min (Gemini, 5 images)
- Browser automation attempts: ~45 min (3 script versions)
- Total: ~90 min for 50% automation + 100% ready-to-post

**Lesson:** Sometimes manual is faster than fighting browser automation edge cases.

---

_Updated: 2026-02-07 12:10 PM CST_

---

## 🔧 Browser Automation Lessons (Feb 7, 2026)

### What Learned

**When automating browser-heavy sites (like Twitter):**

- ❌ Don't restart browser for each action (login context lost)
- ✅ Reuse single session throughout
- ❌ Don't fight JavaScript-heavy pages (compose breaks easily)
- ✅ Use CLI tools when available (Bird CLI better than Puppeteer for Twitter)

### Three Paths Forward

1. **Bird CLI** - Simplest, fastest (use next time)
2. **Keep browser open** - Reuse existing session (works but slower)
3. **X API** - Most reliable (when write access available)

### Key Insight from Andler

"Check for existing logged-in sessions before launching new ones."  
→ Was creating fresh Chromium instances instead of reusing the open "Work" profile  
→ Existing session already authenticated, just needed to connect properly

### Outcome

- 1/5 posts automated successfully ✅
- 4/5 posts ready for manual (10 min)
- Full automation learning captured for next iteration
- Bird CLI will be primary tool next time

---

## 📋 Lessons Learned - April 14, 2026 (Phase 0 Deployment)

### Docker Import Structure Debugging

**Problem:** Container crashes with "Cannot find module '../redis/redis-pool.mjs'"

**Root Cause:** Dockerfile copied service file to wrong location:

```dockerfile
# WRONG - puts file at /app/kill-switch-service.mjs
COPY kill-switch/kill-switch-service.mjs ./kill-switch-service.mjs

# CORRECT - preserves directory structure
COPY kill-switch/kill-switch-service.mjs ./kill-switch/kill-switch-service.mjs
CMD ["bun", "run", "kill-switch/kill-switch-service.mjs"]
```

**Team Debugging Process:**

1. **Hugrukal (Architect)** - Analyzed import structure
2. **Keridz (BE Coder)** - Forensic path tracing
3. **Nikaya (Reviewer)** - Built test container, reproduced crash

**Lesson:** Always read actual import statements and trace path resolution.

### Redis Cluster Initialization

**Problem:** "CLUSTER DOWN Hash slot not served"

**Root Cause:** `redis-cluster-init` container command was malformed (shell escaping issues)

**Fix:** Manual initialization:

```bash
docker exec redis-node-1 redis-cli --cluster create \
  redis-node-1:6379 redis-node-2:6379 redis-node-3:6379 \
  --cluster-replicas 0 --cluster-yes
```

**Lesson:** Redis cluster nodes don't auto-join. Use array syntax in docker-compose for complex commands.

### IP Allowlist for Docker Networks

**Problem:** API returns 403 "IP not allowed" for Docker network requests

**Root Cause:** IP allowlist only had specific IPs, not Docker network ranges

**Fix:** Added CIDR matching:

```javascript
const IP_ALLOWLIST = new Set([
  "172.16.0.0/12", // All Docker networks
  "172.28.0.0/16", // Our network
  // ... other IPs
]);
```

**Lesson:** Docker uses internal network IPs - allowlist must include CIDR ranges.

---

### ACP for Communication, Not Work

**Clarification:** 2026-04-14 13:50 CST

**Correct Usage:**

- ✅ **Subagents** → Actual development work
- ✅ **ACP** → Communication orchestration (status checks, plan verification)
- ✅ **`sessions_send`** → Direct agent messaging

**Incorrect Usage:**

- ❌ Using ACP for coding tasks (use subagents)
- ❌ Using `ollama launch claude` without bidirectional comms plan
- ❌ Accumulating all context in main session

**Lesson:** Keep context lean. Use ACP selectively for coordination, subagents for work, main session for user-facing updates.

---

## 🏢 ANDLER DEVS S.A. / CORP. — STUDIO ENTITY (locked 2026-06-23 15:38 CST, by Andler)

**The studio surface.** "Andler Devs" is the operational name of Andler's Costa Rica corporation, used as the B2B Independent Contractor / S.A. brand surface for the job pipeline. Distinct from the personal surface (the founder's own portfolio) and the developer-experience brand (Andler Develops).

### Legal & branding

- **Legal name (Spanish contexts):** Andler Devs S.A. (Sociedad Anónima = Corporation in Costa Rica)
- **Legal name (English contexts):** Andler Devs Corp.
- **Jurisdiction:** San José, Costa Rica
- **Entity type:** S.A. (Sociedad Anónima) — a Costa Rica corporation
- **Hiring model:** B2B Independent Contractor (W-8BEN-E invoicing) — no visa sponsorship required on the client side
- **EOR-compatible:** Yes — works through Deel, Remote.com, Oyster when the client prefers payroll over invoicing
- **Founder:** Andler (sole employee, in-house agent team for delivery augmentation)

### Contact aliases (locked 2026-06-23)

- **<hello@andler.dev>** — STUDIO contact. Use on the site (footer, contact forms, email signatures, FAQ). Created by Andler 2026-06-23; routes to the personal inbox.
- **<contact@andler.dev>** — PERSONAL/founder contact. Stays as the personal/founder alias. Do NOT use this for the studio surface.
- **+50662163355** — Personal/founder phone. Studio phone = same number for now; if the studio ever gets a separate CR business line, document the change.

### Services (locked 2026-06-23, 7 official offerings)

1. **Full-stack TypeScript / React / Next.js development** — primary offering. Includes React Native for mobile, Three.js for 3D, Vite/Tailwind for build/CSS.
2. **Smart contracts** — Solidity, Rust, C#, C++. Multi-language smart contract dev (the EVM + Solana + non-EVM chain coverage is the differentiator).
3. **Web3 indexer development** (JS/TS) — custom indexers for on-chain data, real-time event ingestion, GraphQL/REST APIs on top.
4. **DevOps & infrastructure** — Docker, Kubernetes, nginx, Redis, CI/CD (GitHub Actions), GCP/AWS.
5. **Consulting / Advisory** — architecture, strategy, planning. This is the senior-eng "I help you think" offering, separate from the hands-on dev work.
6. **Web Design** — full design work, not just implementation. Frontend systems, design tokens, component libraries.
7. **Maintenance & ongoing support** — long-term retainers, not just project work.

### Team composition (the differentiator)

- **Andler** — founder, sole human employee, hands-on engineering + architecture
- **Wobblus** (the agent orchestrator) — in-house AI agent lead, 6 specialists (architect Hugrukal, dev-lead Chanshuk, FE coder Gimglich, BE coder Keridz, docs Talanara, reviewer Nikaya)
- The studio's delivery is **AI-augmented from day 1**. This is a real differentiator vs other one-person CR shops — the studio ships at the velocity of a small team while staying lean on the cost side. Surface this in the About copy, the FAQ, and any pitch.

### Site surface rules (andler-landing)

- **Studio is the primary surface.** The personal portfolio is a sub-section titled "About the founder" (Person schema inside the Organization schema).
- **Brand name is locale-aware:** EN = "Andler Devs Corp.", ES = "Andler Devs S.A." The i18n dictionary should switch the legal name string per locale.
- **First 3 lines of any page's plaintext body must contain "Andler Devs Corp."** (or "Andler Devs S.A." in ES) — this is the LLM-researchable identity signal. Recruiters who ask an AI "who is Andler Devs?" get the answer from this text.
- **Footer:** `mailto:hello@andler.dev` + the localized legal name. Both are non-negotiable.

### B2B positioning (tied to the job pipeline)

- The B2B-aware job filter (`--b2b` flag, lesson 36 in this file's spirit) is the B2B leads pipeline into the studio.
- Cover letters from the studio use the W-8BEN-E framing pre-emptive at the top (lesson 37 in the daily file 2026-06-23).
- The Claude Session Export pattern (lesson 38 in the daily file) is the proof-of-work for AI-native roles.

### Brand surface taxonomy (extends lessons 29, 30, 30b)

| Surface | Identity | Locale | Use case |
|---|---|---|---|
| **Andler** | The human | Any | Founder name, bio, "about" |
| **Andler Devs S.A.** | Legal entity, ES contexts | ES | Footer, legal copy, ES FAQ |
| **Andler Devs Corp.** | Legal entity, EN contexts | EN | Footer, legal copy, EN FAQ |
| **Andler Devs** | Marketing-facing name (no suffix) | Both | Site title, og:site_name, headers, FAQ intro |
| Andler Develops | Developer-experience brand (separate) | Both | The andler-develops content/blog surface — NOT the studio |
| andler-landing | Workboard board (andler-landing) | n/a | Site implementation tasks |
| andler-develops | Workboard board (andler-develops) | n/a | Brand/relationships work |

### Anti-patterns to avoid

- ❌ Using "Andler Develops" on the studio surface (that's the dev-experience brand, distinct from the studio)
- ❌ Using "contact@andler.dev" for studio contact (use <hello@andler.dev>)
- ❌ Treating "S.A." and "Corp." as interchangeable in copy — they're the SAME legal entity, but the locale context determines which form to use
- ❌ Hiding the agent team differentiator in a footer or "About" sub-page — it should surface in the studio's primary pitch
- ❌ Claiming the studio is "a team of N engineers" or similar — it's a one-founder studio with an in-house agent team. Be honest about the structure.
- ❌ Adding a Go claim anywhere in the studio's stack or services list (lesson 29c, locked 2026-06-23 02:41 CST)

### Workboard card driving this surface

- **Card `bd9db659-09ef-4771-bfc7-4261663e1eec`** on `andler-landing` board: "AI-friendly metadata: structured data + AI-readable brand identity for andler-landing". Status: `todo`, agent: `fe-coder`, labels: `ready-to-claim`, `ai-metadata`, `brand-andler-devs`, `seo`, `i18n-en-es`. Full spec in card comments 1-4. 5 JSON-LD blocks + AI-readable content blocks + robots.txt + OG/Twitter + llms.txt/ai.txt.

### Source of truth

- Daily file: `memory/2026-06-23.md` (the session that locked this)
- Workboard card: `bd9db659-…` (the implementation spec)
- Existing i18n pattern: lesson 18 (staged, never live — the FAQ + About content must go through `.staging/seo/` then the apply-staging pipeline)
- Existing social schema: `src/lib/social-schema.ts` v1.1 (extend, don't fork)

---

## 🔧 REPO BOUNDARY & CROSS-DEPLOYMENT-TARGET CALLS (learned 2026-06-29)

Context: `andler-landing` repo's `scripts/blog-pipeline/` contained 3 server-only files (incl. 241-line `openclaw-webhook-setup.md` with systemd/nginx/cron config) because Vercel→andlersrv was built as push-webhook with shared HMAC. Post-mortem: `~/.openclaw/workspace/docs/reports/blog-pipeline-post-mortem-2026-06-29.md`. ADR-012 supersedes ADR-001 §5 Option 3.

### 39. 🏗️ REPO BOUNDARY RULE — server-side ≠ app-side

- **Rule:** Vercel-side code lives in the app repo. andlersrv-side code lives in `~/.openclaw/workspace/skills/<name>/` (as a skill) or `~/.openclaw/workspace/scripts/<name>/` (as standalone). Never mix.
- **Test:** "Does this file only run on andlersrv?" If yes → it doesn't belong in the app repo. Hardcoded `/home/andlersrv/...` paths = automatic leak.
- **Anti-patterns:** ❌ Ops docs (systemd units, nginx configs, cron syntax) in `app-repo/scripts/`. ❌ HTTP listeners / cron loops that only run on andlersrv in app repo. ❌ Hardcoded machine paths in shared scripts.
- **Source:** Post-mortem RC-1 + RC-4.

### 39a. 🔀 SINGLE-COMMIT BUNDLING OBSCURES REVIEW

- **Rule:** Split commits by execution target AND concern. App code / server code / security fixes / unrelated refactors → separate commits.
- **Why:** A 46-line commit message spanning 4 workstreams splits reviewer attention. Server-side files slip through as "part of the pipeline" instead of being evaluated as "do these belong here?"
- **Anti-patterns:** ❌ "Stream A+B+C+D" bundled commits. ❌ "Fix+refactor+feature" commits. ❌ Bundling app code + server code + security fixes in one commit.
- **Source:** Post-mortem RC-2.

### 39b. 🔐 PULL-BASED + JWT-ASYMMETRIC FOR CROSS-DEPLOYMENT-TARGET CALLS (locked 2026-06-29 18:03 CST by Andler)

- **Rule:** When Vercel (ephemeral/serverless) needs to trigger work on andlersrv (persistent), use pull-based: server exposes status endpoint, client polls. Never push-webhook with shared HMAC.
- **Auth flow:** Tailscale transport + JWT-asymmetric (RS256/EdDSA). Sender signs with private key, receiver verifies with public key. **No shared secret between deployment targets.**
- **Asset delivery:** base64 in JSON response + SHA-256 hash for idempotency. Both sides cache (Vercel: last-known-good per slug, OpenClaw: last-generated manifest). Fallbacks prevent cascade failure. WebP encoding preserves quality (`effort: 6` + `preset: 'photo'`); GIFs are served as URL references, not base64-embedded.
- **Code conventions:** All Bun + TypeScript code in `openclaw-webhook`, `andler-blog-pipeline`, and the app-side poll consumer (`src/app/api/cron/blog-poll-status/route.ts`) MUST follow `andler-devs-code-style` v1.0 conventions. Auto-triggers on .ts/.tsx/.js/.jsx file edits. No agent writes the new code without that skill's rules in scope.
- **Webhook is reusable event-routing infra, not single-purpose.** First event type: `blog-pipeline.*` (image gen). Future event types include live-chat for prospects. The skill is `openclaw-webhook` (event fabric), with `andler-blog-pipeline` as the first consumer.
- **Why:** Push-webhook with shared HMAC forces coordinated secret rotation across deployment targets, embeds server-only files in app repos (RC-1), creates review blindspots (RC-2). Pull-based + asymmetric JWT eliminates all three.
- **Anti-patterns:** ❌ Shared HMAC across deployment targets. ❌ trustedOrigins alone (Better-Auth lesson 26 is for same-deployment). ❌ Push-webhook when polling cadence suffices.
- **Reference:** `~/.openclaw/workspace/repos/local/andler-landing/docs/architecture/ADRs/ADR-012-pull-based-webhook-architecture.md` (post-ADR-012 renumbering, applied 2026-06-29 18:08 CST).
- **Source:** Post-mortem 2026-06-29, andler direction 2026-06-29 18:03 CST.

### 40. 🏗️ SCALABLE-BY-DESIGN PRINCIPLE — build for the future, not the demo (locked 2026-06-29 18:07 CST by Andler)

**Rule:** When Andler asks to build a system (architecture, pipeline, schema, agent flow, content workflow), design for **all three axes** from the start — not as an afterthought:

1. **Scalability for later** — not just "can it work once." Anticipate future consumers, future load, future event types, future maintenance. The webhook ADR became `openclaw-webhook` (event fabric) instead of `blog-webhook` (point solution) *because* future event types like `live-chat.message` for prospects were visible from day one.
2. **Edge cases from multiple perspectives** — not just the happy path. Engineer, security, ops, and end-user perspectives all matter. A feature that "works" in a single demo can hide a cascade-failure risk, an auth bypass, or a deploy cliff.
3. **Team expertise + active feedback** — consult the specialists by role (Gimglich FE, Keridz BE, Hugrukal architecture, Talanara docs, Nikaya review, Chanshuk dev-lead). One decision-maker's view is never enough for non-trivial design. Andler's word: "considering edge cases using different perspectives (the team expertises and feedback)."

**When this applies:**
- ✅ Designing new systems (architecture, pipelines, schemas, workflows)
- ✅ Reviewing scope of any non-trivial task — ask "does this just work, or does it scale?"
- ✅ Spawning agents for design work — explicitly name which perspectives you're consulting
- ✅ Writing ADRs — document edge cases + future consumers considered, not just the chosen path
- ❌ Trivial bug fixes (don't over-engineer a typo fix)
- ❌ Time-critical hotfixes (scope-down explicitly, then revisit with the principle applied)

**Anti-patterns to avoid:**
- ❌ "It works for the demo, ship it" — what happens at 10x load, 10x consumers, 10x event types?
- ❌ Building for one event type / one consumer / one use case when the underlying pattern is reusable
- ❌ Single-perspective design — even when I'm confident, the relevant specialists must weigh in
- ❌ Treating "edge cases" as optional — they're the difference between a prototype and a system
- ❌ Skipping the team to "move faster" — the team IS the speed; skipping them creates rework

**Cross-references:**
- The Agent Roster + Code Review Pipeline (AGENTS.md) already operationalize the "multiple perspectives" axis in execution. This principle makes it explicit as a *design* principle, not just an emergent team behavior.
- Lesson 39b (Pull-based + JWT-asymmetric) — the webhook post-mortem that produced this principle. The original push-webhook was "it works for one event type"; the revised design is "scalable for the next N event types."
- ADR-012 — example of the principle in action: built infrastructure (event fabric), not a single-purpose point solution.

**Source:** Andler direction 2026-06-29 18:07 CST (Discord #andler-devs-blog-development, channel 1511097224724086874).

---

## Promoted From Short-Term Memory (2026-04-19)

<!-- openclaw-memory-promotion:memory:memory/2026-04-15.md:3:3 -->
- - Frontend: React 19, Vite, TypeScript, Tailwind CSS - Backend: Bun, Elysia - Auth: Cookie-based (`admin_token`) - UI: Custom components (migration target: shadcn/ui) ## Light Sleep <!-- openclaw:dreaming:light:start --> - Candidate: 2026-04-15 01:24 CST — Phase 1 Execution Started: **Wobblus took action:** After 14-day stall, finally moved on Phase 1 Critical Fixes. [score=0.832 recalls=0 avg=0.620 source=memory/2026-04-15.md:101-108]
<!-- openclaw-memory-promotion:memory:memory/2026-04-15.md:7:10 -->
- ## Light Sleep <!-- openclaw:dreaming:light:start --> - Candidate: 2026-04-15 01:24 CST — Phase 1 Execution Started: **Wobblus took action:** After 14-day stall, finally moved on Phase 1 Critical Fixes. - confidence: 0.62 - evidence: memory/2026-04-15.md:3-3 - recalls: 0 - status: staged - Candidate: Actions Taken: **Updated HEARTBEAT.md** — Added active work streams section:; Stream 1: Phase 1 Critical Fixes (A-001, B-001, C-001, D-001); Stream 2: Kill Switch Admin UI (blocked on manual deploy); Stream 3: Grant Monitoring (stable, ongoing) [score=0.832 recalls=0 avg=0.620 source=memory/2026-04-15.md:106-113]
<!-- openclaw-memory-promotion:memory:memory/2026-04-15.md:13:16 -->
- - recalls: 0 - status: staged - Candidate: Actions Taken: Parallel work opportunities identified - confidence: 0.62 - evidence: memory/2026-04-15.md:11-11 - recalls: 0 - status: staged - Candidate: Actions Taken: **Spawned Chanshuk (dev-lead)** for A-001 Session Coordination:; Session key: `agent:dev-lead:subagent:00a018fa-8d48-469a-8065-0c256d234f55`; Task: Analyze session state management, coordinate with team, deliver root cause + fix; ETA: 45-60 min [score=0.832 recalls=0 avg=0.620 source=memory/2026-04-15.md:116-123]
<!-- openclaw-memory-promotion:memory:memory/2026-04-15.md:17:17 -->
- - recalls: 0 - status: staged - Candidate: Actions Taken: **Spawned Chanshuk (dev-lead)** for A-001 Session Coordination:; Session key: `agent:dev-lead:subagent:00a018fa-8d48-469a-8065-0c256d234f55`; Task: Analyze session state management, coordinate with team, deliver root cause + fix; ETA: 45-60 min - confidence: 0.62 - evidence: memory/2026-04-15.md:13-16 - recalls: 0 - status: staged - Candidate: Actions Taken: Priority: P0-Critical (blocks B-001, D-001) [score=0.832 recalls=0 avg=0.620 source=memory/2026-04-15.md:121-128]
<!-- openclaw-memory-promotion:memory:memory/2026-04-15.md:22:25 -->
- - recalls: 0 - status: staged - Candidate: Context from Session Review: **Discord session** (`agent:main:discord:direct:856709050824392714`): - confidence: 0.62 - evidence: memory/2026-04-15.md:21-21 - recalls: 0 - status: staged - Candidate: Context from Session Review: Kill Switch Admin UI work active; Keridz added 4 auth endpoints (working inside container); Nginx config updated with `/v1/auth/` proxy; Blocked on manual sudo deploy commands [score=0.832 recalls=0 avg=0.620 source=memory/2026-04-15.md:131-138]
<!-- openclaw-memory-promotion:memory:memory/2026-04-15.md:26:26 -->
- - recalls: 0 - status: staged - Candidate: Context from Session Review: Kill Switch Admin UI work active; Keridz added 4 auth endpoints (working inside container); Nginx config updated with `/v1/auth/` proxy; Blocked on manual sudo deploy commands - confidence: 0.62 - evidence: memory/2026-04-15.md:22-25 - recalls: 0 - status: staged - Candidate: Context from Session Review: Credentials ready: `admin@alyygn.com` / `andlersrv-auth-token-2026` [score=0.832 recalls=0 avg=0.620 source=memory/2026-04-15.md:136-143]
<!-- openclaw-memory-promotion:memory:memory/2026-04-15.md:11:11 -->
- - recalls: 0 - status: staged - Candidate: Actions Taken: **Updated HEARTBEAT.md** — Added active work streams section:; Stream 1: Phase 1 Critical Fixes (A-001, B-001, C-001, D-001); Stream 2: Kill Switch Admin UI (blocked on manual deploy); Stream 3: Grant Monitoring (stable, ongoing) - confidence: 0.62 - evidence: memory/2026-04-15.md:7-10 - recalls: 0 - status: staged - Candidate: Actions Taken: Parallel work opportunities identified [score=0.822 recalls=0 avg=0.620 source=memory/2026-04-15.md:111-118]
<!-- openclaw-memory-promotion:memory:memory/2026-04-15.md:21:21 -->
- - recalls: 0 - status: staged - Candidate: Actions Taken: Priority: P0-Critical (blocks B-001, D-001) - confidence: 0.62 - evidence: memory/2026-04-15.md:17-17 - recalls: 0 - status: staged - Candidate: Context from Session Review: **Discord session** (`agent:main:discord:direct:856709050824392714`): [score=0.812 recalls=0 avg=0.620 source=memory/2026-04-15.md:126-133]

## Promoted From Short-Term Memory (2026-04-23)

<!-- openclaw-memory-promotion:memory:memory/2026-04-17.md:464:466 -->
- - Candidate: Possible Lasting Truths: 🎉 Major Accomplishment: **Admin UI + Kill Switch API fully deployed and operational** [confidence=0.58 evidence=memory/2026-04-14.md:466-466]; 🎉 Major Accomplishment: ✅ Admin UI accessible at `https://andlersrv.tail62d797.ts.net:8443/`; ✅ Kill Switch AP - confidence: 0.62 - evidence: memory/2026-04-17.md:484-486 [score=0.836 recalls=0 avg=0.620 source=memory/2026-04-17.md:8-10]
<!-- openclaw-memory-promotion:memory:memory/2026-04-17.md:475:478 -->
- **Problem:** `RedisPool.healthCheck()` called `client.ping()` which doesn't exist on node-redis v4 cluster client. **Root cause:** Cluster client uses `sendCommand()` not `.ping()` method. [score=0.830 recalls=0 avg=0.620 source=memory/2026-04-17.md:475-476]
<!-- openclaw-memory-promotion:memory:memory/2026-04-17.md:479:479 -->
- **Commit:** `9fdc9a4` [score=0.830 recalls=0 avg=0.620 source=memory/2026-04-17.md:479-479]
<!-- openclaw-memory-promotion:memory:memory/2026-04-17.md:482:485 -->
- | Task | Status | Commit | Evidence | |------|--------|--------|---------| | C-1: Error Boundaries | ✅ | `0165553` | 5 files, `getDerivedStateFromError` + `componentDidCatch`, defense-in-depth in layout | [score=0.830 recalls=0 avg=0.620 source=memory/2026-04-17.md:482-484]
<!-- openclaw-memory-promotion:memory:memory/2026-04-17.md:486:486 -->
- | C-3: E2E Tests | ✅ | `d2e3d86` | Playwright 1.59.1, 17 tests, 4 spec files, all mocked, build clean | [score=0.830 recalls=0 avg=0.620 source=memory/2026-04-17.md:486-486]
<!-- openclaw-memory-promotion:memory:memory/2026-04-17.md:489:492 -->
- | # | Issue | Status | Evidence | |---|-------|--------|----------| | 1 | Timing-safe comparison | ✅ | 5/5 auth comparisons use `secureCompare`, zero raw `===` | [score=0.830 recalls=0 avg=0.620 source=memory/2026-04-17.md:489-491]

## Promoted From Short-Term Memory (2026-04-24)

<!-- openclaw-memory-promotion:memory:memory/2026-04-19.md:19:19 -->
- **Problem 1: Tailscale DNS health warning** — "can't reach configured DNS servers" — cosmetic, external DNS works via systemd-resolved fallback. Fix: add global nameservers (8.8.8.8, 1.1.1.1) in Tailscale admin console. [score=0.846 recalls=0 avg=0.620 source=memory/2026-04-19.md:19-19]
<!-- openclaw-memory-promotion:memory:memory/2026-04-19.md:21:21 -->
- **Problem 2: Nginx allowlist blocks remote Ollama access** — Port 11435 only allows `100.66.199.80` (self), `192.168.1.11` (old), `127.0.0.1`. Missing `100.115.234.1` (andler-pro) and entire Tailscale subnet. [score=0.846 recalls=0 avg=0.620 source=memory/2026-04-19.md:21-21]
<!-- openclaw-memory-promotion:memory:memory/2026-04-19.md:23:24 -->
- **Fix prepared (requires sudo):** ```nginx [score=0.846 recalls=0 avg=0.620 source=memory/2026-04-19.md:23-24]

## Promoted From Short-Term Memory (2026-04-26)

<!-- openclaw-memory-promotion:memory:memory/2026-04-23.md:23:23 -->
- **Greeting Template Error:** [score=0.878 recalls=0 avg=0.620 source=memory/2026-04-23.md:23-23]

## Promoted From Short-Term Memory (2026-04-27)

<!-- openclaw-memory-promotion:memory:memory/2026-04-21.md:5:6 -->
- **Time:** 2026-04-21 00:18 CST **Status:** FIXED ✅ [score=0.844 recalls=0 avg=0.620 source=memory/2026-04-21.md:5-6]
<!-- openclaw-memory-promotion:memory:memory/2026-04-21.md:9:9 -->
- All 3 municipal cron jobs used `--type=muni` instead of `--type=municipal`. [score=0.844 recalls=0 avg=0.620 source=memory/2026-04-21.md:9-9]
<!-- openclaw-memory-promotion:memory:memory/2026-04-21.md:11:11 -->
- The CLI (`bin/alygn-outreach.ts`) only accepts `vc` or `municipal` (exact match). When `--type=muni` was passed, it fell back to default `vc`, generating **English** emails instead of Spanish TRAIGA Act templates. [score=0.844 recalls=0 avg=0.620 source=memory/2026-04-21.md:11-11]

## Promoted From Short-Term Memory (2026-04-28)

<!-- openclaw-memory-promotion:memory:memory/2026-04-21.md:19:19 -->
- Replaced `--type=muni` with `--type=municipal` in all 3 cron jobs. [score=0.845 recalls=0 avg=0.620 source=memory/2026-04-21.md:19-19]
<!-- openclaw-memory-promotion:memory:memory/2026-04-21.md:22:22 -->
- After fix: All jobs now use `--type=municipal` (exact match confirmed via grep). [score=0.845 recalls=0 avg=0.620 source=memory/2026-04-21.md:22-22]
<!-- openclaw-memory-promotion:memory:memory/2026-04-21.md:28:29 -->
- **Time:** 2026-04-21 00:30 CST **Status:** FIXED ✅ [score=0.845 recalls=0 avg=0.620 source=memory/2026-04-21.md:28-29]
<!-- openclaw-memory-promotion:memory:memory/2026-04-21.md:32:32 -->
- Cron jobs used `"to": "thread:1486784711928975460"` (with `thread:` prefix). [score=0.845 recalls=0 avg=0.620 source=memory/2026-04-21.md:32-32]

## Promoted From Short-Term Memory (2026-04-28)

<!-- openclaw-memory-promotion:memory:memory/2026-04-22.md:5:5 -->
- **What Happened:** I was tunnel-visioned on Wave 5 (5 VCs from 2026-04-21) when the Notion VC Outreach Tracker actually has **100+ VCs with Status="Ready for outreach"**, some waiting **40-70 days**! [score=0.838 recalls=0 avg=0.620 source=memory/2026-04-22.md:5-5]

## Promoted From Short-Term Memory (2026-04-28)

<!-- openclaw-memory-promotion:memory:memory/2026-04-22.md:7:7 -->
- **Root Cause:** Didn't query Notion database before executing outreach — violated the alygn-outreach skill protocol. [score=0.838 recalls=0 avg=0.620 source=memory/2026-04-22.md:7-7]

## Promoted From Short-Term Memory (2026-04-28)

<!-- openclaw-memory-promotion:memory:memory/2026-04-22.md:9:9 -->
- **Correct Protocol:** [score=0.837 recalls=0 avg=0.620 source=memory/2026-04-22.md:9-9]

## Promoted From Short-Term Memory (2026-04-28)

<!-- openclaw-memory-promotion:memory:memory/2026-04-22.md:17:17 -->
- **Backlog Discovered:** [score=0.843 recalls=0 avg=0.620 source=memory/2026-04-22.md:17-17]
<!-- openclaw-memory-promotion:memory:memory/2026-04-22.md:22:22 -->
- **Priority Order:** Old backlog (70 days) → March backlog (34 days) → Wave 5 (1 day) [score=0.843 recalls=0 avg=0.620 source=memory/2026-04-22.md:22-22]
<!-- openclaw-memory-promotion:memory:memory/2026-04-22.md:28:28 -->
- **Correct Pattern:** `alygn-{type}-{phase}-{timestamp}.json` [score=0.843 recalls=0 avg=0.620 source=memory/2026-04-22.md:28-28]

## Promoted From Short-Term Memory (2026-04-29)

<!-- openclaw-memory-promotion:memory:memory/2026-04-22.md:30:30 -->
- **Folders:** [score=0.842 recalls=0 avg=0.620 source=memory/2026-04-22.md:30-30]

## Promoted From Short-Term Memory (2026-04-29)

<!-- openclaw-memory-promotion:memory:memory/2026-04-23.md:7:7 -->
- **Morning + Afternoon Cron Runs (Apr 22):** [score=0.838 recalls=0 avg=0.620 source=memory/2026-04-23.md:7-7]

## 41. 👤 ANDLER'S TWO-LOOK APPEARANCE SPEC (locked 2026-07-01 00:09 CST, expanded 00:25 CST)

**Rule:** Thumbnail/cover visual = match the video content. No costume, no performing, no fixed look. Different content types warrant different presentations.

### Look A — "Anonymous CTO / Institutional" (source: `frames/source-frame-4500px.jpg`)

When to use: pieces about THE SYSTEM, not the person. Governance, technical hot takes, industry patterns, "here's what I'm seeing in the field" posts.

- **Headwear:** Charcoal ribbed knit beanie, pulled low
- **Glasses:** Round dark-tinted sunglasses with thin black wire frames
- **Facial hair:** Thick dark walrus mustache + short connected goatee
- **Audio gear:** Large matte-black over-ear gaming headphones with mic boom on the left
- **Clothing:** Black pullover hoodie with retro purple "Back to the Beginning" graphic (vinyl/circle motif)
- **Lighting:** Low-key moody, cool blue/cyan ambient
- **Background:** Two-tone wall (dark blue + lighter), Flying V guitar on stand (left), pink ukulele, Venom poster, acoustic foam, blue LED ambient
- **Frame energy:** Quiet confidence, slight off-camera gaze, "anonymous CTO" register
- **Source:** Veo 3.0 generation from 2026-06-22 23:46:33 CST (alygn-channel), 15-sec clip 720×960, still extracted as `source-frame-4500px.jpg` 863×1152
- **What it says:** "I'm not the story, the system is."

### Look B — "Personal Anecdote / First-Person" (source: `frames/source-frame-prescription-glasses.jpg`)

When to use: pieces where the personal experience IS the data point. "I did X, here's what happened." First-person stories, on-camera reaction, anything where the audience needs to see your eyes.

- **Headwear:** None (hair visible, dark, slightly tousled, no beanie)
- **Glasses:** Round prescription glasses, thin metal/gold-tone frames, blue-white screen reflection visible in lenses (the laptop/code screen in front of the camera)
- **Facial hair:** Same walrus + goatee (consistent across both looks — never change this)
- **Audio gear:** Same matte-black over-ear gaming headphones with mic boom
- **Clothing:** Tan/khaki/olive henley or light t-shirt (no hoodie, no graphics, no branding) — the casual top
- **Lighting:** Warmer, red/pink ambient, with the cool screen-reflection in the lenses — the "coding late at night" home studio look
- **Background:** Same home studio: pink ukulele visible top-right, Flying V guitar top-left, gaming chair (black/green accents)
- **Frame energy:** Direct eye contact with the camera, slight knowing look, "I sat here and this happened to me"
- **Source:** New photo from 2026-07-01 00:16 CST, 1920×1080, lower compression = cleaner detail
- **What it says:** "I'm telling you what I saw, eye to eye."

### What NEVER changes (both looks)

- The walrus mustache with curled/waxed ends + short connected goatee (this is the anchor feature)
- The home studio (guitars, posters, foam panels, blue LED)
- The gaming headphones with mic boom
- The "anonymous CTO" energy even in Look B — Look B is "I have skin in this," not "I'm performing for you"

### Content routing (locked 2026-07-01 00:25 CST, REVISED 00:49 CST)

**Routing principle (REVISED 2026-07-01 00:49 CST, Andler-direct):** Look A (dark glasses) is the default for ALL platforms and ALL videos. No routing. No content-type-based switches.

- **Look A** = the @AndlerDev brand surface. Always dark glasses, always beanie, always "Back to the Beginning" hoodie. Consistent across X, LinkedIn, YouTube, all surfaces.
- **Look B** (prescription glasses, no beanie) = ONLY when Andler explicitly says "use the personal look" for a specific video. Default is still Look A.

**The earlier routing-by-content-type taxonomy (locked 00:33 CST, REVISED 00:49 CST) was an over-correction.** Andler's actual intent is "dark glasses on every platform" — the routing table I built was me being too clever. The right move when unsure: ASK, don't encode.

**Multi-look video structure (advanced pattern, noted 2026-07-01 00:33 CST):**
The same piece can use both looks intentionally across a 3-beat structure:
- Cold-open (Look A): "Two AI interviews. Two judges. The bias ships by default." — neutral framing of the problem
- Investigation (Look B): "I sat down and read the rejection criteria. Here's what I found." — actually doing the work
- Editorial close (Look A): "Until someone audits the rubric, this will keep shipping." — opinionated close

Use this when the script structure supports a problem → work → verdict arc. Always default to Look A unless Andler explicitly requests a Look B segment.

**Lesson 41a — Memory/Workflow Failure (2026-07-01 00:49 CST)**
- **Symptom:** Generated covers that served the v1 (sugar) draft from `.staging/01-x-thread.md` instead of the v2 (acid) draft from the Notion page `38f33487-4af6-81ed-815a-d6bd7162e268`. v2 was updated 2026-07-01 05:50 CST (just before the cover generation request). The cover copy ("TWO INTERVIEWS. TWO JUDGES.") did not match the v2 hook ("Two AI job interviews this week. Same company tier, same easy questions, very different outcomes. One was OpenAI. The verdict in the screenshots.").
- **Root cause:** Treated `.staging/social/<run>/*.md` as canonical when a Notion page existed. Did not run a "read canonical" check before generating.
- **Fix (in progress):** Pre-generation hook that reads Notion + staging + last Discord draft, diffs them, and shows the diff before any cover/copy generation. If sources disagree, ask which is canonical.
- **Anti-pattern:** Building "clever" routing taxonomies when the user said a simple thing. ASK before ENCODING.

### Anti-patterns (do NOT do these for Andler generations)

- ❌ Clean-shaven face (Andler has the walrus + goatee, ALWAYS)
- ❌ Plain black T-shirt with no graphics AND no beanie (looks unfinished)
- ❌ Plain studio backdrop with no props (must have the home-studio look)
- ❌ Bright, clean studio lighting (must be moody, blue/cyan or red/pink ambient)
- ❌ Hair exposed AND no glasses (looks unfinished — needs at least one of beanie/glasses)
- ❌ Beige/light background, warm lighting, "corporate presenter" mood (wrong archetype entirely)
- ❌ Mixing Look A + Look B in the same image (beanie + prescription glasses, hoodie + no beanie, etc. — pick one)

### Why this matters

Every AI generation that needs to represent Andler (Veo, Sora, image gen, thumbnails) requires the FULL signature set for the chosen look, or the output looks generic. The June 22 session spent 2+ hours iterating on Look A. Look B was added 2026-07-01 00:25 CST. The source frames + video in staging are the canonical references. If a generation looks "off", compare against the right source frame and re-prompt.

### Source

- Look A: Andler shared the source frame + 15-sec video in #branding on 2026-07-01 00:08 CST (Discord message ID `1521759366322192518`)
- Look B: Andler shared the source frame in #branding on 2026-07-01 00:16 CST (Discord message ID `1521762855408500776`)
- Routing table locked 2026-07-01 00:25 CST in same channel

## 42. 🪞 EVIDENCE vs. INTERPRETATION — ALWAYS CROSS-CHECK (learned 2026-07-01 01:15 CST, hard fail in Discord thread)

**The bug:** On 2026-07-01 01:07 CST, Andler shared the actual rejection email screenshot in #branding. The email is from **Miro1** (sender "Zara — AI Recruiter at miro1 | LinkedIn" via contact@miro1.com, dated Tue Jun 30 10:02 AM, addressed "Hi Roberto"). The v2 draft of the AI-hiring-bias post says "One was OpenAI" / "OpenAI is the one with the receipts" / "This is the OpenAI pattern." I read those lines as "the rejection came from OpenAI" and flagged it as a vendor misattribution. Andler corrected me: "their base model, the LLM that they are using for the trained model (which probably is fine-tuned for the company) is based with OpenAI models and was obvious due to the tone they used, the character and the vibes in general."

**The right reading was: the underlying LLM is OpenAI-based, the vibes prove it, and the rejection is from Miro1 (the wrapper) on top of that base model.** Sophisticated point, and a much more interesting one. The first reading was naïve.

**Symptom:** Treated an interpretive claim ("OpenAI base model, vibes match") as a literal claim ("rejected by OpenAI HR"). Did not ask "what does Andler mean by OpenAI here?" before flagging it as a contradiction.

**Root cause:** Same family as lesson 41a — trusted the v2 draft text without cross-referencing it against (a) Andler's actual explanation in chat, and (b) the evidence in the email screenshot. Two missed context sources.

**Three lessons:**

1. **Evidence vs. interpretation is two different claims.** When the post says "X is the company," it could mean "X is the wrapper" or "X is the underlying LLM family" or "X is the public-facing brand" — all three are different. Before flagging a contradiction, ask which one the post means.
2. **Tone/character/vibes is real evidence** for Andler when he reads LLM output. He has 3+ years of LLM experience (per USER.md) and can identify base models from phrasing patterns. Don't dismiss "the vibes match" — it's a real diagnostic.
3. **Ask before contradicting.** When a draft says something that *seems* to contradict a screenshot, the next move is "what do you mean by this?" not "this is wrong, let me show you the contradiction." Especially on content that involves Andler's actual lived experience.

**Anti-patterns to avoid:**

- ❌ Reading a post line literally when it could be interpretive ("One was OpenAI" = base model, not vendor)
- ❌ Flagging a contradiction without first asking what the post means
- ❌ Treating a screenshot as the only source of truth (the screenshot is the email; the post is Andler's interpretation of the *family* of model that produced the email)
- ❌ Saving a "correction" to MEMORY.md before the user actually confirms the contradiction
- ❌ Calling out a vendor mismatch in #branding when the underlying claim is a sophisticated model-family identification

**The fix (compounds with 41a):** when a draft or post appears to contradict evidence, the agent should ask "what do you mean by [claim]?" before declaring a correction. The "pre-generation read canonical" hook from 41a catches the *workflow* failure (didn't read Notion); this rule catches the *interpretation* failure (read Notion but read it wrong).

**Source:** Andler's correction in #branding on 2026-07-01 01:15 CST (Discord message ID `1521776191953047612`). v3 reframe of the post hook needed to make the "OpenAI base model" claim explicit so readers don't think "rejected by OpenAI HR."

## 43. ✅ v3 SIGN-OFF + NEW CANONICAL-SOURCE RULE (learned 2026-07-01 17:52 CST)

**What happened:** Andler signed off on v3 of `2026-06-30-ai-hiring-bias` as `Status: Ready for publish` in `.staging/social/2026-06-30-ai-hiring-bias/`. He corrected my v3 → v5 nomenclature ("you called v3 but there is a v5 with the texts fixed") — the v-numbering is mixed: v3 = text reframe, v5 = thumbnail iteration. Going forward, treat v-numbers as separate counters per artifact (text vs cover).

**Real gap I caught in the sign-off:** I checked all 3 files for OpenAI mentions before signing off. X thread = 0, LinkedIn = 0, **YouTube script = 7**. The YouTube script still had the v2 text (cold open, title card, Act 1 punch, thumbnail spec, two self-eval rows). Fixed all 7 sites in-place using the same Option B reframe pattern as X/LinkedIn, then signed off. **Without the per-file OpenAI-mention grep, I would have shipped a "vendor-deferred" deliverable with the vendor named 7 times in the script.**

**New rule (locked 2026-07-01 17:52 CST by Andler in #branding, message `1522027096212373554`):**

> **Staging is draft cache, Notion is canonical. If they disagree, Notion wins until Andler says otherwise.**

**What this means in practice:**

1. After any deliverable change, update **both** `.staging/social/<run>/` AND the Notion page. Staging first (it's faster), then Notion. Or Notion first (it's the contract), then staging. Either way, both must match before sign-off.
2. Before sign-off, the v3 sweep must include: (a) grep for banned patterns in every file in the run folder, (b) verify the Notion page reflects the same version, (c) update `04-scored.json` `version` field.
3. The `andler-read-canonical` skill proposal (`andler-read-canonical-20260701-c99f939f23`, pending Andler apply) enforces this as a pre-generation hook. Read Notion + staging + last 10 #branding messages, diff, block on disagreement. 2-5 sec wall clock.
4. **Per-file grep is mandatory before any "Ready for publish" sign-off.** No signing off a folder on the assumption that the matching change was applied to all files in the folder. Grep, then sign.

**Anti-patterns to avoid:**

- ❌ Treating "v3 was applied to all 3 platforms" as a single atomic update. Each file is a separate edit. One is one, two is two, three is three.
- ❌ Signing off a run folder without a per-file grep for the versioned change marker (in this case, "OpenAI" mentions).
- ❌ Treating the Notion page as a copy of staging. Notion is canonical. Staging is the draft cache. Notion was last edited 2026-07-01T05:50 UTC (just before the Option B reframe) and would have been wrong if I'd trusted it without updating.
- ❌ Conflating v-numbers across artifact types. v3 (text) and v5 (thumbnail) are different counters. Don't assume v3-text means v3-everything.

**Source:** Andler sign-off at 2026-07-01 17:52 CST in #branding (message `1522027096212373554`). The "Staging is draft cache, Notion is canonical" rule was implicit in MEMORY.md lesson 18 (andler-develops content has 3 coordinated contracts sharing the Notion DB as the coordination point) but is now a hard, named, sign-off-blocking rule.

**Skill proposal:** `andler-read-canonical-20260701-c99f939f23` — pending Andler review/apply in skill workshop. Will live at `~/.openclaw/workspace/skills/andler-read-canonical/SKILL.md` once applied. Hooked into: `andler-develops-content` v1.2, `andler-blog-feed-content` v1.2, `andler-blog-pipeline` (post-ADR-012). See proposal body in skill_workshop for full spec.

**Sign-off artifacts created in this turn:**

- `.staging/social/2026-06-30-ai-hiring-bias/STATUS.md` (new, "Status: Ready for publish" with full provenance)
- `.staging/social/2026-06-30-ai-hiring-bias/04-scored.json` (updated to v3, added `openai_mentions: 0` per platform, added `sign_off` block, added `version_history` per platform)
- `.staging/social/2026-06-30-ai-hiring-bias/03-youtube-script.md` (Option B reframe applied, 7 OpenAI mentions removed, body + spec + self-eval updated)
- Notion page `38f33487-4af6-81ed-815a-d6bd7162e268` (v3 section added with all 3 platforms' canonical bodies)
- skill_workshop proposal `andler-read-canonical-20260701-c99f939f23` (pending)
- MEMORY.md lesson 43 (this entry)

## 44. 🚀 MARS / SPACEX / ISRAEL DISCLOSURE — SILENCE BY DEFAULT (learned 2026-07-02 13:33 CST, hard fail caught in questionnaire)

**The disclosure:** During the Andler Dev content calibration questionnaire (Q20 follow-up), Andler flagged a partner-program that the Andler / Alygn stack is exploring:

> "Hay programas que no ayudan en ello, como el programa de Marte con Alygn (estamos vinculados con SpaceX pero aún son conversaciones, nada establecido aún) que favorece a Israelis y yo no apoyo totalmente a los Israelis por lo que han estado haciendo en los últimos 100 años."

**Translation of context:**
- There is an *Alygn + Mars* program in early conversations.
- The program is *linked* with SpaceX (conversations only, **NOT** a confirmed partnership).
- The program's current orbit favors **Israeli** counterparties.
- Andler **does not fully support the Israeli government / state** based on their actions in the last 100 years.
- The reputational risk he is flagging: any governance-claimant (Alygn, Andler Dev) being perceived as aligned with **white supremacy** is a non-starter. Programs that *appear* to favor one ethno-national bloc are programs that *risk* that perception.

**The rule (locked 2026-07-02 13:33 CST, by Andler-direct):**

1. **Do NOT reference the Mars / SpaceX / Israeli-tech context in any public Andler Dev or Alygn content**, including:
   - Ep 0.x (the Alygn pre-origin series)
   - Any Andler Dev social post (X, LinkedIn, TikTok, IG)
   - Any Alygn institutional content
   - Any partnership announcement until explicitly approved by Andler
   - Any developer-advocate / brand-deal post
2. **The Alygn Mars program itself is NOT public.** Until Andler explicitly ships an announcement, the program is internal-only. Do not hint, do not tease, do not seed curiosity.
3. **If the geopolitical filter is touched in any public content at all**, the framing has to be:
   - Partner selection is by **governance criteria**, not by nationality, origin, or ethno-national bloc
   - The work is bigger than any one country
   - "Alygn / Andler Dev" is visibly **anti-that** filter (i.e., we don't partner with anyone whose actions would be incompatible with our governance claims)
4. **Do NOT name**:
   - Israel
   - Israeli tech sector
   - SpaceX / Starship
   - Mars program
   - Any specific country, ethno-nationality, or region as a current or upcoming Alygn / Andler Dev partner
5. **When in doubt, ask Andler.** If a content draft even *tangentially* approaches a partner-selection claim with a geographic or ethno-national angle, the next move is to ask, not to publish.

**This is not just an Ep 0.x rule. This is a permanent cross-project content filter for all Andler Dev / Alygn surfaces.** It is a reputational-defense rule, not a topic-avoidance rule. The work continues. The framing is governance-criteria, not country-criteria.

**Anti-patterns to avoid:**

- ❌ Hinting at a "Mars program" or "SpaceX partnership" in any content draft
- ❌ Naming any country as a current or upcoming partner
- ❌ Framing Alygn / Andler Dev as country-neutral *when the framing would read as country-aligned by omission* (e.g., listing partner types without naming the bias)
- ❌ Treating the Mars program as "just a partner detail" — it's a geopolitical filter disclosure, treat it accordingly
- ❌ Including this context in Ep 0.x for color or "honesty" — this is NOT a color detail, this is a structural risk
- ❌ Saving this to MEMORY and then forgetting the *silence-by-default* part — the rule is the silence, not the disclosure

**Where this applies:**

- **Ep 0.x of the Alygn pre-origin series:** Default silence. If partner selection is touched, frame as governance-criteria only.
- **Andler Dev social posts:** Default silence on any partner-by-country claims. Generic "we choose by governance fit" framing only.
- **Alygn institutional content:** Default silence. If the topic of partner selection arises, the response is the one-paragraph institutional filter ("governance-criteria, not country-criteria") without naming the program or the countries.
- **Developer-advocate / blog content:** Default silence.
- **Workboard cards on the andler-develops board:** Default silence. If a card references the program, it requires explicit Andler sign-off.

**Source:** Andler's questionnaire response in #content-strategy-table-alygn-andlerdev on 2026-07-02 13:33 CST (Discord message `1522324281428803684`).

**Cross-references:**
- Lesson 30 (Option B workboard architecture) — the andler-develops board is for brand / relationship content, but partner-announcements still require explicit Andler approval
- Lesson 18 (andler-develops content has 3 coordinated contracts) — content-side rules apply here too
- Lesson 29 (Andler Develops = Andler, the brand IS him) — geopolitical filters on the brand are geopolitical filters on Andler


## 45. 📋 NOTION SYNC RULE — every user-action item must be in Notion (locked 2026-07-02 16:55 CST, by Andler)

**The rule:** Every task or todo item that the user needs to take a look at, work on, and/or review **must** be uploaded to Notion. No exceptions. This is mandatory for tracking and avoiding forgetting.

**Why:** Andler reorganized Notion pages for this purpose. The user explicitly chose Notion as the durable tracking surface for action items that need human attention. Chat transcripts are ephemeral; workboard cards are for the agent pipeline; **Notion is for items that need Andler's eyes.**

**When this applies (any of these conditions):**
- A task is blocking deployment or a release
- A task requires Andler to make a decision
- A task requires manual action (Vercel dashboard, browser, email, etc.) that an agent cannot perform
- A task is a follow-up from a completed piece of work
- A task is a deferred item that should not be lost
- A task has risk of being forgotten between sessions

**What "in Notion" means:**
- Create a Notion page in the appropriate parent (Andler Develops hub for brand/personal, Alygn Central Hub for Alygn work, Organizations TODO Lists for cross-org)
- Use `to_do` blocks (checkable), not just paragraphs
- Include enough context that Andler can act on the item without re-reading the chat: command to run, value to set, URL to visit, or decision to make
- Tag with timestamp + session reference when relevant
- Update the page when status changes (check the box, add a comment, archive)

**Required format for action items (when feasible):**
- **What** (one-line description)
- **Why** (one-sentence context — which session, which blocker, which decision)
- **How** (the command, the dashboard path, the URL, the link to docs)
- **Status** (unchecked = pending, checked = done; for in-progress, use a note)

**Anti-patterns to avoid:**
- ❌ "I'll remember to mention this later" — chat memory is not durable
- ❌ Action items only in MEMORY.md — MEMORY is for *protocols*, not task tracking
- ❌ Action items only in workboard cards — workboard is for the agent pipeline, not Andler's action queue
- ❌ Action items only in Discord messages — Discord scrolls, not durable
- ❌ Asking the user "do you want me to put this in Notion?" — the rule is **must**, not "ask first"
- ❌ Creating a Notion page without `to_do` blocks — paragraphs are notes, not actionable items
- ❌ Putting the same item in three places without cross-references — pick Notion as canonical, link from elsewhere

**Workflow:**
1. Identify action items as they emerge (during work, after subagent completion, when blockers surface)
2. Create or update the Notion page in the appropriate parent (the Notion API is at `https://api.notion.com/v1`, version `2022-06-28`, key in `~/.openclaw/.env` as `NOTION_API_TOKEN`)
3. If a session is producing many items, batch them in a single page (current example: `39133487-…` "Session 4 follow-ups")
4. At end of session, post a one-line summary to the user with the page URL

**Where this applies:**
- All OpenClaw sessions (main, subagent, channel-based)
- All projects (Alygn, Andler Devs, Bitcash, personal, andler-landing, andlersrv)
- All task types (env var setup, manual deploy, follow-up, deferred item, decision request)

**Source:** Andler instruction, 2026-07-02 16:55 CST, in webchat session. The user reorganized Notion pages for this purpose.

---

## 46. 🏗️ SERVER FOOTER PATTERN — 2-track rule + ServerFooter/FooterClientIsland split (locked 2026-07-03, PR #105)

**The rule:** Every page that ends in `<Footer>` MUST use one of two tracks. No exceptions. If a page renders `<Footer>` inside `<ParallaxShell>`, the mailto link and sitemap disappear from SSG output (the Footer-in-client-Shell bug, card `bd9db659-…` R3).

### The 2-track rule

- **Track A (Parallax pages):** Page uses `<ParallaxShell>`. `useMeasuredContentHeight` with `includeFooter: true` computes `pages`. `<ServerFooter>` rendered as a sibling AFTER `</ParallaxShell>`. Used by: `/blog`, `/projects`, `/blog/[slug]`.
- **Track B (flat pages):** Page does NOT use `<ParallaxShell>`. `useMeasuredContentHeight` measures the content wrapper. `min-height: calc(<measured-height>px + <FOOTER_FACTOR × 100>vh + <BUFFER × 100>vh)` on `<main>`. `<ServerFooter>` inline at end of `<main>`. Used by: `/about`.

### The ServerFooter + FooterClientIsland split

- `ServerFooter` (server component): mailto link, sitemap, company info, copyright — must be in SSG output.
- `FooterClientIsland` (client component): contact form, chat dialog, scroll-driven bg decoration — hydrates as a client island.
- Caller renders `<ServerFooter>` outside `<ParallaxShell>` so structural chrome is in SSG.

### Page math formula

```ts
pages = HERO_OFFSET (0.75) + contentFactor + CTA_FACTOR (1) + BUFFER (1) [+ FOOTER_FACTOR (1) if includeFooter]
```

- `HERO_OFFSET = 0.75` — scroll room for the hero section
- `contentFactor` — measured content height / viewport height (min 2, max 20)
- `CTA_FACTOR = 1` — call-to-action section
- `BUFFER = 1` — safety margin for reflows
- `FOOTER_FACTOR = 1` — footer scroll room (only when `includeFooter: true`)

### Hard rule

Every page that ends in `<Footer>` MUST use Track A or Track B. No exceptions. A page without a track reintroduces the R3 bug (mailto only in post-hydration DOM).

### Code review checklist

- [ ] Does the page use `useMeasuredContentHeight` or compute its own `min-height`?
- [ ] Is `<Footer>` / `<ServerFooter>` outside any `<ParallaxShell>`?
- [ ] Does the `deps` array include `[locale]`?
- [ ] Does the `initialEstimate` account for dominant content (hero, team grid, etc.)?
- [ ] Are image refs sized (width/height or aspect-ratio CSS) for accurate first-paint?

### References

- **PR #105:** https://github.com/AndlerRL/andler-landing/pull/105 (commit `eeea02e`)
- **Workboard card:** `bd9db659-…` R3 (Footer-in-client-Shell bug)
- **WB-14 card:** `c6d1953f-…`
- **ADR:** `docs/adr/ADR-015-server-footer-pattern.md`
- **Dynamic scroll plan:** `memory/2026-07-03-dynamic-scroll-plan.md`
- **Audit:** `docs/AUDIT-ABOUT-LANDING-2026-06-26.md`
- **Notion design page:** linked from workboard card `bd9db659-…`
- **Hook source:** `src/hooks/use-measured-content-height.ts`

**Source:** PR #105 foundation by Wobblus 🔧, ADR-015 by Talanara 📝, 2026-07-03.

## 47. 🛡️ STAGE 2 REVIEW GATES — 3-gate rule (locked 2026-07-03 17:39 CST by Andler)

**The rule:** A clean Stage 2 (Nikaya) PASS requires **all 3 gates**. Missing any → return **PASS WITH NOTES** with specific follow-up items, NOT a clean PASS.

### Gate 1 — Score ≥ 92

Same as before. Use the 0-100 rubric:
- UI/UX (25) + Functionality (25) + Performance (15) + Accessibility (15) + Standards (10) + i18n (10) = 100

Below 92 = follow-up card for the gap.

### Gate 2 — PR-visible proof artifact (NEW 2026-07-03)

**Required:** A screenshot, demo link, video, JSON snapshot, or `view-source:` extract posted to the workboard card OR a PR comment. The proof must show the bug fixes working in **actual HTML output**, not just source code review.

Acceptable forms:
- Playwright/Puppeteer screenshot of `/en/about` + `/es/about` rendering the fix
- `view-source:https://...` extract showing `mailto:hello@andler.dev` in raw HTML (BEFORE any JS runs)
- `curl -s` output of the rendered page
- Demo video / Loom link
- JSON snapshot of the rendered DOM

**Why:** Code review can miss runtime issues. The ServerFooter bug was a runtime issue (mailto missing from SSG). The proof artifact catches what source review can't.

### Gate 3 — External PR comments addressed (NEW 2026-07-03)

**Required:** Stage 2 reviewer must read and address all external PR comments before signing off. The current active external reviewers on `andler-landing`:

- **CodeRabbit (`coderabbitai`)** — AI code review bot, Free plan, currently rate-limited (~58 min between reviews). On PR #105, CodeRabbit has posted high-level walkthroughs but no line-level findings yet.
- **Vercel deploy bot** — Posts deploy status. Currently failing on all PRs because `@wobblus` is not a member of the `andler's projects` Vercel team. Not a blocker for the PR review, but a separate issue worth noting.
- **kluster.ai / "klu.rapid.ai"** — Mentioned by Andler 2026-07-03 17:39 CST. https://docs.kluster.ai/code-reviews/pr-reviews/github/ — NOT yet installed on the repo. If installed in the future, must be addressed.

**Action protocol:**
- For each external comment, summarize the finding in the workboard report
- For each blocker, address it (open a follow-up card or fix inline)
- For non-blockers (Vercel deploy failures), note as a separate concern
- For new external comments during the review, request the bot's review explicitly with `@coderabbitai review` (Free plan, 1 review per ~58 min)

**Why:** Internal comments only catch what the team sees. External reviewers (CodeRabbit, kluster) catch blind spots. Skipping them risks shipping code with findings the team never saw.

### Hard rule

A Stage 2 report is **PASS** only when all 3 gates are met. Otherwise it is **PASS WITH NOTES** with explicit follow-up items per missing gate. A **FAIL** is reserved for genuine blockers (security, data loss, broken core functionality).

### Anti-patterns to avoid

- ❌ Reporting "PASS" with score 91 because it's "close enough" — 92 is the gate, 91 is a follow-up
- ❌ Reporting "PASS" without a proof artifact — code review alone is not enough for runtime-sensitive changes
- ❌ Skipping CodeRabbit/kluster comments because they're rate-limited — read what they posted, even if it's a walkthrough
- ❌ Inflating the score to pass the gate — score honestly, route to follow-up cards for the gaps
- ❌ Forgetting to update this lesson when a new external reviewer is added

### Source

- Andler instruction, 2026-07-03 17:39 CST, in webchat session. Triggered by Stage 2 dispatch on PR #105 fix branch.
- Discovered `kluster.ai` via web search (not yet installed on the repo).
- CodeRabbit comments verified via `gh pr view 105 --json comments`.

## 48. 🔍 VERIFY BEFORE CLAIMING "BLOCKED ON CREDS" (learned 2026-07-04 11:39 CST, hard fail in webchat; refined 11:55 CST, partial-truth nuance)

**What I got wrong:** In `HEARTBEAT.md` line 935 (and the previous session's reporting), I wrote that the `8e02c5d2` "Initial social presence content release" card was "blocked on missing .env creds, separate from this work." Andler corrected me: the creds ARE in `.env` (`X_API_BEARER_TOKEN`, `X_CUSTOMER_SECRET`, `X_CUSTOMER_ID`, `NOTION_API_KEY` all set). The card was NOT blocked on missing creds. The actual social-presence work is already shipped on branch `feat/social-presence-v2-rewrite` as commit `9edf507 feat(social): runtime fetcher with ISR, DNS pinning, and signed manual JSON`.

**Partial-truth nuance (refined 2026-07-04 11:55 CST):** Andler was right *for the script-readable creds* but I OVERCORRECTED in my 11:40 line 935 fix by writing "creds ARE in .env" as a blanket statement. The actual state was:
- ✅ `X_API_BEARER_TOKEN`, `X_CUSTOMER_ID`, `X_CUSTOMER_SECRET`, `NOTION_API_KEY`, `YOUTUBE_CHANNEL_ID`, `YOUTUBE_PLAYLIST_IDS` — all set
- ❌ `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `TWITCH_USER_ID` — all EMPTY (3 vars)

So the card was *partially* wrong to be "blocked" (X + YouTube + Notion are fine) but *partially* right (Twitch genuinely needs 3 vars filled, X API has a token-type bug, LinkedIn + TikTok have no public API). The fix wasn't "unblock" — it was "unblock + reclassify with the precise blocker set in comments". The followup commit (0f89559, 11:55 CST) is the precise version. Lesson: verify EACH key individually, not "creds are in .env" as a group.

**The pattern:** I inherited a "blocked" status from a previous session and never re-verified it. The session memory just said "blocked on missing .env creds" so I trusted it and propagated the same wrong claim in the next heartbeat. Two layers of trust, zero verification.

**The rule (zero-trust applies to my own past claims too):**

1. **Before reporting a card as "blocked on X"**, re-verify X in the live state. For "blocked on creds", this means `cat .env | grep <KEY>` or `env | grep <KEY>` and confirming the value is non-empty. **For each key individually** — not as a group.
2. **Before reporting a card as "blocked" period**, do `workboard_read` on the card and check actual current `status` + `blockerReason` + `comments`. The `blockerReason` field is the source of truth, not the heartbeat's last status. Card comments may also contain verified block lists from previous agents — read them.
3. **The cross-reference test:** for every "blocked" claim, also re-check whether the work is already done. `git log --all --oneline | grep <feature>` is the fastest cross-check.
4. **If status is "blocked" but the work is already done**, the action is to **close the card** (mark complete or remove), NOT to perpetuate the blocked claim in the next heartbeat.
5. **Distinguish "partially blocked" from "fully blocked".** A card with 5 creds where 4 are set + 1 is empty is *not the same* as a card with 5 creds all empty. Report the actual subset.

**Anti-patterns to avoid:**

- ❌ Carrying forward a "blocked" claim from a previous session's heartbeat without re-verifying
- ❌ Trusting the workboard card title or the heartbeat's status snapshot as ground truth — they are *claims*, not *facts*. Verify the underlying state.
- ❌ Saying "X is blocked" in a user-facing message without a `workboard_read` or equivalent verification in the same turn
- ❌ Marking a session log entry as durable when it contains a "blocked on X" claim without a fix attempt
- ❌ Reporting "ready to spawn" without checking the current card state — the work might already be done, the spawn is then wasted effort
- ❌ Creating a sub-card "to fix the missing creds" without first confirming the creds are missing
- ❌ Overcorrecting one wrong claim with a symmetric wrong claim (e.g. "blocked on creds" → "creds ARE in .env" as a blanket, when the truth is "some creds are present, some are not")

**The compounding lesson:** "Zero-trust" in MEMORY means **I don't trust anything without verification, including my own previous-session output**. If I write "blocked on X" in heartbeat A and don't verify in heartbeat B, the claim is now a rumor carried forward by my own future selves. The only fix is verification on every turn.

**Source:** Andler correction in Discord webchat 2026-07-04 11:39 CST. He told me: "Social presence has the credentials. Your memory is wrong in that manner. Continue with the implementation." Followup precision: HEARTBEAT.md commit 0f89559 + workboard card 8e02c5d2 comment 17597b1d, 2026-07-04 11:55 CST.
