# Dignity Verifier Training Framework

**Humans are the trainers.** The training signal is human-authored and
human-adjudicated labels. An AI model may act as an **optional mediator** on the
training loop — proposing labels, generating paraphrases, and flagging
disagreements — but it is never the arbiter of truth. See
[Who trains](#who-trains--the-ai-mediator-policy).

Mechanically, the framework fine-tunes a small **student** model
(`qwen2.5:0.5b`) via LoRA on human-labelled data, using LlamaIndex for optional
semantic augmentation. Ships a super-admin dashboard for executing training,
upserting datasets, configuring LlamaIndex, and viewing reports.

**Target model:** `dignity-verification-v0.1-preview` (fine-tuned `qwen2.5:0.5b`)

> **Terminology.** "Teacher" is distillation vocabulary (a model whose outputs
> are distilled into a student) — it does **not** mean the AI trains the model.
> The trainer is the human. The teacher/mediator only proposes and paraphrases;
> LoRA does the training.

## Why this exists

The kill-switch verifier (`apps/server-kill-switch`) classifies inference output as
`SAFE | UNSAFE | REVIEW` using a stock `qwen2.5:0.5b` with a hand-written system
prompt. Baseline accuracy on the 13-test eval suite is **38%** — too low for a
safety-critical gate. This framework replaces the hand-tuned prompt with a
**fine-tuned** 0.5B model that has learned the classification boundary from a
stronger teacher, targeting **≥85%** accuracy.

## System constraints (hard limits)

| Constraint | Value | Impact |
|-----------|-------|--------|
| CPU | No GPU (CPU-only) | LoRA rank ≤8, batch_size ≤4 |
| Disk | 16G free | All framework artifacts <5G total |
| Python | 3.14.5 + PyTorch 2.10 | Training stack ready |
| Ollama | Local, `qwen2.5:0.5b` present | Student local; teacher must be cloud |
| Memory | 32GB RAM | Sufficient for 0.5B LoRA training |

## Directory map

```
apps/dignity-verifier/
├── README.md            ← this file
├── docker-compose.yml   ← dashboard service (align-network, 127.0.0.1:3002)
├── .env.example         ← env template (secrets never committed)
├── dashboard/           ← Next.js super-admin dashboard (Tailscale-only)
│   ├── Dockerfile       ← multi-stage: builder → standalone runner
│   ├── nginx.conf       ← Tailscale-only reverse proxy (install to /etc/nginx)
│   ├── package.json / next.config.ts / tsconfig.json
│   └── src/
│       ├── app/         ← layout, home, dataset/training/llama-index/reports pages
│       │   └── api/     ← auth/[...all] (Better-Auth mount) + health
│       └── lib/         ← auth.ts, auth-client.ts, db-schema.ts
├── dataset/             ← seed / augmented / eval JSONL datasets
├── training/            ← LoRA fine-tune pipeline + Ollama Modelfile
├── llama-index/         ← semantic augmentation pipeline
└── reports/             ← training runs, eval results, distillation logs
```

## Architecture

The architecture design, component contracts, and security boundaries are
documented **internally** (team process docs, not this repo). This repo carries
the implementation and the operational READMEs alongside it.

> The previous revision pointed at `docs/adr/ADR-dignity-verifier-training-framework.md`.
> That file was removed in the 2026-09-08 docs cleanup ("separate internal
> development process from public documentation"), so the reference was dead.
> Removed rather than re-added: architecture decision records for this framework
> live in the internal process docs by that cleanup's own policy.

## Testing framework

The testing/eval framework is an **internal** design artifact and is deliberately
**not specified in this repo**. What this repo carries is the interface: the eval
runner contract and the held-out dataset. The framework's low-level parameters
(per-class floors, calibration metrics, adversarial suites) are defined
internally and owned by the dataset/eval workstream.

**Invariant that does belong here:** the eval suite must be human-authored and
human-verified. No AI-drafted or AI-verified record may enter the held-out set.

### What the verifier is tested against — La Prueba de Dignidad

The eval suite operationalizes the **Dignity Test** (Alygn institutional
standard, September 2026): seven criteria that decide whether an AI system may
operate over persons. Administered by a three-chamber vetting model (independent
universities, a sortition-based citizen assembly, multisector practitioners) —
structurally impossible for any single actor to capture.

| # | Criterio | Evalúa (resumen) | Where it lands in this repo |
|---|----------|------------------|------------------------------|
| 1 | **Independencia estructural** | Independence from those who benefit from its decisions | Pipeline governance — human-as-trainer policy; mediator is advisory, never authoritative |
| 2 | **Funcionamiento declarado** | Operates within authorized functions only | `REVIEW` band — out-of-authority content routes to humans, not auto-blocked |
| 3 | **Consistencia adversarial** | Holds behavior under pressure/manipulation | `injection-role-override`, `injection-format-manipulation` categories |
| 4 | **Razonabilidad revisable** | Reviewable and comprehensible by human supervisors | `review-political`, `review-ethics`, `review-subjective-advice` — the human-review queue |
| 5 | **Honestidad epistémica** | Expresses certainty honestly | Confidence calibration (ECE) — the known eval gap; probabilities are uncalibrated as shipped |
| 6 | **Trato igualitario** | Treats all persons with equal dignity | `unsafe-hate-speech` and bias-sensitive categories |
| 7 | **Auditabilidad + Contención** | Auditable records **and** a verifiable kill switch | This repo's subject: `inference_log` records, the kill-switch gate, and the SAFE/UNSAFE/REVIEW decision itself |

Criterion 7 is the product; criteria 1–6 are the properties its classification
must preserve. The eval suite's category weights (above) are the measurable
surface of those seven criteria.

### Measured accuracy (baseline → target)

| checkpoint | accuracy | source |
|---|---|---|
| Stock `qwen2.5:0.5b` + hand-written prompt | **38%** | 13-test suite (motivating baseline) |
| Raw checkpoint + 0 few-shot examples | 64% | 14-prompt probe, disjoint example pool |
| **+ 3 few-shot examples (measured optimum)** | **93%** | same probe — 0 benign blocked, 0 unsafe forwarded |
| + 6 examples | 86% | head budget is 192 tokens; longer lists truncate mid-entry |
| Fine-tuned target | **≥85%** | 33-test suite, per-class floors enforced |

The 93% few-shot figure is a **prompting** result on a small probe, not the
fine-tuned target — it establishes that the signal exists and where it belongs
(question instructions, never `state`).

## Who trains — the AI mediator policy

**The human owns the label. The AI never does.** This is a policy, not a
preference, and it inverts the rule the pipeline shipped with.

### The roles

| Role | Who | Authority |
|------|-----|-----------|
| **Trainer** | Human | Owns ground truth. Authors and adjudicates every label. |
| **Mediator** | AI model (optional) | Proposes labels, generates paraphrases, flags disagreements. **Never** decides. |
| **Training** | LoRA on `qwen2.5:0.5b` | Consumes the human-adjudicated dataset. No AI in this step. |

### The policy

1. **Human labels are authoritative.** No AI verdict may override, reject, or
   silently replace a human label.
2. **AI disagreement is a flag, never a rejection.** When the mediator's verdict
differs from the human's, the record is routed to a **human review queue** with
the mediator's verdict attached for context. It is not deleted.
3. **The mediator is optional.** With mediation disabled the pipeline runs
   seed → train directly. Nothing about training requires an AI in the loop.
4. **Provenance is mandatory.** Every record records *who authored* and *who
   verified* it, so the human/AI split is auditable per record rather than
   assumed. See `dataset/seed/README.md` for the field set.
5. **The eval suite is human-authored and human-verified, always.** An
   AI-generated measuring instrument would measure the AI against itself.

### What this changes in the code

The shipped pipeline inverted the authority: `augment.py` treats *"teacher
verdict must match the original verdict, otherwise reject (divergence)"* as an
acceptance gate, so a human label was valid only if an AI agreed. Under this
policy that gate becomes a **quarantine** — divergence routes to human review
instead of discarding the record.

### Why the mediator is a cloud model

The mediator must be materially stronger than the 0.5B student to add signal,
and the local host cannot serve a model that strong, so it is a cloud model on
the allowed list. `glm-5.3-flash:cloud` is the current primary with
`glm-5.2:cloud` as fallback — set in `llama-index/config.yaml`. This is a
**capability and cost** choice, not a statement that AI should own the labels.

## Pipeline (seed → augment → fine-tune → eval → deploy)

1. **Seed** — curated `(prompt, output, verdict, reason, category)` triples
   across 15+ categories (SAFE / UNSAFE / REVIEW / INJECTION).
   **Human-authored; human labels are authoritative.**
2. **Augment** *(optional)* — LlamaIndex indexes the seed with
   `nomic-embed-text-v2-moe`, retrieves top-5 semantic neighbors, and the
   mediator generates paraphrases. Divergence from the human verdict
   **quarantines** the candidate for human review — it never rejects it.
3. **Fine-tune** — PEFT LoRA (rank=8, alpha=16, dropout=0.05, target
   `q_proj`/`v_proj`) on `qwen2.5:0.5b`, 3 epochs, batch_size=4, lr=2e-4, CPU-only
   (~2–4h). Output: LoRA adapter (~5–20MB).
4. **Eval** — held-out suite, human-authored and human-verified. Target ≥85%.
5. **Deploy** — `ollama create dignity-verification-v0.1-preview` from Modelfile
   (`FROM qwen2.5:0.5b` + `ADAPTER`), then update kill-switch `DEFAULT_MODEL`.

## Self-evolving loop

After each training cycle, eval results feed back into the dataset: false
positives/negatives are added as new examples, the pipeline is retrained, and
accuracy is re-measured. See ADR §"Self-Evolving Loop".

## Security

- **Super-admin only** — Andler's Tailscale identity via Better-Auth.
- **No PII** — synthetic examples only; no real user data.
- **Localhost Docker** — dashboard binds `127.0.0.1:3002`; Tailscale for remote.
- **Artifacts gitignored** — LoRA weights, augmented datasets, and reports are
  never committed.

## Team

Architecture: **Hugrukal** · Pipeline: **Keridz** · Dashboard: **Gimglich** ·
Dataset/eval: **Zyxali** · Storage: **Zuldrak** · Docker/deploy: **Rokthar** ·
Review: **Chanshuk** / **Nikaya** · QA: **Volthiz** · Docs: **Talanara** ·
Orchestration: **Wobblus**

---

# Operations (Rokthar / devops)

## How to Start the Dashboard

### Prerequisites

- Docker + the external `align-network` network (created by the root
  `docker-compose.yml`).
- Env vars in the shell (or `.env`):
  - `BETTER_AUTH_SECRET` (shared with kill-switch)
  - `KILL_SWITCH_AUTH_TOKEN` (super-admin password seed, ≥16 chars)
  - `OLLAMA_BASE_URL` (defaults to `http://host.docker.internal:11434`)
  - `TEACHER_MODEL` (defaults to `glm-5.3-flash:cloud`)
  - `STUDENT_MODEL` (defaults to `qwen2.5:0.5b`)
  - `EMBEDDING_MODEL` (defaults to `nomic-embed-text-v2-moe:latest`)

### Build + Run

```bash
cd /home/andlersrv/.openclaw/workspace/repos/alygn/infrastructure

# Build the dashboard image
docker compose -f apps/dignity-verifier/docker-compose.yml build

# Start it
docker compose -f apps/dignity-verifier/docker-compose.yml up -d

# Verify health
curl -f http://127.0.0.1:3002/health
```

The dashboard publishes on **`127.0.0.1:3002`** (localhost only). Remote access
is via Tailscale + nginx (below).

### Nginx (Tailscale-only remote access)

Install the provided nginx config to expose the dashboard over Tailscale with the
existing Tailscale cert:

```bash
sudo ln -sf \
  /home/andlersrv/.openclaw/workspace/repos/alygn/infrastructure/apps/dignity-verifier/dashboard/nginx.conf \
  /etc/nginx/sites-available/dignity-verifier.conf
sudo ln -sf /etc/nginx/sites-available/dignity-verifier.conf \
            /etc/nginx/sites-enabled/dignity-verifier.conf
sudo nginx -t && sudo systemctl reload nginx
```

Access: `https://andlersrv.tail62d797.ts.net:8443` (Tailscale mesh only —
non-Tailscale IPs are denied at the nginx edge and re-verified in the app).

## Super-Admin Access Setup

The dashboard is **super-admin only** — a single user (Andler), no public
registration, no multi-user. Access is gated by three layers:

1. **Tailscale identity** — nginx denies non-Tailscale IPs; the app re-verifies
   the client IP is within the Tailscale CGNAT range (`100.64.0.0/10`) as
   defense-in-depth.
2. **Better-Auth session** — httpOnly cookie, 1h expiry, refreshed every 5m.
3. **WebAuthn (FIDO2)** — hardware security key / passkey bound to the Tailscale
   relying party (`andlersrv.tail62d797.ts.net`).

The super-admin user is auto-seeded on first request (direct SQLite insert, no
HTTP self-roundtrip). Credentials:

- **Email:** `ADMIN_EMAIL` (defaults to `andlersrv@alygn.com`)
- **Password:** `KILL_SWITCH_AUTH_TOKEN` (shared with the kill-switch)

The seed is idempotent — it skips if the user already exists. The SQLite DB
(`dignity-verifier.db`) persists in the `dignity-verifier-data` volume.

## Status

- [x] Docker scaffold + super-admin auth (this scaffold)
- [ ] Dashboard UI (Gimglich)
- [ ] Training pipeline (Keridz)
- [ ] Seed dataset 280 examples (Zyxali)
- [ ] LoRA fine-tune <4h on CPU
- [ ] Eval accuracy ≥85%
- [ ] Deploy `dignity-verification-v0.1-preview` to kill-switch
