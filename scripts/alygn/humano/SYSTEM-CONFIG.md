# 🐦 Sistema de X/Twitter para Humano - Configuración Completa

**Fecha:** Marzo 5, 2026  
**Perfil:** @humano  
**Orquestador:** Grok CLI (on-demand) + Grok Chat website (aprobación humana) + Make.com (automatización programada)  
**X API layer:** Node.js `@xdevplatform/xdk` (repo independiente: `humano/`)  
**Owner:** [ALYGN_TEAM_MEMBER] — reemplaza el placeholder con el rol real en tu equipo (ej: "team member", "CEO", "researcher")

---

## 🎯 **OBJETIVO**

Sistema para generar y publicar contenido en X usando **dos capas**:

| Capa               | Herramienta                      | Propósito                        |
| ------------------ | -------------------------------- | -------------------------------- |
| **Humana**         | Grok Chat website (custom agent) | Brainstorm, revision, aprobación |
| **Automatización** | Grok CLI + Node.js cron          | Publicación, polling, replies    |

**Flujos cubiertos:**

- ✅ **Primera iteración manual** — Humano aprueba tono/vibra/palabras en Grok Chat → CLI publica.
- ✅ **Automatización posterior** — `node-cron` + Grok CLI ejecuta posts + replies cada 2-3h.
- ✅ **On-demand via CLI o Chat** — Humano pide posts en Grok Chat o directamente en CLI.
- ✅ **Grok** para investigación online (X search nativo de Grok) + generación de contenido.
- ✅ **Polling de menciones** — Node.js `userMentionTimeline` + Grok CLI genera reply si relevante.

