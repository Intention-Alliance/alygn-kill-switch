#!/usr/bin/env bash
#
# generate-secrets.sh — Generate strong secrets for the Kill Switch API.
#
# Generates strong secrets for every env var required by validate-env.ts
# (apps/server-kill-switch/src/config/validate-env.ts) and writes them to the
# target .env file in KEY=value form.
#
# Idempotent: any variable already set in the target .env is left untouched.
# Only missing variables are appended.
#
# Usage:
#   bash scripts/security/generate-secrets.sh                 # default: ./.env
#   bash scripts/security/generate-secrets.sh /path/to/.env   # explicit target
#
# SECURITY: Never commit .env to git. Rotate these keys if they leak.

set -euo pipefail

# ─── Configuration ──────────────────────────────────────────────

# Default target is .env in the current working directory (the app root when
# invoked as `bash scripts/security/generate-secrets.sh` from the app).
TARGET_ENV="${1:-.env}"

# All secrets required by validate-env.ts. Each is generated with
# `openssl rand -hex 32` (64 hex chars) which satisfies every minLength and
# the "at least 2 character classes" complexity check (hex has lowercase +
# digits).
SECRET_KEYS=(
  AUDIT_HMAC_KEY
  ADMIN_UI_API_KEY
  KILL_SWITCH_INTERNAL_KEY
  BETTER_AUTH_SECRET
  KILL_SWITCH_AUTH_TOKEN
  KILL_SWITCH_API_KEY
)

# ─── Helpers ───────────────────────────────────────────────────

# Check whether a variable is already set (non-empty) in the target .env.
# Handles both `KEY=value` and `export KEY=value` forms.
env_has_key() {
  local key="$1"
  grep -Eq "^[[:space:]]*(export[[:space:]]+)?${key}=" "${TARGET_ENV}" 2>/dev/null
}

# ─── Main ───────────────────────────────────────────────────────

if ! command -v openssl >/dev/null 2>&1; then
  echo "ERROR: openssl is required but not found on PATH." >&2
  exit 1
fi

# Create the target file if it does not exist yet.
if [[ ! -f "${TARGET_ENV}" ]]; then
  touch "${TARGET_ENV}"
  echo "Created ${TARGET_ENV}"
fi

generated=0
skipped=0

for key in "${SECRET_KEYS[@]}"; do
  if env_has_key "${key}"; then
    echo "SKIP  ${key} (already set in ${TARGET_ENV})"
    skipped=$((skipped + 1))
    continue
  fi

  value="$(openssl rand -hex 32)"
  printf '%s=%s\n' "${key}" "${value}" >>"${TARGET_ENV}"
  echo "ADD   ${key} (generated)"
  generated=$((generated + 1))
done

echo ""
echo "Done. Generated ${generated} secret(s), skipped ${skipped} already-set."
echo "Target file: ${TARGET_ENV}"
echo ""
echo "SECURITY: Keep ${TARGET_ENV} out of version control. Rotate these keys if leaked."
