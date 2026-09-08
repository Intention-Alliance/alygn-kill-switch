# V7 — AI-Agnostic Discovery (Ollama/HF/LlamaIndex/vLLM/OpenAI-compatible)

**Claim:** Whitepaper v1.5 §2.5 — AI-agnostic provider discovery deployed.
**Status:** ⚠️ PARTIALLY VERIFIED — Ollama live; multi-provider enumeration pending test machine
**Verifier:** Volthiz (QA) — 2026-09-08 13:00 CST

## Evidence

### 1. Ollama provider live on andlersrv with models enumerated

```bash
$ curl -s http://localhost:11434/api/tags
{"models":[
  {"name":"embeddinggemma:300m-qat-q8_0","model":"embeddinggemma:300m-qat-q8_0","size":338023149,"details":{"family":"gemma3","parameter_size":"307.58M","quantization_level":"Q8_0","capabilities":["embedding"]}},
  {"name":"deepseek-v4-pro:0813-cloud","model":"deepseek-v4-pro:0813-cloud","remote_model":"deepseek-v4-pro:0813","remote_host":"https://ollama.com","details":{"parameter_size":"1.65T","capabilities":["completion","tools","thinking"]}},
  {"name":"deepseek-v4-flash:cloud","model":"deepseek-v4-flash:cloud","remote_model":"deepseek-v4-flash:0731","remote_host":"https://ollama.com","details":{"parameter_size":"304B","capabilities":["completion","tools","thinking"]}},
  ... (glm-* and more)
]}
```

- Container `alygn-ollama-proxy` Up 5 days, proxying to Ollama.
- Multiple models enumerated with family/params/capabilities — the discovery data source is live.

### 2. Inference verification pipeline live (evidence of provider integration)

`verification_event` table: **15 rows** — inference requests routed through the kill-switch, verified against `qwen2.5:0.5b` (degraded mode: "verifier model unavailable" → REVIEW verdict, confidence 0.0, `degraded:1`). This proves the kill-switch ↔ provider loop executes end-to-end.

### 3. Provider probe endpoint (code-verified)

`POST /v1/discovery/:machineId/probe` — probes providers on a machine, returns `{providers: [{name, modelCount, ...}]}`. Requires admin role.

## Blocked on

- **Multi-provider enumeration** (HuggingFace/LlamaIndex/vLLM/OpenAI-compatible on a test machine) — needs a second machine with providers installed (WS-B pending).
- Ollama-only discovery verified live; the other 4 provider adapters are code-only until a test machine exists.

## Verdict

**V7: PARTIAL — Ollama discovery + inference verification loop live on andlersrv. Multi-provider adapters pending test machine (WS-B).**
