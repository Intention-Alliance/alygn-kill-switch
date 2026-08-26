# App Routes

Next.js App Router pages. Each route is a thin client that calls the Training
Framework Core via the `lib/` API client (proxied through `/api/*` rewrites).

| Route | Purpose |
|-------|---------|
| `layout.tsx` | Root layout (auth guard, nav, theme) |
| `page.tsx` | Dashboard home — status, latest eval accuracy, active runs |
| `dataset/page.tsx` | Dataset manager — CRUD examples, upload JSONL |
| `training/page.tsx` | Training executor — start/stop runs, progress, logs |
| `llama-index/page.tsx` | LlamaIndex config — augmentation params, teacher model |
| `reports/page.tsx` | Reports viewer — run history, eval results, charts |
