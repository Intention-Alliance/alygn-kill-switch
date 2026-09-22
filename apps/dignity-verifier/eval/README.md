# Dignity Verifier — Eval Runner

Executes the versioned v1 eval suite against the **production verifier model**
and produces metrics consumable by the dashboard `/api/eval` route and the
`/reports` page.

## Why reuse the production verifier?

The runner imports the live `InferenceVerifier` from
`@alygn/server-kill-switch` (`apps/server-kill-switch/src/services/verification/verifier.ts`)
rather than reimplementing classification. That means the eval exercises the
**exact same** system prompt, ICL examples, Ollama call, and verdict extraction
as the kill-switch middleware in production. Measuring a reimplementation would
tell you nothing about the real verifier — this measures the real one.

## Usage

```bash
# Full v1 suite (original + heldout) against the default model
bun apps/dignity-verifier/eval/run-eval.ts

# Just the original 13-test baseline
bun apps/dignity-verifier/eval/run-eval.ts --set original

# Just the held-out 20-test set
bun apps/dignity-verifier/eval/run-eval.ts --set heldout

# Different model
bun apps/dignity-verifier/eval/run-eval.ts --model qwen2.5:0.5B

# Cap the number of tests (useful for slow smoke runs)
bun apps/dignity-verifier/eval/run-eval.ts --set original --limit 5
```

### Arguments

| Flag | Default | Description |
|------|---------|-------------|
| `--suite` | `v1` | Versioned eval suite directory under `dataset/eval/` |
| `--set` | `all` | `original` \| `heldout` \| `all` |
| `--model` | `qwen2.5:0.5B` | Ollama model name to classify with |
| `--out` | `eval-results/` | Output directory (a `runId` subdir is created inside) |
| `--limit` | (none) | Cap the number of tests run (positive integer) |

Requires Ollama reachable at `http://localhost:11434` (the verifier's default
base URL). Override via `KILL_SWITCH_VERIFIER_BASE_URL` if needed.

## Output

Each run writes to `eval-results/<runId>/` where `runId` is a timestamp slug
(e.g. `2026-08-27T02-30-00-000Z`):

```
eval-results/<runId>/
├── results.jsonl   # raw per-test results (gitignored)
└── report.json     # dashboard EvalReport shape (gitignored)
```

### `results.jsonl`

One JSON object per test:

```json
{"id":"eval-001","expected":"SAFE","actual":"SAFE","category":"safe-factual","latencyMs":360,"model":"qwen2.5:0.5B","degraded":false,"reason":"correct factual answer"}
```

### `report.json`

Matches the dashboard `EvalReport` interface in
`dashboard/src/lib/eval-types.ts`, plus run metadata:

```json
{
  "runId": "2026-08-27T02-30-00-000Z",
  "accuracy": 0.38,
  "fpr": 0.0,
  "fnr": 0.6,
  "confusionMatrix": {
    "expected": ["SAFE", "UNSAFE", "REVIEW", "INJECTION"],
    "actual": ["SAFE", "UNSAFE", "REVIEW", "INJECTION"],
    "counts": [[...], [...], [...], [...]]
  },
  "perCategory": [
    {"category": "safe-factual", "count": 2, "total": 3, "accuracyPct": 66.7}
  ],
  "latencyP95Ms": 412,
  "generatedAt": "2026-08-27T02:30:00.000Z",
  "model": "qwen2.5:0.5B",
  "suite": "v1",
  "set": "all",
  "gitSha": "af976860...",
  "count": 33
}
```

### Metric definitions

- **accuracy** — correct predictions / total (0–1).
- **FPR** (false positive rate) — SAFE cases misclassified as UNSAFE/INJECTION,
  divided by total SAFE cases. Benign output wrongly blocked.
- **FNR** (false negative rate) — UNSAFE/INJECTION cases misclassified as SAFE,
  divided by total harmful cases. Harmful output wrongly passed through.
- **confusionMatrix** — 4×4, rows = expected verdict, cols = actual verdict.
- **perCategory** — per-category accuracy (0–100).
- **latencyP95Ms** — 95th percentile classification latency (nearest-rank).

## How the dashboard consumes it

`dashboard/src/app/api/eval/route.ts` returns an `EvalReport` (currently an
empty/null placeholder until wired to real data). The `/reports` page renders
accuracy/FPR/FNR/latency stat cards, the 4×4 confusion matrix, and per-category
accuracy bars. The runner's `report.json` is the source of truth for that shape —
wire the route to read the latest `eval-results/<runId>/report.json` to populate
the dashboard.

## Tests

```bash
bun test apps/dignity-verifier/eval/
```

Covers confusion-matrix math, FPR/FNR edge cases (empty class, perfect scores),
accuracy, per-category accuracy, and p95 latency.

## Git policy

`eval-results/` is a generated artifact and is **gitignored** (see
`apps/dignity-verifier/.gitignore`). The v1 eval data and manifest are immutable
— never edit them in place; add a new version (`v2/`) instead.
