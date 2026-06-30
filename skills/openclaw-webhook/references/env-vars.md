# Environment Variables — openclaw-webhook

All env vars are server-only. Never expose to client bundles (no `NEXT_PUBLIC_` prefix).

## Required

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENCLAW_WEBHOOK_PORT` | `18765` | Port for the HTTP server. Must bind to `127.0.0.1` only (MEMORY lesson 27). |
| `OPENCLAW_WEBHOOK_PRIVATE_KEY_PATH` | — | Path to PEM-encoded private key (RS256 or EdDSA). Used to sign outgoing status responses. |
| `OPENCLAW_TRUSTED_PUBLIC_KEYS_DIR` | — | Directory containing PEM public keys for JWT verification. One file per trusted caller (e.g., `vercel.pem`). |

## Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENCLAW_LOG_LEVEL` | `info` | Log level: `debug`, `info`, `warn`, `error`. |
| `OPENCLAW_MANIFEST_DIR` | `~/.openclaw/workspace/.staging/webhook-manifests/` | Directory for event manifest JSON files. |
| `OPENCLAW_JWT_EXPIRY_SECONDS` | `300` | Max JWT validity window (5 minutes). Requests with `exp` beyond this are rejected. |
| `OPENCLAW_RATE_LIMIT_MAX` | `10` | Max requests per minute per IP. |
| `OPENCLAW_RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window in milliseconds. |

## Key File Naming Convention

Public keys in `OPENCLAW_TRUSTED_PUBLIC_KEYS_DIR` are named by issuer:

```
$OPENCLAW_TRUSTED_PUBLIC_KEYS_DIR/
├── vercel.pem       # Vercel's public key (verifies requests from Vercel)
├── openclaw.pem     # OpenClaw's own public key (for self-signed requests, if needed)
└── (future callers)
```

The `iss` claim in the JWT determines which public key file to load. For example, `iss: "vercel"` → `vercel.pem`.

## Setup

```bash
# Create the manifest directory
mkdir -p ~/.openclaw/workspace/.staging/webhook-manifests/

# Create the trusted keys directory
mkdir -p ~/.openclaw/workspace/.staging/webhook-keys/

# Generate a keypair for openclaw-webhook (for signing responses)
openssl genpkey -algorithm Ed25519 -out ~/.openclaw/workspace/.staging/webhook-keys/openclaw-private.pem
openssl pkey -in ~/.openclaw/workspace/.staging/webhook-keys/openclaw-private.pem -pubout -out ~/.openclaw/workspace/.staging/webhook-keys/openclaw-public.pem

# Set env vars (add to OpenClaw cron env or shell profile)
export OPENCLAW_WEBHOOK_PORT=18765
export OPENCLAW_WEBHOOK_PRIVATE_KEY_PATH=~/.openclaw/workspace/.staging/webhook-keys/openclaw-private.pem
export OPENCLAW_TRUSTED_PUBLIC_KEYS_DIR=~/.openclaw/workspace/.staging/webhook-keys/trusted/
export OPENCLAW_LOG_LEVEL=info
export OPENCLAW_MANIFEST_DIR=~/.openclaw/workspace/.staging/webhook-manifests/
```