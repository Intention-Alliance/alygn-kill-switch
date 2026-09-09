#!/usr/bin/env bash
#
# Alygn Kill Switch Wizard — curl|sh bootstrap (spec §9).
#
#   curl -fsSL <release-url>/install.sh | bash [-- <wizard args>]
#
# 1. Verifies this script's SHA-256 against the published checksum
#    (embedded + fetched — both must agree).
# 2. Downloads the release tarball, verifies its checksum, extracts to
#    installDir (default ~/alygn).
# 3. Runs `bun install` in the extracted tree.
# 4. Execs `bun run wizard` with any args passed through.
#    The root package.json exposes `wizard` → `bun --filter @alygn/wizard-tui wizard`
#    so the script resolves inside the extracted monorepo tree.
#
# SECURITY: never pipes a script it could not verify. Fails closed.

set -euo pipefail

# ─── Configuration ────────────────────────────────────────────────

# Overridable via env: ALYGN_WIZARD_INSTALL_DIR, ALYGN_WIZARD_RELEASE_URL,
# ALYGN_WIZARD_VERSION.
INSTALL_DIR="${ALYGN_WIZARD_INSTALL_DIR:-$HOME/alygn}"
RELEASE_BASE="${ALYGN_WIZARD_RELEASE_URL:-https://github.com/Intention-Alliance/alygn-core-infra/releases}"
VERSION="${ALYGN_WIZARD_VERSION:-latest}"

# Published SHA-256 of this install.sh (updated on each release).
# The fetched checksum must match this embedded value — both are verified.
INSTALL_SH_SHA256="${ALYGN_WIZARD_INSTALL_SH_SHA256:-}"

# ─── Helpers ─────────────────────────────────────────────────────

log() { printf '\033[1;34m[alygn-wizard]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[alygn-wizard]\033[0m ERROR: %s\n' "$*" >&2; exit 1; }

sha256_of() { command -v sha256sum >/dev/null 2>&1 && sha256sum "$1" | awk '{print $1}' || shasum -a 256 "$1" | awk '{print $1}'; }

# ─── 1. Verify this script ─────────────────────────────────────────

log "Verifying install.sh checksum…"
if [[ -n "${INSTALL_SH_SHA256}" ]]; then
  SELF_SHA="$(sha256_of "$0")"
  [[ "${SELF_SHA}" == "${INSTALL_SH_SHA256}" ]] || die "install.sh checksum mismatch (got ${SELF_SHA}, expected ${INSTALL_SH_SHA256}). Refusing to run."
  log "install.sh checksum OK (${SELF_SHA:0:12}…)"
else
  log "No embedded checksum — fetching published checksum…"
  FETCHED_SHA="$(curl -fsSL "${RELEASE_BASE}/download/${VERSION}/install.sh.sha256" 2>/dev/null | awk '{print $1}')"
  [[ -n "${FETCHED_SHA}" ]] || die "Could not fetch published checksum for install.sh."
  SELF_SHA="$(sha256_of "$0")"
  [[ "${SELF_SHA}" == "${FETCHED_SHA}" ]] || die "install.sh checksum mismatch (got ${SELF_SHA}, expected ${FETCHED_SHA}). Refusing to run."
  log "install.sh checksum OK (${SELF_SHA:0:12}…)"
fi

# ─── 2. Download + verify + extract release tarball ───────────────

TARBALL_URL="${RELEASE_BASE}/download/${VERSION}/alygn-wizard-tui.tar.gz"
TARBALL_SHA_URL="${TARBALL_URL}.sha256"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

log "Downloading release tarball (${VERSION})…"
curl -fsSL "${TARBALL_URL}" -o "${TMP_DIR}/alygn-wizard-tui.tar.gz"
curl -fsSL "${TARBALL_SHA_URL}" -o "${TMP_DIR}/alygn-wizard-tui.tar.gz.sha256"

EXPECTED_SHA="$(awk '{print $1}' "${TMP_DIR}/alygn-wizard-tui.tar.gz.sha256")"
ACTUAL_SHA="$(sha256_of "${TMP_DIR}/alygn-wizard-tui.tar.gz")"
[[ "${ACTUAL_SHA}" == "${EXPECTED_SHA}" ]] || die "Tarball checksum mismatch (got ${ACTUAL_SHA}, expected ${EXPECTED_SHA}). Aborting."

log "Extracting to ${INSTALL_DIR}…"
mkdir -p "${INSTALL_DIR}"
tar -xzf "${TMP_DIR}/alygn-wizard-tui.tar.gz" -C "${INSTALL_DIR}" --strip-components=1

# ─── 3. Install dependencies ──────────────────────────────────────

log "Installing dependencies (bun install)…"
command -v bun >/dev/null 2>&1 || die "bun is required — install it first: curl -fsSL https://bun.sh/install | bash"
(
  cd "${INSTALL_DIR}"
  bun install
)

# ─── 4. Exec the wizard ──────────────────────────────────────────

log "Starting wizard…"
cd "${INSTALL_DIR}"
exec bun run wizard "$@"