**Nota:** Make.com fue removido del flujo principal. Ver [Apéndice: Make.com como alternativa MCP](#apéndice-makecom--mcp-como-flujo-alternativo) si se requiere webhook externo.

---

## 🏗️ **ARQUITECTURA - 3 FASES**

### **Capas del sistema**

```
┌─────────────────────────────────────────────────────────────┐
│                  CAPA HUMANA (Grok Chat website)            │
│  Custom Agent → Brainstorm → Genera 3 opciones → Aprueba    │
│  → Copia CLI command del output → Ejecuta en terminal       │
└──────────────────────────────┬──────────────────────────────┘
                               │ handoff: CLI command
                               ▼
┌─────────────────────────────────────────────────────────────┐
│              CAPA AUTOMATIZACIÓN (Grok CLI + Node.js)       │
│  node-cron → poll X API → Grok CLI genera → X API publica   │
│  Humano CLI "post about X" → Grok genera → X API publica    │
└─────────────────────────────────────────────────────────────┘
```

---

### **FASE 1: Primera Iteración (Grok Chat → CLI)**

```
┌─────────────────────────────────────────────────────────────┐
│ 1. [TEAM_MEMBER] abre Grok Chat con Custom Agent activo     │
│    Escribe: "Research and generate content about [topic]"   │
│    Agrega contexto: "mi ángulo es [ANGLE]"                  │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Grok Chat Agent ejecuta subagentes en secuencia          │
│    - Agent 1: X search nativo de Grok (tendencias + voces)  │
│    - Agent 2: Genera 3 opciones de contenido                │
│    - Agent 3: Valida tono Alygn governance                  │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. [TEAM_MEMBER] revisa las 3 opciones en Grok Chat         │
│    ✅ APRUEBA → Agent 2 produce "cliCommand" listo          │
│    ✏️ EDITA → Ajusta texto, pide regenerar opción           │
│    ❌ RECHAZA → Agent 1 busca otro ángulo                   │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. [TEAM_MEMBER] edita config/humano-template.json           │
│    config/humano-template.json                              │
│    (tone profile, word preferences, hashtag style)          │
│    → Este archivo viaja en el repo, no en el home dir       │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. [TEAM_MEMBER] ejecuta CLI command que Agent 2 generó     │
│    node lib/x-client.js --text "contenido aprobado"         │
│      --hashtags "#AIGovernance #[OTHER]"                     │
│    → @xdevplatform/xdk publica en @humano                   │
└─────────────────────────────────────────────────────────────┘
```

---

### **FASE 2: Automatización (Make.com o node-cron en servidor)**

```
┌─────────────────────────────────────────────────────────────┐
│ TRIGGER (cada 2-3h, 8 AM - 8 PM America/Costa_Rica)         │
│  Opción A — Make.com Schedule (recomendado, sin laptop)     │
│  Opción B — node cron.js en servidor (VPS/PM2)             │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. node post.js --agent-chain --post                        │
│    (Make.com llama endpoint HTTP; el servidor ejecuta       │
│     post.js automáticamente, sin laptop del humano)         │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. post.js ejecuta pipeline interno                         │
│    - getMentions + getFollowingPosts (@xdevplatform/xdk)    │
│    - Router: reply a mención | nuevo post governance        │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. lib/agent-chain.js genera contenido                      │
│    Agent 1 → Agent 2 → Agent 3 (xAI API via HTTP)          │
│    Usa config/humano-template.json (aprobado en Fase 1)     │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. lib/x-client.js publica en @humano                       │
│    postContent() / tweet() / reply()                        │
│    → Log en logs/YYYY-MM-DD/humano-automation.jsonl         │
└─────────────────────────────────────────────────────────────┘
```

---

### **FASE 3: On-Demand (Grok Chat o CLI)**

```
┌─────────────────────────────────────────────────────────────┐
│ VÍA GROK CHAT (human-friendly, visual):                     │
│  [TEAM_MEMBER] → "Post about [TOPIC] as @humano"            │
│  Agent 2 genera con config/humano-template.json             │
│  Muestra preview + cliCommand para ejecutar                 │
└────────────────────┬────────────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        │                         │
        ▼                         ▼
┌──────────────────┐   ┌─────────────────────────────────────┐
│  VÍA GROK CLI    │   │  Copia cliCommand del Chat y        │
│  (más rápido,   │   │  ejecuta en terminal:                │
│                  │   └──────────────┬──────────────────────┘
│  grok (en repo): │                  │
│  > post about    │                  │
│    [topic]       │                  │
└──────┬───────────┘                  │
       └────────────────┬─────────────┘
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ lib/x-client.js publica en @humano                          │
│ → Confirmación impresa en terminal                          │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔧 **COMPONENTES DETALLADOS**

### **1. Configuración de las dos capas**

#### **Capa 1: Grok Chat website (Human Layer)**

- Acceder a: [https://grok.com](https://grok.com)
- Usar el **Custom Agent** configurado en la sección siguiente ("Grok Chat Custom Agent").
- Esta capa no publica directamente en X. Su output clave es el `cliCommand` en el JSON de Agent 2 que el team member ejecuta en terminal.

#### **Capa 2: Grok CLI + Node.js + Make.com (Automation Layer)**

**Stack:**

- HTTP requests a `https://api.x.ai/v1/chat/completions` (modelo `grok-3`) — llamadas directas desde `lib/agent-chain.js`
- `@xdevplatform/xdk` — posting, replies, polling timelines (reemplaza `twitter-api-v2`)
- `node-cron` — scheduler local para entornos de servidor
- **Make.com** — scheduler externo recomendado (sin necesidad de tener el laptop abierto)
- Repo independiente: `humano/` con su propio `package.json`

**Credenciales `.env`** (en la raíz del repo `humano`):

```env
XAI_API_KEY=xai-...
X_CONSUMER_KEY=...
X_CONSUMER_SECRET=...
X_ACCESS_TOKEN=...
X_ACCESS_TOKEN_SECRET=...
X_ACCOUNT_HANDLE=humano
```

**Template file** en el repo (aprobado en Fase 1, editado una vez):

````json
// config/humano-template.json
{
  "toneProfile": {
    "formality": "institutional",
    "energy": "measured",
    "emojiUse": "none"
  },
  "wordPreferences": {
    "preferred": [
      "coordination",
      "governance",
      "infrastructure",
      "legitimacy",
      "accountability",
      "institutional"
    ],
    "avoided": [
      "regulate",
      "control",
      "ensure",
      "guarantee",
      "compliance",
      "enforce"
    ]
  },
  "hashtagStyle": {
    "count": 2,
    "alwaysInclude": ["#AIGovernance"],
    "pool": [
      "#AIGovernance",
      "#SmartCities",
      "#InstitutionalDesign",
      "#GovTech",
      "#AIPolicy"
    ]
  },
  "contentStructure": {
    "hookFirst": true,
    "ctaType": "thought-provoking",
    "signature": "more at @aialygn",
    "maxChars": 280
  }
}

---

### **2. Sub-Agentes Grok**

#### **¿Dónde van estos prompts?**

Los tres prompts de agentes tienen **dos destinos dependiendo de la fase**:

**En Grok Chat website (Fase 1 y 3):**
El system prompt del Custom Agent de la sección 3 ya incorpora la lógica de orquestación. Los agentes se ejecutan como **turns consecutivos dentro de la misma conversación**. Grok Chat internamente sigue el orden descrito en su system prompt (Agent 1 → Agent 2 → Agent 3). No es necesario pegar cada system prompt manualmente — el Custom Agent los aplica como instrucciones inline en cada turn.

**En Node.js automatización (Fase 2):**
Cada agente = una llamada separada `POST /v1/chat/completions` a la xAI API. El system prompt del agente se pasa en el campo `role: "system"`. El output de cada llamada se usa como input de la siguiente:

```javascript
// lib/agent-chain.js — cómo se encadenan los 3 agentes
async function runAgentChain({ topic, mode, approvedTemplate }) {
  // Agent 1: Research
  const agent1Result = await callGrokAPI({
    systemPrompt: AGENT_PROMPTS.agent1, // text from section 2 Agent 1 block
    userMessage: JSON.stringify({ topic, mode }),
  });

  // Agent 2: Content Generation
  const agent2Result = await callGrokAPI({
    systemPrompt: AGENT_PROMPTS.agent2, // text from section 2 Agent 2 block
    userMessage: JSON.stringify({
      researchData: agent1Result,
      approvedTemplate,
      mode,
    }),
  });

  // Agent 3: Tone Validation
  const agent3Result = await callGrokAPI({
    systemPrompt: AGENT_PROMPTS.agent3, // text from section 2 Agent 3 block
    userMessage: JSON.stringify({ agent2Output: agent2Result }),
  });

  return { agent1Result, agent2Result, agent3Result };
}
````

**Dónde están los textos de los prompts en el codebase:**

- Guardados como strings en `lib/agent-prompts.js` (ya existe en el repo)
- O directamente en `config.grok.agentPrompts` dentro de `projects/humano.json`
- `post.js` los orquesta via `lib/agent-chain.js` para el caso de Agent 2 (pipeline completo)

---

---

#### **Agent 1: X Discovery & Research Agent**

**Cuándo se usa:**

- `first-time`: Fase 1 — 3 rondas de búsqueda (topic general + X discourse + Alygn angle)
- `automated`: Fase 2 — 1 búsqueda focada (nuevas menciones + posts de cuentas seguidas)

**System prompt:**

```
You are the X Discovery & Research Agent for @humano, [ALYGN_ROLE] at Alygn — an independent AI governance infrastructure initiative focused on institutional coordination for municipalities and public sector entities.

MODE: {{mode}}  (values: "first-time" | "automated")

ALYGN CONTEXT (always apply):
Alygn's positioning is governance-as-infrastructure, not technology or consulting.
Key themes: coordination without centralization, institutional legitimacy, accountability without enforcement, AI governance for municipalities.
Approved framing: "supports coordination", "enables accountability", "governance infrastructure"
Forbidden framing: "regulates", "controls", "ensures compliance", "AI tool", "consulting service"

---

IF mode = "first-time":
TASK: Research topic "{{topic}}" in three rounds.

Round 1 — General landscape (use Grok web search):
- What is the current state of {{topic}} globally? (2025-2026 only)
- What are the 3 most cited challenges?
- What institutional actors are leading discourse?

Round 2 — X/Twitter discourse (use Grok's X search):
- Search recent posts about {{topic}} on X
- Find trending hashtags related to {{topic}} (last 7 days)
- Identify 3-5 accounts actively posting on this topic that @humano follows or should engage

Round 3 — Alygn governance angle:
- How does this topic intersect with AI governance for municipalities?
- What coordination failure or institutional gap is visible in the research?
- What unique perspective can @humano offer that is NOT already common in the discourse?

---

IF mode = "automated":
TASK: Quick discovery cycle for @humano cron.

1. Use Grok's X search to find:
   - New mentions of @humano (last 3 hours)
   - New posts from accounts @humano follows (last 3 hours) — search: from:{{followingList}}
   - Any trending topic in {{governanceTopics}} on X right now

2. For each item found, classify:
   - type: "mention" | "following_post" | "trending"
   - relevantToAlygn: true/false (governance, coordination, AI policy, municipalities)
   - urgency: "reply_now" | "reply_later" | "ignore"

---

OUTPUT JSON (both modes):
{
  "mode": "first-time" | "automated",
  "topic": "...",
  "governanceAngle": "One sentence: the specific coordination/legitimacy/accountability gap this topic reveals",
  "keyFindings": ["finding 1 (cite source)", "finding 2", "finding 3"],
  "recentNews": [
    { "title": "...", "source": "...", "date": "YYYY-MM-DD", "url": "..." }
  ],
  "xDiscovery": {
    "mentions": [{ "tweetId": "...", "author": "@...", "text": "...", "action": "reply_now|ignore" }],
    "followingPosts": [{ "tweetId": "...", "author": "@...", "text": "...", "relevantToAlygn": true }],
    "trendingHashtags": ["#Tag1", "#Tag2"],
    "keyAccounts": ["@account1", "@account2"]
  },
  "handoffToAgent2": {
    "suggestedAngle": "...",
    "contextSummary": "2-3 sentences max that Agent 2 should use as grounding"
  }
}

RULES:
- Use ONLY 2025-2026 data. Flag anything older as stale.
- In first-time mode: complete all 3 rounds before outputting JSON.
- In automated mode: if nothing relevant found, set all arrays empty and add note "no_action_needed".
- Never invent tweets or sources. If search returns nothing, say so explicitly.
- The governanceAngle field must reflect Alygn's framing — not generic AI commentary.
```

---

#### **Agent 2: Content Generation Agent**

**Cuándo se usa:**

- `first-time`: Genera 3 opciones. Output incluye `cliCommand` para la opción aprobada.
- `automated`: Genera 1 pieza usando template aprobado. Output incluye `cliCommand` listo.
- `on-demand`: Genera 1 pieza desde input directo del humano. Output incluye `cliCommand`.

**System prompt:**

```
You are the Content Generation Agent for @humano, [ALYGN_ROLE] at Alygn.

MODE: {{mode}}  (values: "first-time" | "automated" | "on-demand")

RESEARCH INPUT:
{{agent1Output.handoffToAgent2}}

APPROVED TEMPLATE (load from alygn-twitter-template.json if exists):
{{approvedTemplate}}

ALYGN VOICE — ALWAYS APPLY:
- Institutional, restrained. Never promotional. Never sales-y.
- Governance-first: the story is always about coordination, legitimacy, infrastructure — not technology.
- Concrete > abstract. Reference REAL findings from Agent 1.
- End full posts (not replies) with: "more at @aialygn"
- Character limit: 280 per tweet.

VOCABULARY:
✅ Use: coordination, governance, infrastructure, legitimacy, accountability, institutional, municipal, public sector, frameworks, incentive alignment
❌ Avoid: regulate, control, enforce, ensure compliance, AI tool, consulting, platform, product, solution, disruptive

---

IF mode = "first-time":
Generate 3 distinct content options for Humano to choose from.
Each option must represent a DIFFERENT angle on the same research.
For each option, output all three content types (mainPost, thread, reply).

IF mode = "automated" OR "on-demand":
Generate 1 content piece using the approvedTemplate above.
Match tone profile, word preferences, hashtag style exactly.
For automated: context = Agent 1 discovery output.
For on-demand: context = Humano's request "{{humanRequest}}".

---

OUTPUT JSON:
{
  "mode": "...",
  "options": [
    {
      "optionNumber": 1,
      "angle": "One sentence describing this option's unique perspective",
      "mainPost": {
        "text": "Full post text including signature and hashtags",
        "hashtags": ["#Tag1", "#Tag2"],
        "characterCount": 0,
        "researchGrounding": "Which specific finding from Agent 1 this references"
      },
      "thread": {
        "tweets": ["Tweet 1/N text", "Tweet 2/N text", "Tweet 3/N — more at @aialygn #Tag1 #Tag2"]
      },
      "reply": {
        "targetTweetId": "{{tweetId if available, else null}}",
        "targetAuthor": "@...",
        "text": "Reply text (1-2 sentences, governance angle, no signature required)"
      },
      "cliCommand": "node lib/x-client.js --text \"<post text escaped>\" --hashtags \"#Tag1 #Tag2\""
    }
  ],
  "humanInstructions": "Reply with: APPROVE 1, APPROVE 2, APPROVE 3, EDIT [number] [feedback], or REJECT"
}

RULES:
- In first-time mode: options must be meaningfully different, not just paraphrases.
- cliCommand must be a valid shell command using `node lib/x-client.js --text "..." --hashtags "..."` pattern (internal to the humano repo).
- Escape double quotes in cliCommand text with backslash.
- characterCount must be accurate (count including signature and hashtags).
- Never exceed 280 characters in mainPost.text.
- Thread tweets are each ≤280 chars individually.
- If approvedTemplate not provided (first session), infer tone from Alygn context above.
```

---

#### **Agent 3: Tone Validation Agent**

**Cuándo se usa:** Siempre, después de Agent 2. Actúa como gate antes de mostrar opciones al humano (Fase 1) o antes de publicar (Fase 2, 3).

**System prompt:**

```
You are the Tone Validation Agent for @humano (Alygn [ALYGN_ROLE]).
You review content BEFORE it reaches the human or gets published.

ALYGN GOVERNANCE CHECKLIST — apply to EACH content option:

1. TONE CHECK
   Pass: Institutional, measured, restrained.
   Fail: Promotional, sales-y, hype-y, overly casual, or uses exclamation marks unnecessarily.
   Quote exact text if failing.

2. AUTHORITY/CLAIMS CHECK
   Pass: Observational statements, questions, invitations to think.
   Fail: Any promise, guarantee, authority claim, or implied enforcement.
   Examples of FAIL: "Alygn ensures...", "will guarantee...", "proven to...", "only solution..."
   Quote exact text if failing.

3. GOVERNANCE POSITIONING CHECK
   Pass: Governance as infrastructure, coordination, legitimacy, accountability.
   Fail: Frames Alygn or @humano as a technology provider, consultant, regulator, or product vendor.
   ✅ "Supports coordination" — PASS
   ✅ "Enables accountability frameworks" — PASS
   ❌ "Ensures compliance" — FAIL
   ❌ "Regulates AI systems" — FAIL
   ❌ "AI platform for municipalities" — FAIL
   Quote exact text if failing.

4. VOCABULARY CHECK
   Scan for avoided words: regulate, control, enforce, ensure compliance, AI tool, consulting, platform, product, solution, disruptive
   Quote each instance found.

5. DATA FRESHNESS CHECK
   Pass: All referenced events or statistics are from 2025 or 2026.
   Fail: Any reference to pre-2025 data presented as current.
   Note: historical context is OK if clearly labeled as historical.

6. RESEARCH GROUNDING CHECK
   Pass: Post references at least one specific finding from Agent 1 output.
   Fail: Content is generic, could apply to any AI topic without the Agent 1 research.

7. HANDOFF CLARITY CHECK
   Pass: cliCommand field is present and syntactically valid.
   Fail: cliCommand is missing, empty, or would fail as a shell command.

---

INPUT:
Agent 2 output JSON (all options)

OUTPUT JSON:
{
  "validationResults": [
    {
      "optionNumber": 1,
      "checks": {
        "tone": { "pass": true, "issue": null },
        "authorityClaims": { "pass": true, "issue": null },
        "governancePositioning": { "pass": true, "issue": null },
        "vocabulary": { "pass": true, "flaggedWords": [] },
        "dataFreshness": { "pass": true, "issue": null },
        "researchGrounding": { "pass": true, "issue": null },
        "cliCommandValid": { "pass": true, "issue": null }
      },
      "overallPass": true,
      "specificFixes": []
    }
  ],
  "approvedOptions": [1, 2],
  "rejectedOptions": [3],
  "handoffDecision": "show_to_human" | "auto_post" | "regenerate",
  "regenerateReason": "Only if handoffDecision = regenerate — specific instruction for Agent 2"
}

RULES:
- overallPass is true ONLY if ALL 7 checks pass for that option.
- Quote exact text from the content for every failing check.
- For automated/on-demand modes: if 0 options pass, set handoffDecision = "regenerate" with specific regenerateReason.
- For first-time mode: always set handoffDecision = "show_to_human" (human makes final call even on imperfect options, but mark what needs fixing).
- Be surgical. Don't flag things that are fine. Don't be overly restrictive on tone — institutional does not mean boring.
```

---

### **3. Grok Chat Custom Agent — System Prompt**

Crear un nuevo Custom Agent en [https://grok.com](https://grok.com) con el nombre **"@humano Twitter Agent"** y pegar el siguiente system prompt. Reemplaza los placeholders en brackets `[...]` antes de guardar:

```
You are @humano's AI governance content assistant for X/Twitter.

You help [TEAM_MEMBER] ([ALYGN_ROLE] at Alygn) with:
1. Researching topics using your X search capabilities
2. Generating content options for @humano's X account
3. Validating tone against Alygn's governance positioning
4. Producing ready-to-run CLI commands for publishing

You orchestrate three sub-agents in sequence:
- Agent 1: X Discovery & Research
- Agent 2: Content Generation
- Agent 3: Tone Validation

ALYGN CONTEXT:
Alygn is an independent institutional framework for AI governance — not a technology product, not a consultant, not a regulator. The positioning is governance-as-infrastructure: coordination without centralization, accountability without enforcement, legitimacy as the infrastructure that makes AI governance work.

@humano is Alygn's [ALYGN_ROLE] writing from a [PERSPECTIVE] perspective. Posts are institutional in tone, grounded in real research, thought-provoking rather than promotional.

> **Personalización:** Reemplaza `[ALYGN_ROLE]` con el rol real (ej: "team member", "researcher") y `[PERSPECTIVE]` con el ángulo (ej: "R&D", "governance strategy", "field operations").

INTERACTION MODES:

Mode A — "Research and generate content about [topic]":
1. Run Agent 1 (first-time mode) → research topic + X discovery
2. Run Agent 2 (first-time mode) → generate 3 options with cliCommands
3. Run Agent 3 → validate all options
4. Show Humano only the options that passed validation (flag issues on others)
5. Wait for: APPROVE 1/2/3, EDIT [number] [feedback], or REJECT
6. On approval: output the cliCommand for the approved option in a copyable code block

Mode B — "Post about [topic]" (on-demand, approved template exists):
1. Run Agent 1 (automated mode) → quick X search for context
2. Run Agent 2 (on-demand mode) with approvedTemplate → 1 content piece
3. Run Agent 3 → validate
4. Show preview and cliCommand

Mode C — "Check mentions and engage":
1. Run Agent 1 (automated mode) → find mentions + following posts
2. For each relevant item: Run Agent 2 (automated, reply type) + Agent 3
3. List proposed replies with cliCommands
4. Wait for human confirmation OR auto-post if in autonomous mode

ALWAYS:
- Show Agent 1 governanceAngle before generating content — ask if angle is right
- Include character count next to each post draft
- Put cliCommand in a fenced code block so it's easy to copy
- If Agent 3 rejects all options, explain exactly why and ask whether to regenerate or adjust angle
- Never publish directly — always hand off via cliCommand

NEVER:
- Make up tweets, accounts, or sources
- Use avoided vocabulary (regulate, control, ensure compliance, etc.)
- Skip tone validation before showing content to Humano
```

---

### **4. Grok CLI — Instalación y Setup**

Grok CLI (`@vibe-kit/grok-cli`) es un asistente de terminal conversacional impulsado por Grok 3/4. Permite hablar con Grok directamente desde la terminal — puede ver archivos, ejecutar comandos, y generar texto — todo en lenguaje natural.

**Repo oficial:** [github.com/superagent-ai/grok-cli](https://github.com/superagent-ai/grok-cli)  
**Web:** [grokcli.io](https://grokcli.io)

> **Clarificación arquitectural:** Grok CLI es la capa **humana on-demand** (Fase 1 y 3). La automatización de Fase 2 NO usa Grok CLI — `post.js` llama directamente a la xAI API via HTTP y es lanzado por Make.com o node-cron desde el servidor. El team member nunca necesita tener el cron corriendo en su laptop.

---

#### **Instalación**

```bash
# Opción A — Bun (recomendado)
bun add -g @vibe-kit/grok-cli

# Opción B — npm (fallback)
npm install -g @vibe-kit/grok-cli

# Verificar instalación
grok --version
```

---

#### **Configurar API Key**

Obtén tu `GROK_API_KEY` de [https://console.x.ai](https://console.x.ai).

**Método 1 — User settings file (persistente, recomendado):**

```bash
mkdir -p $HOME/.grok
cat > $HOME/.grok/user-settings.json << 'EOF'
{
  "apiKey": "xai-TU_API_KEY_AQUI",
  "baseURL": "https://api.x.ai/v1",
  "defaultModel": "grok-3-fast",
  "models": [
    "grok-3-fast",
    "grok-3-latest",
    "grok-4-latest"
  ]
}
EOF
```

**Método 2 — Variable de entorno:**

```bash
export GROK_API_KEY="xai-TU_API_KEY_AQUI"
# Agregar al $HOME/.bashrc o $HOME/.zshrc para persistencia
```

**Método 3 — Via .env del repo (auto-detect):**

Si el `.env` del repo tiene `GROK_API_KEY=xai-...`, la CLI lo detecta automáticamente cuando se ejecuta desde esa carpeta.

---

#### **Configurar el contexto @humano con `.grok/GROK.md`**

Esta es la parte clave: el archivo `.grok/GROK.md` dentro del repo es el **system prompt global para toda sesión** de Grok CLI cuando la abres desde esta carpeta. Poner aquí el perfil de @humano hace que Grok "sepa automáticamente" que está trabajando en el contexto de esta cuenta — sin que el team member tenga que repetirlo cada vez.

Crear el archivo:

```bash
mkdir -p .grok
```

Contenido de `.grok/GROK.md`:

```markdown
# @humano — Alygn Twitter Context

You are assisting [TEAM_MEMBER] ([ALYGN_ROLE] at Alygn) with content for the @humano X/Twitter account.

## Account Identity

- Handle: @humano
- Voice: [VOICE_DESCRIPTION] — e.g., "institutional, measured, non-promotional"
- Purpose: AI governance infrastructure — positioning governance as coordination infrastructure, not technology

## Post a single tweet (on-demand)

Run: node lib/x-client.js --text "[TEXT]" --hashtags "[#TAGS]"

## Post a thread

Run: node lib/x-client.js --thread '[{"text":"Tweet 1"},{"text":"Tweet 2"}]'

## Reply to a tweet

Run: node lib/x-client.js --reply-to [TWEET_ID] --text "[TEXT]"

## Full automation cycle (one cycle, dry-run)

Run: node post.js --project=humano --agent-chain --dry-run

## Rules

- Always end posts with: more at @aialygn
- Max 280 characters per tweet
- USE: coordination, governance, infrastructure, legitimacy, accountability
- AVOID: regulate, control, ensure compliance, AI tool, consulting, product
- Validate through Agent 3 tone checks before posting
- Always add --dry-run first to review output before publishing
```

> **Nota:** El `.grok/GROK.md` es project-level — solo aplica cuando abres `grok` desde esta carpeta. Puedes tener un `$HOME/.grok/GROK.md` global diferente para otros proyectos.

---

#### **Uso interactivo (Fase 1 / Fase 3 on-demand)**

```bash
# Desde la carpeta del repo (carga .grok/GROK.md automáticamente)
cd humano
grok
```

Grok inicia en modo interactivo con el contexto de @humano ya cargado:

```
╔═══════════════════════════════╗
║         G R O K   C L I       ║
╚═══════════════════════════════╝
💬 Welcome! Context: @humano (Alygn governance). How can I help?

> Generate a tweet about coordination failure in municipal AI governance.
```

Grok genera el contenido y puede ejecutar directamente:

```
> node lib/x-client.js --text "..." --dry-run
```

El team member revisa el output y quita `--dry-run` para publicar.

---

#### **Modo headless (scripting)**

Para usar Grok CLI en scripts o pipes sin interacción:

```bash
# Generar contenido sin abrir sesión interactiva
grok --prompt "Write a tweet about AI governance legitimacy for @humano. Institutional tone, max 230 chars, end with: more at @aialygn"

# Encadenar con el post
CONTENT=$(grok --prompt "Write a tweet about coordination failure as AI governance infra risk, max 230 chars, end: more at @aialygn")
echo "Draft: $CONTENT"
node lib/x-client.js --text "$CONTENT" --dry-run
```

---

#### **Importante: Grok CLI NO maneja el cron de Fase 2**

La automatización de Fase 2 **no depende de Grok CLI**:

|                     | Grok CLI                   | post.js (Fase 2)                   |
| ------------------- | -------------------------- | ---------------------------------- |
| **Cuándo**          | Sesión humana on-demand    | Trigger automático (Make.com/cron) |
| **Quién lo lanza**  | Team member desde terminal | Make.com o PM2 en servidor         |
| **Llama a Grok**    | Vía proceso interactivo    | Vía HTTP directo a `api.x.ai/v1`   |
| **Requiere laptop** | Sí                         | No (corre en servidor)             |

`post.js` y `lib/agent-chain.js` usan `XAI_API_KEY` del `.env` para llamar a xAI API directamente — no necesitan que Grok CLI esté instalado. Ver **Sección 7** para la configuración de Make.com.

---

#### **Troubleshooting**

| Error                       | Causa                                          | Solución                                |
| --------------------------- | ---------------------------------------------- | --------------------------------------- |
| `command not found: grok`   | CLI no instalada o no en PATH                  | `bun add -g @vibe-kit/grok-cli`         |
| `Error: unauthorized`       | API key incorrecta o no configurada            | Revisar `$HOME/.grok/user-settings.json`    |
| `.grok/GROK.md` no se carga | Ejecutando `grok` desde carpeta incorrecta     | `cd humano && grok`                     |
| Output en idioma incorrecto | `.grok/GROK.md` no tiene instrucción de idioma | Agregar "Respond in Spanish" al GROK.md |
| Timeout en headless mode    | Prompt muy complejo                            | Agregar `--max-tool-rounds 20`          |

---

### **5. CLI Commands Reference**

Comandos disponibles desde la raíz del repo `humano/`. Todos los paths son relativos a esa carpeta.

#### **On-demand posting via `lib/x-client.js` (Fase 1 / Fase 3)**

Estos comandos son los que el team member corre directamente (o los que Grok Chat/CLI genera como `cliCommand`):

```bash
# Post a main tweet
node lib/x-client.js \
  --text "Legitimacy isn't a feature you add—it's infrastructure you build. AI governance without institutional legitimacy is just tech solutionism. more at @aialygn" \
  --hashtags "#AIGovernance #InstitutionalDesign"

# Post a thread
node lib/x-client.js \
  --thread '[{"text":"Tweet 1/3..."},{"text":"Tweet 2/3..."},{"text":"Tweet 3/3 more at @aialygn #AIGovernance"}]'

# Reply to a specific tweet
node lib/x-client.js \
  --reply-to 1234567890 \
  --text "Coordination across institutions is the missing layer. more at @aialygn"

# Post with image
node lib/x-client.js \
  --text "Governance data 2026" \
  --media=/path/to/image.png

# Dry run (preview without posting)
node lib/x-client.js --text "..." --dry-run
```

#### **Content generation via `post.js` (Fase 2 / Fase 3 automated)**

`post.js` es el driver completo — orquesta los 3 agentes Grok y publica. Es lo que Make.com o node-cron llaman:

```bash
# Full 3-agent chain — generate + validate + post
node post.js --project=humano --topic="AI governance legitimacy" --agent-chain --post

# Single Grok call (más rápido, sin 3-agent chain)
node post.js --project=humano --topic="Smart city transparency" --post

# Con trends pre-descubiertas
node post.js --project=humano --trends=/tmp/trends.json --post

# Dry run (genera pero no publica)
node post.js --project=humano --topic="AI governance" --agent-chain --dry-run

# Mock mode (sin API calls, para testing)
node post.js --project=humano --topic="test" --mock --post
```

#### **Discover trends via `trend-discovery.js`**

```bash
# Buscar trending governance topics en X
node trend-discovery.js --project=humano --output=/tmp/trends.json

# Query personalizado
node trend-discovery.js --project=humano --query="AI regulation LATAM" --output=/tmp/trends.json

# Mock mode
node trend-discovery.js --project=humano --mock
```

#### **Cron local (testing / servidor)**

```bash
# Test single cycle (dry run)
node cron.js --project=humano --once --dry-run

# Iniciar scheduler (producción — corre en servidor, no laptop)
node cron.js --project=humano

# Via pm2 (servidor)
pm2 start cron.js --name humano-cron -- --project=humano
pm2 logs humano-cron
```

> **Recordatorio:** Para producción, usa Make.com como scheduler (ver **Sección 7**) en lugar de cron local. El team member no necesita tener el laptop abierto.

---

### **6. Node.js Automation Layer**

Este repo es **independiente** — tiene su propio `package.json` y no depende de rutas externas. Todo funciona desde la raíz del repo `humano/`.

#### **Project config: `projects/humano.json`**

`loadProject('humano')` lee este archivo. `post.js` lo usa para obtener el `systemPrompt` (Agent 2 single-call) y `agentPrompts` (pipeline completo via `lib/agent-chain.js`).

```json
{
  "name": "humano",
  "description": "@humano — Alygn [ALYGN_ROLE] account",
  "twitter": {
    "handle": "@humano",
    "consumerKey": "${X_CONSUMER_KEY}",
    "consumerSecret": "${X_CONSUMER_SECRET}",
    "accessToken": "${X_ACCESS_TOKEN}",
    "accessSecret": "${X_ACCESS_TOKEN_SECRET}",
    "voice": "institutional",
    "topics": [
      "AI Governance",
      "Institutional Coordination",
      "Municipal AI Policy",
      "Legitimacy as Infrastructure",
      "Accountability without Enforcement"
    ],
    "hashtags": [
      "#AIGovernance",
      "#SmartCities",
      "#InstitutionalDesign",
      "#GovTech",
      "#AIPolicy"
    ],
    "signature": "more at @aialygn",
    "signaturePosition": "end",
    "maxTweetsPerDay": 4,
    "maxRepliesPerDay": 8,
    "maxQuotesPerDay": 2
  },
  "grok": {
    "model": "grok-3",
    "temperature": 0.5,
    "maxTokens": 1500,
    "systemPrompt": "You are writing for @humano, [ALYGN_ROLE] at Alygn — an independent AI governance infrastructure initiative. Focus on governance legitimacy, coordination without centralization, and institutional accountability for municipalities and public sector. Tone: [TONE_DESCRIPTION]. End every post with: more at @aialygn. Vocabulary to USE: coordination, governance, infrastructure, legitimacy, accountability, institutional. Vocabulary to AVOID: regulate, control, ensure compliance, AI tool, consulting, platform, product.",
    "agentPrompts": {
      "file": "lib/agent-prompts.js",
      "note": "Full 3-agent chain: AGENT_PROMPTS from lib/agent-prompts.js, orchestrated by lib/agent-chain.js"
    }
  },
  "automation": {
    "postsPerDay": 2,
    "repliesPerDay": 5,
    "quotesPerDay": 1,
    "timezone": "America/Costa_Rica",
    "postingHours": { "start": 8, "end": 20 },
    "cronSchedule": "0 */3 8-20 * * *",
    "templateFile": "config/humano-template.json",
    "followingListFile": "config/humano-following.txt"
  },
  "discord": {
    "reportChannel": "[DISCORD_CHANNEL_ID]",
    "notifyOnComplete": true
  }
}
```

> **Personalización:** Reemplaza todos los valores entre `[...]` antes de hacer commit. El `systemPrompt` de `grok.systemPrompt` es el perfil de voz de @humano — ajústalo al estilo que el team member aprobó en Fase 1.

**Relación entre config y agent prompts:**

```
projects/humano.json
  └── grok.systemPrompt  ←  Agent 2 single-call (voz aprobada)
  └── grok.agentPrompts  ←  Puntero a lib/agent-prompts.js

lib/agent-prompts.js
  └── AGENT_PROMPTS.agent1  ←  Full Agent 1 system prompt (de Sección 2)
  └── AGENT_PROMPTS.agent2  ←  Full Agent 2 system prompt (de Sección 2)
  └── AGENT_PROMPTS.agent3  ←  Full Agent 3 system prompt (de Sección 2)
```

#### **Cron local: `cron.js`**

El archivo `cron.js` del repo es el scheduler local. Úsalo en servidor (VPS) o como fallback si no usas Make.com:

```javascript
// cron.js usa: @xdevplatform/xdk, lib/agent-chain.js, lib/x-client.js
// Corre cada 3h entre 8AM-8PM Costa Rica
// Imports: import { postContent } from './post.js'
//          import { getMentions, getFollowingPosts } from './lib/x-client.js'

// Iniciar en servidor:
// node cron.js --project=humano
// pm2 start cron.js --name humano-cron -- --project=humano
```

En producción **se recomienda Make.com** (Sección 7) en lugar del cron local — así el team member no necesita servidor propio ni laptop conectado.

#### **Warning: X Developer account permissions**

- La app X de `@humano` debe tener permisos **Read + Write** en el X Developer Portal.
- OAuth 1.0a User Context es requerido para posting. Bearer Token solo es read-only.
- Nunca commitear `X_ACCESS_TOKEN` o `X_ACCESS_TOKEN_SECRET` — mantenerlos en `.env` (en `.gitignore`).

---

---

### **7. Make.com como Scheduler (Recomendado para Fase 2)**

Make.com reemplaza el cron local — el team member no necesita tener el laptop abierto ni mantener un servidor propio para la automatización de @humano.

**Ventaja clave:** Make.com se encarga del timing (cada 3h, solo en horario activo). El servidor solo necesita estar disponible para recibir el webhook y ejecutar el script.

---

#### **Opción A — Make.com + HTTP Webhook (servidor con endpoint)**

Esta es la arquitectura más limpia si ya tienes un servidor (VPS, Railway, Render, etc.):

**Setup en el servidor:**

```javascript
// webhook-handler.js — tiny Express endpoint
import express from "express";
import { execFileSync } from "child_process";

const app = express();
app.use(express.json());

// Proteger con secret token
const WEBHOOK_SECRET = process.env.MAKE_WEBHOOK_SECRET;

app.post("/humano/run", (req, res) => {
  if (req.headers["x-webhook-secret"] !== WEBHOOK_SECRET) {
    return res.status(403).json({ error: "Unauthorized" });
  }
  try {
    const result = execFileSync(
      "node",
      ["post.js", "--project=humano", "--agent-chain", "--post"],
      {
        cwd: "/path/to/humano",
        timeout: 120000,
        encoding: "utf8",
      },
    );
    res.json({ success: true, output: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(process.env.PORT || 3001, () => {
  console.log("Webhook handler running");
});
```

**Setup en Make.com:**

1. Crear nuevo **Scenario**
2. Módulo 1: **Schedule** → cada 3 horas
3. Filtro de horario activo:
   ```
   Condición: hora actual >= 8 AND hora actual < 20 (zona: America/Costa_Rica)
   ```
4. Módulo 2: **HTTP → Make a request**
   ```
   URL: https://yourserver.com/humano/run
   Method: POST
   Headers: x-webhook-secret: [MAKE_WEBHOOK_SECRET]
   ```
5. Módulo 3 (opcional): **Discord → Send message** para notificar el resultado

---

#### **Opción B — Make.com + SSH (sin servidor dedicado)**

Si no quieres exponer un endpoint HTTP, Make.com puede conectarse por SSH directamente:

1. Instalar el módulo **SSH** en Make.com
2. Configurar conexión SSH a tu VPS
3. Módulo **SSH → Execute command**:
   ```bash
   cd /path/to/humano && node post.js --project=humano --agent-chain --post >> logs/cron.log 2>&1
   ```

---

#### **Opción C — Make.com + Self-hosted server (sin VPS)**

Si el team member tiene una máquina que siempre está encendida (NAS, Mac mini, etc.):

1. Exponer el webhook handler con **ngrok** o **Cloudflare Tunnel**:
   ```bash
   cloudflared tunnel --url http://localhost:3001
   ```
2. Usar la URL generada en el módulo HTTP de Make.com

---

#### **Variables de Make.com que configurar**

| Variable              | Valor                               |
| --------------------- | ----------------------------------- |
| `WEBHOOK_URL`         | `https://yourserver.com/humano/run` |
| `MAKE_WEBHOOK_SECRET` | Un string random seguro             |
| Timezone              | `America/Costa_Rica`                |
| Schedule              | Every 3 hours                       |
| Time filter           | 08:00 – 20:00                       |

---

#### **Testing del flujo Make.com**

```bash
# 1. Iniciar el webhook handler
node webhook-handler.js

# 2. Test manual del endpoint (simula Make.com)
curl -X POST http://localhost:3001/humano/run \
  -H "x-webhook-secret: [MAKE_WEBHOOK_SECRET]" \
  -H "Content-Type: application/json"

# 3. Verificar que post.js corrió con --dry-run primero
# (cambiar el post.js call en webhook-handler.js a --dry-run para el primer test)
```

---

## 📋 **CONFIGURACIÓN PASO A PASO**

### **Paso 1: Credenciales y `.env`**

```bash
cd humano
cp .env-sample .env
# Editar .env con las credenciales reales
```

```env
XAI_API_KEY=xai-...
X_CONSUMER_KEY=...
X_CONSUMER_SECRET=...
X_ACCESS_TOKEN=...
X_ACCESS_TOKEN_SECRET=...
X_ACCOUNT_HANDLE=humano
```

**Verificar en el X Developer Portal:** La app de `@humano` debe tener permisos **Read + Write** habilitados.

### **Paso 2: Instalar dependencias del repo**

```bash
cd humano
bun install
# Instala: @xdevplatform/xdk, dotenv, node-cron (ver package.json)
```

### **Paso 3: Instalar y configurar Grok CLI**

Ver instrucciones completas en **Sección 4**. Resumen rápido:

```bash
# Instalar
bun add -g @vibe-kit/grok-cli

# Configurar API key
mkdir -p $HOME/.grok
echo '{"apiKey":"xai-TU_KEY","defaultModel":"grok-3-fast"}' > $HOME/.grok/user-settings.json

# Test
cd humano
grok  # debe abrir sesión con contexto @humano (cargado de .grok/GROK.md)
```

### **Paso 4: Configurar `.grok/GROK.md` (contexto del repo)**

```bash
# El archivo .grok/GROK.md ya existe en el repo con el template de @humano
# Editar los placeholders:
#   [TEAM_MEMBER] → nombre del team member
#   [ALYGN_ROLE]  → rol en Alygn (ej: "team member")
#   [VOICE_DESCRIPTION] → descripción del tono aprobado
nano .grok/GROK.md
```

### **Paso 5: Crear Custom Agent en Grok Chat**

1. Ir a [https://grok.com](https://grok.com)
2. Crear nuevo Custom Agent llamado **"@humano Twitter Agent"**
3. Pegar el system prompt de la **Sección 3** (reemplazar placeholders `[...]` primero)
4. Guardar el agente

### **Paso 6: Primera Iteración (Fase 1)**

1. Abrir Grok Chat con el Custom Agent activo
2. Escribir: `Research and generate content about AI governance for municipalities`
3. Agregar contexto personal: `"mi ángulo es [ANGLE]"`
4. Revisar las opciones generadas (solo las que pasaron Agent 3)
5. Responder: `APPROVE 2` (o el número elegido)
6. El Agent 2 genera un `cliCommand` listo — ejecutarlo:

   ```bash
   # El cliCommand tiene este formato:
   node lib/x-client.js --text "..." --hashtags "#AIGovernance #[OTHER]"
   ```

7. Si el post se ve bien, actualizar `config/humano-template.json` con el tono aprobado

### **Paso 7: Configurar automatización de Fase 2**

**Opción A (recomendada): Make.com**

Ver **Sección 7** para el setup completo. En resumen:

- Crear scenario en Make.com con Schedule (cada 3h) → HTTP POST al endpoint del servidor
- El servidor ejecuta `node post.js --project=humano --agent-chain --post`

**Opción B: Cron en servidor**

```bash
# Instalar PM2
npm install -g pm2

# Iniciar el cron (en el servidor, no en el laptop)
cd humano
pm2 start cron.js --name humano-cron -- --project=humano
pm2 save
pm2 startup  # para que arranque automáticamente al reiniciar
```

### **Paso 8: Testing por fase**

**Test Fase 1:**

1. Abrir Grok Chat Agent → escribir tema
2. Verificar que Agent 1 muestra `governanceAngle` correcto
3. Verificar que Agent 2 produce 3 opciones distintas con `cliCommand`
4. Verificar que Agent 3 flaggea problemas de tono
5. Aprobar → ejecutar cliCommand con `--dry-run` primero, luego sin él

**Test Fase 2:**

1. `node cron.js --project=humano --once --dry-run` — ciclo completo en seco
2. Verificar que replies y posts se generan correctamente
3. Test del endpoint Make.com: `curl -X POST http://localhost:3001/humano/run`
4. En Make.com: correr el scenario manualmente una vez antes de activar el schedule

**Test Grok CLI (Fase 3):**

1. `cd humano && grok`
2. Verificar que `.grok/GROK.md` se cargó (Grok debe "saber" que es @humano)
3. Pedir: `"Write a test tweet for @humano"` → revisar que respeta el tono/vocab
4. Con el `cliCommand` generado: ejecutar con `--dry-run`

---

## 🎯 **EJEMPLO DE FLUJO COMPLETO**

### **FASE 1: Primera Iteración**

**Humano en Grok Chat:**

```
Research and generate content about AI governance for municipalities.
My angle: this is about coordination failure, not technology failure.
```

**Agent 1 output (key fields):**

```json
{
  "governanceAngle": "Municipalities adopting AI face coordination failure across departments — the missing layer is not better AI, but institutional legitimacy that makes governance decisions trusted by all actors.",
  "keyFindings": [
    "73% of surveyed municipalities report AI adoption blocked by inter-departmental coordination failures (2026 OECD Digital Government Report)",
    "Only 12% of municipal AI initiatives include multi-stakeholder legitimacy frameworks",
    "Costa Rica, Colombia, and Mexico piloting voluntary coordination frameworks as of Q1 2026"
  ]
}
```

**Humano:** "Angle is right. Continue."

**Agent 2 output (Option 1):**

```json
{
  "optionNumber": 1,
  "angle": "Coordination failure as the real AI governance risk",
  "mainPost": {
    "text": "The hardest AI risks in cities aren't technical—they're institutional. 73% of municipalities report coordination failure, not technology failure, as the main blocker. Governance legitimacy is the infrastructure nobody is building. more at @aialygn",
    "hashtags": ["#AIGovernance", "#SmartCities"],
    "characterCount": 246
  },
  "cliCommand": "node lib/x-client.js --text \"The hardest AI risks in cities aren't technical—they're institutional. 73% of municipalities report coordination failure, not technology failure, as the main blocker. Governance legitimacy is the infrastructure nobody is building. more at @aialygn\" --hashtags \"#AIGovernance #SmartCities\""
}
```

**Agent 3:** ✅ Option 1 passes all 7 checks.

**Humano:** `APPROVE 1`

**Humano copies and runs:**

```bash
node lib/x-client.js --text "The hardest AI risks in cities aren't technical—they're institutional. 73% of municipalities report coordination failure, not technology failure, as the main blocker. Governance legitimacy is the infrastructure nobody is building. more at @aialygn" --hashtags "#AIGovernance #SmartCities"
# ✅ Posted to @humano
```

---

### **FASE 2: Cron Automático**

**Cron ejecuta (11:00 AM):**

1. `userMentionTimeline` → finds: @municipalityCR mentioned @humano
2. Agent 1 (automated) → classifies: `type: "mention"`, `relevantToAlygn: true`
3. Agent 2 (automated, reply) → generates:

   ```
   Great to see @municipalityCR leading on this.
   The coordination layer—not the tech layer—is what determines whether this actually works at scale. more at @aialygn
   ```

4. Agent 3 → ✅ passes
5. `v2.reply(text, tweetId)` → published
6. Log entry written to `/logs/2026-03-05/twitter-automation.md`

---

### **FASE 3: On-Demand via CLI**

```bash
node post.js \
  --profile humano \
  --topic "legitimacy is infrastructure for AI governance" \
  --mode on-demand \
  --post
```

```
[humano] Generating content...
[Agent 1] Searching X for recent discourse on legitimacy + AI governance...
[Agent 2] Generating with approved template...
[Agent 3] Validating... ✅ PASS

Draft:
"Legitimacy isn't a feature you add—it's infrastructure you build.
AI governance without institutional buy-in is just tech solutionism
in disguise. The hard work is coordination, not code. more at @aialygn"

Hashtags: #AIGovernance #InstitutionalDesign
Characters: 239

Posting... ✅ Posted to @humano
```

---

## ✅ **CHECKLIST PARA Humano**

### **Setup Inicial (Una vez):**

- [ ] Credenciales X API en `.env` con permisos Read + Write
- [ ] `cd humano && bun install` (instalar dependencias del proyecto)
- [ ] Grok CLI instalada: `npm install -g @xai/cli` (ver Sección 4)
- [ ] Grok CLI configurada: `grok config set api-key xai-...` + test con `grok "hello"`
- [ ] `projects/humano.json` creado y configurado
- [ ] Custom Agent creado en Grok Chat con system prompt completo (ver Sección 3)
- [ ] Test de conexión X API: `node scripts/utils/test-connections.js`

### **Fase 1 (Primera iteración de cada tema nuevo):**

- [ ] Abrir Grok Chat con Custom Agent activo
- [ ] Escribir tema + ángulo personal
- [ ] Verificar `governanceAngle` de Agent 1 antes de continuar
- [ ] Revisar 3 opciones (solo las que pasaron Agent 3)
- [ ] Aprobar opción → ejecutar `cliCommand` en terminal
- [ ] Guardar parámetros aprobados en `config/humano-template.json`

### **Fase 2 (Automatización):**

- [ ] Test dry-run del cron antes de activar en producción
- [ ] Activar cron via `pm2 start cron.js --name humano-cron`
- [ ] Revisar logs en `/logs/YYYY-MM-DD/twitter-automation.md` diariamente x2
- [ ] Revisar engagement al día siguiente — ajustar template si necesario
- [ ] Verificar que replies automáticos son relevantes (primeros 3 días: revisión manual)

### **Fase 3 (On-Demand):**

- [ ] Test `--dry-run` antes del primer uso en producción
- [ ] Confirmar que `config/humano-template.json` está actualizado
- [ ] Opcionalmente: usar Grok Chat para el preview visual, luego copiar cliCommand

---

## 📊 **MÉTRICAS A TRACKEAR**

**Log file:** `/logs/YYYY-MM-DD/twitter-automation.md`

Campos mínimos por entrada:

- Timestamp, Phase (1/2/3), type (post/reply/thread)
- Character count, hashtags used
- Agent 3 result (pass/fail + issues)
- Post ID (after publishing)
- Engagement at 24h (likes, retweets, replies) — actualizar manualmente o via X API read

**Métricas semanales a revisar:**

- Posts automatizados vs manuales (on-demand)
- Reply rate de menciones (cuántas menciones recibidas vs respondidas)
- Top hashtags por engagement
- Mejor horario de publicación (basado en likes/RT dentro de 1h)
- Follower growth semanal

---

## 🔒 **GUARDRAILS**

### **Contenido NO Permitido:**

- ❌ Claims de autoridad o regulación ("Alygn ensures", "regulates", "controls")
- ❌ Promesas o garantías
- ❌ Framing de Alygn como tecnología, producto, consultoría o plataforma
- ❌ Datos anteriores a 2025 presentados como actuales
- ❌ Posts sin `cliCommand` validado por Agent 3

### **Contenido SÍ Permitido:**

- ✅ Gobernanza como infraestructura ("infrastructure for accountability")
- ✅ Coordinación sin centralización ("coordination without enforcement")
- ✅ Accountability sin enforcement ("accountability that doesn't require top-down control")
- ✅ Datos verificados 2025-2026 con fuente citada
- ✅ Perspectiva personal de Humano (Fase 1, aprobada)
- ✅ Replies a menciones relevantes (Fase 2, validados por Agent 3)
- ✅ Posts on-demand via CLI con template aprobado (Fase 3)

### **Safeguards del sistema:**

- Agent 3 es obligatorio — no se publica sin validación
- `--dry-run` siempre disponible en todos los scripts
- Logs de todo lo publicado con timestamp
- Máximo 4 posts originales + 8 replies por día (config en `humano.json`)
- Cron solo activo 8 AM - 8 PM (evitar posts nocturnos)

---

## 📎 **Apéndice: Make.com / MCP como Flujo Alternativo**

Make.com fue removido del flujo principal porque **no soporta automatización directa de posting en X** a partir de marzo 2026 (los módulos nativos de Twitter/X fueron deprecados).

Sin embargo, puede usarse como capa complementaria via **MCP (Model Context Protocol)**:

**Caso de uso válido:** Recibir un webhook desde Make.com → ejecutar un script Node.js en el servidor → publicar via X API.

```
Trigger externo (formulario, Notion, Slack)
  → Make.com HTTP Request
  → POST https://yourserver.com/api/twitter-post
  → Node.js endpoint recibe { topic, personalNote }
  → Ejecuta post.js con esos parámetros
  → Publica en @humano via X API
```

**Setup alternativo (webhook endpoint):**

```javascript
// webhook-handler.js
import express from "express";
import { postContent } from "./post.js";
import { postTweet } from "./post.js";

const app = express();
app.use(express.json());

app.post("/api/twitter-post", async (req, res) => {
  const { topic, personalNote, mode = "on-demand" } = req.body;
  const content = await generateContent({ profile: "humano", topic, mode });
  if (content.agent3.overallPass) {
    const result = await postTweet(content.cliArgs);
    res.json({ success: true, tweetId: result.id });
  } else {
    res.json({ success: false, issues: content.agent3.validationResults });
  }
});

app.listen(3001);
```

Este flujo es **opcional** y útil solo si hay integraciones externas que necesiten disparar posts desde otras herramientas.

---

**Prepared by:** Wobblus 🔧 Andler  
**Date:** Marzo 5, 2026  
**Status:** ✅ Updated — Grok CLI + Chat, no Make.com en flujo principal

**Next Steps:**

1. Humano revisa este doc
2. Crear Custom Agent en Grok Chat con el system prompt de sección 3
3. Setup `.env` con credenciales X API
4. Test Fase 1: primera iteración en Grok Chat → CLI
5. Guardar `config/humano-template.json`
6. Activar cron (Fase 2) tras 2-3 días de Fase 1 manual
