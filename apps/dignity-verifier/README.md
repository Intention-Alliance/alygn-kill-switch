# Dignity Verifier Training Framework

Distills inference-safety classification capability from a large **teacher** model
(`deepseek-v4-flash:cloud`) into a small **student** model (`qwen2.5:0.5b`) via
LoRA fine-tuning, using LlamaIndex for dataset augmentation. Ships a super-admin
dashboard for executing training, upserting datasets, configuring LlamaIndex, and
viewing reports.

**Target model:** `dignity-verifier-preview-v1` (fine-tuned `qwen2.5:0.5b`)

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

See `docs/adr/ADR-dignity-verifier-training-framework.md` for the full
architecture design, component contracts, and security boundaries.

## Pipeline (seed → augment → fine-tune → eval → deploy)

1. **Seed** — 275+ curated `(prompt, output, verdict, reason, category)` triples
   across 15+ categories (SAFE / UNSAFE / REVIEW / INJECTION).
2. **Augment** — LlamaIndex indexes the seed with `nomic-embed-text-v2-moe`,
   retrieves top-5 semantic neighbors, and the teacher generates paraphrases.
   Each augmented example is verified against the teacher verdict before inclusion.
   Target: 275 → 500+.
3. **Fine-tune** — PEFT LoRA (rank=8, alpha=16, dropout=0.05, target
   `q_proj`/`v_proj`) on `qwen2.5:0.5b`, 3 epochs, batch_size=4, lr=2e-4, CPU-only
   (~2–4h). Output: LoRA adapter (~5–20MB).
4. **Eval** — 33-test suite (13 original + 20 held-out). Target ≥85%.
5. **Deploy** — `ollama create dignity-verifier-preview-v1` from Modelfile
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
  - `TEACHER_MODEL` (defaults to `deepseek-v4-flash:cloud`)
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
- [ ] Seed dataset 275+ examples (Zyxali)
- [ ] LoRA fine-tune <4h on CPU
- [ ] Eval accuracy ≥85%
- [ ] Deploy `dignity-verifier-preview-v1` to kill-switch
