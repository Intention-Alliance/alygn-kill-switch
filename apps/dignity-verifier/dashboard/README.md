# Dashboard — Super-Admin Control Plane

Next.js (App Router, standalone output) super-admin dashboard for the Dignity
Verifier Training Framework. **Tailscale-only** access, bound to
`127.0.0.1:3002` in Docker. Follows the `apps/web-regulator` pattern.

## Pages

| Route | Purpose |
|-------|---------|
| `/` | Dashboard home — framework status, latest eval accuracy, active runs |
| `/dataset` | Dataset manager — view/add/edit/delete examples, upload JSONL |
| `/training` | Training executor — start/stop runs, view progress + logs |
| `/llama-index` | LlamaIndex config — augmentation params, teacher model, run augment |
| `/reports` | Reports viewer — training run history, eval results, accuracy charts |

## Auth

Super-admin only. Andler's Tailscale identity via **Better-Auth** (same pattern
as `apps/web-regulator`). No self-signup; the admin allowlist is enforced at the
auth layer and every API route.

## API surface

The dashboard is a **thin client**. It does not run training or augmentation
itself — it calls the Training Framework Core over HTTP. All `/api/*` routes
proxy to the core backend (see ADR §Component Contracts).

## Build & run

```bash
cd apps/dignity-verifier/dashboard
bun install
bun run build          # produces .next/standalone
docker compose up -d   # from apps/dignity-verifier/
```

## Security

- Binds `127.0.0.1:3002` (localhost only; Tailscale for remote).
- CSP + security headers (copy from `apps/web-regulator/next.config.ts`).
- No PII rendered; datasets are synthetic.
