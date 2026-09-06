#!/usr/bin/env bash
# Probe every tool /setup can reach for and report what is installed.
#
# The split that matters: HARD tools are the ones Phase 3 (local bring-up) genuinely
# cannot run without, so a missing one exits non-zero and stops the skill. SOFT tools
# only gate Phase 4 (cloud provisioning), which many clones never do — failing the whole
# preflight on a missing `neonctl` would block a user who only wants the app running on
# their laptop. Soft misses are printed as warnings and the exit code stays 0.
#
# No dependencies beyond coreutils and the shells/binaries it is probing for.

set -uo pipefail   # deliberately NOT -e: every probe is expected to fail sometimes.

# Minimum Node major. Matches the root package.json `engines.node: ">=24"` — this is a
# copy of that value, so bump both together if the workspace moves.
readonly NODE_MIN_MAJOR=24

# Colour only when stdout is a terminal; captured output should stay plain.
if [ -t 1 ]; then
  BOLD=$'\033[1m'; RED=$'\033[31m'; YELLOW=$'\033[33m'; GREEN=$'\033[32m'; OFF=$'\033[0m'
else
  BOLD=''; RED=''; YELLOW=''; GREEN=''; OFF=''
fi

hard_missing=0
soft_missing=0

say_ok()   { printf '  %sok%s      %-10s %s\n' "$GREEN" "$OFF" "$1" "$2"; }
say_hard() { printf '  %sMISSING%s %-10s %s\n' "$RED" "$OFF" "$1" "$2"; hard_missing=$((hard_missing + 1)); }
say_soft() { printf '  %swarn%s    %-10s %s\n' "$YELLOW" "$OFF" "$1" "$2"; soft_missing=$((soft_missing + 1)); }

printf '%sRequired for local bring-up (Phase 3)%s\n' "$BOLD" "$OFF"

# --- node ------------------------------------------------------------------
if command -v node >/dev/null 2>&1; then
  node_version="$(node --version 2>/dev/null)"          # e.g. v24.4.0
  node_major="${node_version#v}"; node_major="${node_major%%.*}"
  if [ -n "$node_major" ] && [ "$node_major" -ge "$NODE_MIN_MAJOR" ] 2>/dev/null; then
    say_ok node "$node_version"
  else
    say_hard node "$node_version is below the required >=${NODE_MIN_MAJOR} — install via nvm: nvm install ${NODE_MIN_MAJOR}"
  fi
else
  say_hard node "not on PATH — https://nodejs.org or: nvm install ${NODE_MIN_MAJOR}"
fi

# --- pnpm ------------------------------------------------------------------
# packageManager pins the version; corepack is the supported way to honour that pin.
if command -v pnpm >/dev/null 2>&1; then
  say_ok pnpm "$(pnpm --version 2>/dev/null)"
else
  say_hard pnpm "not on PATH — enable it with: corepack enable pnpm"
fi

# --- docker ----------------------------------------------------------------
# Two separate failures hide behind "docker": the CLI missing, and the daemon not
# running. They have different fixes, so they get different messages.
if command -v docker >/dev/null 2>&1; then
  if docker info --format '{{.ServerVersion}}' >/dev/null 2>&1; then
    say_ok docker "$(docker info --format '{{.ServerVersion}}' 2>/dev/null) (daemon up)"
    # `docker compose` is a plugin, not the binary — probe it separately.
    if docker compose version >/dev/null 2>&1; then
      say_ok compose "$(docker compose version --short 2>/dev/null)"
    else
      say_hard compose "the compose plugin is not installed — https://docs.docker.com/compose/install/"
    fi
  else
    say_hard docker "installed but the daemon is not reachable — start Docker Desktop, or: sudo systemctl start docker"
  fi
else
  say_hard docker "not on PATH — https://docs.docker.com/get-docker/"
fi

printf '\n%sRequired only for cloud provisioning (Phase 4) — safe to skip%s\n' "$BOLD" "$OFF"

# --- git -------------------------------------------------------------------
# Soft, not hard: a tarball download has no .git, and everything but the rename script
# still works. rename.mjs enumerates files with `git grep`, so it needs this.
if command -v git >/dev/null 2>&1; then
  say_ok git "$(git --version 2>/dev/null | awk '{print $3}')"
else
  say_soft git "not on PATH — rename.mjs enumerates files with git grep and cannot run without it"
fi

# --- openssl ---------------------------------------------------------------
# Only used to mint BETTER_AUTH_SECRET. Node's crypto does the same job, so a miss is a
# warning with the substitute spelled out rather than a blocker.
if command -v openssl >/dev/null 2>&1; then
  say_ok openssl "$(openssl version 2>/dev/null | awk '{print $2}')"
else
  say_soft openssl "absent — generate the auth secret with: node -e \"console.log(require('node:crypto').randomBytes(32).toString('base64'))\""
fi

# --- wrangler / stripe / neonctl -------------------------------------------
# wrangler and neonctl are routinely run through npx, so "not installed" is not the same
# as "unusable" — the hint names the npx form the rest of the skill uses.
if command -v wrangler >/dev/null 2>&1; then
  say_ok wrangler "$(wrangler --version 2>/dev/null | tail -1)"
else
  say_soft wrangler "not global — use: npx wrangler@4  (or: pnpm add -g wrangler)"
fi

if command -v neonctl >/dev/null 2>&1; then
  say_ok neonctl "$(neonctl --version 2>/dev/null)"
else
  say_soft neonctl "not global — use: npx neonctl@latest"
fi

# The Stripe CLI has no npx form; it is a Go binary and must actually be installed.
if command -v stripe >/dev/null 2>&1; then
  say_ok stripe "$(stripe --version 2>/dev/null | awk '{print $NF}')"
else
  say_soft stripe "not installed — https://docs.stripe.com/stripe-cli#install (no npx equivalent)"
fi

printf '\n'
if [ "$hard_missing" -gt 0 ]; then
  printf '%s%d required tool(s) missing.%s Local bring-up cannot start until they are installed.\n' \
    "$RED" "$hard_missing" "$OFF"
  exit 1
fi

if [ "$soft_missing" -gt 0 ]; then
  printf '%sLocal bring-up can proceed.%s %d cloud tool(s) missing — install them only if you provision (Phase 4).\n' \
    "$GREEN" "$OFF" "$soft_missing"
else
  printf '%sAll tools present.%s\n' "$GREEN" "$OFF"
fi
exit 0
