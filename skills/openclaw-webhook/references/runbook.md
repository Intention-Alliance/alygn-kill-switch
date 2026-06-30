# Runbook — openclaw-webhook

Operations guide for the event-routing fabric. Covers startup, shutdown, debugging, recovery, and key rotation.

## Startup

```bash
# Set required env vars (or source from profile)
export OPENCLAW_WEBHOOK_PORT=18765
export OPENCLAW_WEBHOOK_PRIVATE_KEY_PATH=~/.openclaw/workspace/.staging/webhook-keys/openclaw-private.pem
export OPENCLAW_TRUSTED_PUBLIC_KEYS_DIR=~/.openclaw/workspace/.staging/webhook-keys/trusted/
export OPENCLAW_MANIFEST_DIR=~/.openclaw/workspace/.staging/webhook-manifests/

# Start the server
bun run ~/.openclaw/workspace/skills/openclaw-webhook/scripts/server.ts
```

For OpenClaw cron, use `@reboot`:

```
@reboot bun run ~/.openclaw/workspace/skills/openclaw-webhook/scripts/server.ts
```

## Health Check

```bash
# Check if the server is running
curl -s http://127.0.0.1:18765/webhook/health

# Expected response:
# { "status": "ok", "uptime_seconds": 12345, "handlers": ["blog-pipeline.request"] }
```

The health check endpoint does NOT require JWT auth — it only returns status info, no sensitive data.

## Shutdown

```bash
# Find the process
pgrep -f "openclaw-webhook/scripts/server.ts"

# Graceful shutdown (SIGTERM — server finishes in-flight requests)
kill -TERM <pid>

# Force kill (only if SIGTERM doesn't work after 10s)
kill -KILL <pid>
```

## Debugging

### Server won't start

1. Check env vars are set: `echo $OPENCLAW_WEBHOOK_PORT $OPENCLAW_WEBHOOK_PRIVATE_KEY_PATH $OPENCLAW_TRUSTED_PUBLIC_KEYS_DIR`
2. Check port is not in use: `ss -tlnp | grep 18765`
3. Check private key exists: `ls -la $OPENCLAW_WEBHOOK_PRIVATE_KEY_PATH`
4. Check trusted keys dir exists: `ls -la $OPENCLAW_TRUSTED_PUBLIC_KEYS_DIR/`
5. Run with debug logging: `OPENCLAW_LOG_LEVEL=debug bun run scripts/server.ts`

### JWT verification fails

1. Check the issuer's public key is in the trusted dir: `ls $OPENCLAW_TRUSTED_PUBLIC_KEYS_DIR/<iss>.pem`
2. Verify the key format: `openssl pkey -in $OPENCLAW_TRUSTED_PUBLIC_KEYS_DIR/<iss>.pem -pubin -text -noout`
3. Check JWT claims: decode the JWT (e.g., `echo <jwt> | cut -d. -f2 | base64 -d | jq .`)
4. Verify `exp` is not expired
5. Verify `aud` is `openclaw-webhook`
6. Check `payload_sha256` matches the SHA-256 of the request body

### Handler not found

1. Check which handlers are registered: `curl -s http://127.0.0.1:18765/webhook/health`
2. Verify the `event_type` in the JWT matches a registered handler
3. Check server logs for registration errors at startup

### Rate limit hit

1. Check server logs for `RATE_LIMIT_EXCEEDED` entries
2. The default is 10 req/min per IP. Increase `OPENCLAW_RATE_LIMIT_MAX` if legitimate traffic exceeds this.

## Recovery

### Manifest corruption

If a manifest file is corrupted:

```bash
# List manifests
ls -la $OPENCLAW_MANIFEST_DIR/

# Check a specific manifest
cat $OPENCLAW_MANIFEST_DIR/<event_id>.json | jq .

# If corrupted, delete it — the next request will create a fresh one
rm $OPENCLAW_MANIFEST_DIR/<event_id>.json
```

### Server crash recovery

The server is stateless (all state is in manifest files). Restarting picks up where it left off:

1. Manifests with `status: pending` will be processed on the next processor run
2. Manifests with `status: processing` will be re-processed (idempotent — handler skips already-generated assets)
3. Manifests with `status: ready` or `status: failed` are terminal

## Key Rotation

Use the rotate-keys script:

```bash
# Rotate the openclaw-webhook signing key
bun run ~/.openclaw/workspace/skills/openclaw-webhook/scripts/rotate-keys.ts

# This will:
# 1. Generate a new EdDSA keypair
# 2. Write the new private key to OPENCLAW_WEBHOOK_PRIVATE_KEY_PATH
# 3. Archive the old private key with a timestamp suffix
# 4. Write the new public key to the same directory
# 5. Print instructions for distributing the new public key to callers
```

After rotation:

1. Distribute the new public key to all callers (e.g., update Vercel env with the new `openclaw-webhook` public key)
2. Remove the old public key from `OPENCLAW_TRUSTED_PUBLIC_KEYS_DIR` only after all callers have updated
3. Restart the server to load the new private key

### Adding a new trusted caller

```bash
# Generate a keypair for the new caller (on their side)
openssl genpkey -algorithm Ed25519 -out new-caller-private.pem
openssl pkey -in new-caller-private.pem -pubout -out new-caller-public.pem

# Add the public key to the trusted dir (on andlersrv)
cp new-caller-public.pem $OPENCLAW_TRUSTED_PUBLIC_KEYS_DIR/new-caller.pem

# The new caller can now send JWTs with iss: "new-caller"
```

### Removing a trusted caller

```bash
# Remove their public key
rm $OPENCLAW_TRUSTED_PUBLIC_KEYS_DIR/old-caller.pem

# Restart the server (or wait for the key cache to expire)
```