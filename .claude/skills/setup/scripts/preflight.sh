#!/usr/bin/env bash
# Probe everything /setup can reach for, and report it as two tables: what a working
# DEVELOPMENT environment needs, and what a PRODUCTION deploy needs on top.
#
# The split is development vs production, NOT local vs cloud — and that distinction is
# the whole point of this script. A development environment that only has Docker is not
# a working one: Stripe Checkout will not mount without a real `pk_test_`/`sk_test_`
# pair, the webhook route cannot verify a signature without the `whsec_` that
# `stripe listen` prints, and mail cannot actually be delivered without a Resend key. So
# a Stripe account and a Resend account are DEVELOPMENT requirements here, sitting
# beside node and docker, even though both live in someone's cloud. Neither costs money:
# Stripe test mode charges nothing and Resend's free tier sends to the account owner.
#
# What is genuinely production-only is the part that can charge money or be reached by
# strangers: Neon, Hyperdrive, deployed Workers, a deployed webhook endpoint.
#
# Three statuses, and they mean different things to the caller:
#   ok      probed and present
#   MISSING probed, absent, and blocks the scope it sits in
#   you     cannot be probed from a shell — a human has to confirm or do it
#   warn    absent but optional; the row names the substitute
#
# Exit code is about DEVELOPMENT only: non-zero means the development table has a
# MISSING row and Phase 3 cannot start. Production gaps never fail the exit code,
# because a rerun of /setup is the supported way to add production later.
#
# Usage: preflight.sh [--scope development|production|all]   (default: all)
#
# No dependencies beyond coreutils and the binaries it is probing for.

set -uo pipefail   # deliberately NOT -e: every probe is expected to fail sometimes.

# Minimum Node major. Matches the root package.json `engines.node: ">=24"` — this is a
# copy of that value, so bump both together if the workspace moves.
readonly NODE_MIN_MAJOR=24

scope=all
while [ $# -gt 0 ]; do
  case "$1" in
    --scope) scope="${2:-all}"; shift 2 ;;
    --scope=*) scope="${1#--scope=}"; shift ;;
    -h|--help) sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) printf 'unknown argument: %s\n' "$1" >&2; exit 64 ;;
  esac
done
case "$scope" in
  development|production|all) ;;
  *) printf 'unknown --scope %s (want: development, production, all)\n' "$scope" >&2; exit 64 ;;
esac

# Colour only when stdout is a terminal; captured output should stay plain.
if [ -t 1 ]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'; YELLOW=$'\033[33m'
  GREEN=$'\033[32m'; BLUE=$'\033[34m'; OFF=$'\033[0m'
else
  BOLD=''; DIM=''; RED=''; YELLOW=''; GREEN=''; BLUE=''; OFF=''
fi

dev_missing=0
prod_missing=0
manual=0

# Which table is being printed right now, so the row helpers know which counter a
# MISSING belongs to without every caller having to say.
section=development

row_ok()   { printf '  %sok%s       %-12s %s\n' "$GREEN" "$OFF" "$1" "$2"; }
row_warn() { printf '  %swarn%s     %-12s %s\n' "$YELLOW" "$OFF" "$1" "$2"; }
row_you()  { printf '  %syou%s      %-12s %s\n' "$BLUE" "$OFF" "$1" "$2"; manual=$((manual + 1)); }
row_bad()  {
  printf '  %sMISSING%s  %-12s %s\n' "$RED" "$OFF" "$1" "$2"
  if [ "$section" = development ]; then dev_missing=$((dev_missing + 1)); else prod_missing=$((prod_missing + 1)); fi
}

# Auth probes hit the network. `timeout` is coreutils and not on every machine (notably
# a bare macOS), so fall back to running the command unguarded rather than failing.
if command -v timeout >/dev/null 2>&1; then
  guard() { timeout 15 "$@"; }
else
  guard() { "$@"; }
fi

# ---------------------------------------------------------------------------
# Development
# ---------------------------------------------------------------------------
if [ "$scope" = development ] || [ "$scope" = all ]; then
  section=development
  printf '%sDEVELOPMENT%s  %s— to run and genuinely test this app on your machine%s\n' \
    "$BOLD" "$OFF" "$DIM" "$OFF"
  printf '%s  status   requirement  what it is for, or how to get it%s\n' "$DIM" "$OFF"

  # --- node ----------------------------------------------------------------
  if command -v node >/dev/null 2>&1; then
    node_version="$(node --version 2>/dev/null)"          # e.g. v24.4.0
    node_major="${node_version#v}"; node_major="${node_major%%.*}"
    if [ -n "$node_major" ] && [ "$node_major" -ge "$NODE_MIN_MAJOR" ] 2>/dev/null; then
      row_ok node "$node_version"
    else
      row_bad node "$node_version is below the required >=${NODE_MIN_MAJOR} — nvm install ${NODE_MIN_MAJOR}"
    fi
  else
    row_bad node "not on PATH — https://nodejs.org, or: nvm install ${NODE_MIN_MAJOR}"
  fi

  # --- pnpm ----------------------------------------------------------------
  # packageManager pins the version; corepack is the supported way to honour that pin.
  if command -v pnpm >/dev/null 2>&1; then
    row_ok pnpm "$(pnpm --version 2>/dev/null)"
  else
    row_bad pnpm "not on PATH — enable it with: corepack enable pnpm"
  fi

  # --- docker --------------------------------------------------------------
  # Two separate failures hide behind "docker": the CLI missing, and the daemon not
  # running. They have different fixes, so they get different messages.
  if command -v docker >/dev/null 2>&1; then
    if docker info --format '{{.ServerVersion}}' >/dev/null 2>&1; then
      row_ok docker "$(docker info --format '{{.ServerVersion}}' 2>/dev/null) (daemon up) — Postgres runs here"
      # `docker compose` is a plugin, not the binary — probe it separately.
      if docker compose version >/dev/null 2>&1; then
        row_ok compose "$(docker compose version --short 2>/dev/null)"
      else
        row_bad compose "the compose plugin is not installed — https://docs.docker.com/compose/install/"
      fi
    else
      row_bad docker "installed but the daemon is not reachable — start Docker Desktop, or: sudo systemctl start docker"
    fi
  else
    row_bad docker "not on PATH — https://docs.docker.com/get-docker/"
  fi

  # --- git -----------------------------------------------------------------
  # Required rather than optional because the rename is not optional, and rename.mjs
  # enumerates the files it rewrites with `git grep`.
  if command -v git >/dev/null 2>&1; then
    row_ok git "$(git --version 2>/dev/null | awk '{print $3}') — rename.mjs finds files with git grep"
  else
    row_bad git "not on PATH — the rename step cannot run without it"
  fi

  # --- stripe CLI ----------------------------------------------------------
  # A development requirement, not a production one: `stripe listen` is the only source
  # of the local STRIPE_WEBHOOK_SECRET, and without it the webhook route rejects every
  # event as a bad signature. It is a Go binary — there is no npx form to fall back to.
  if command -v stripe >/dev/null 2>&1; then
    row_ok stripe "$(stripe --version 2>/dev/null | awk '{print $NF}') — 'stripe listen' prints the local whsec_"
  else
    row_bad stripe "not installed — https://docs.stripe.com/stripe-cli#install (no npx equivalent)"
  fi

  # --- Stripe account ------------------------------------------------------
  # The CLI stores accounts as named projects; presence of the config proves a login
  # happened but NOT that the right project is selected, and never that it is test mode.
  # Both of those are the skill's account gate, not this script's call to make.
  stripe_config="${XDG_CONFIG_HOME:-$HOME/.config}/stripe/config.toml"
  if [ -f "$stripe_config" ]; then
    stripe_projects="$(grep -c '^\[' "$stripe_config" 2>/dev/null || echo 0)"
    row_you "stripe acct" "${stripe_projects} project(s) configured — /setup will confirm which one, and that it is test mode"
  else
    row_bad "stripe acct" "no CLI login — sign up at https://dashboard.stripe.com/register, then: stripe login"
  fi

  # --- Resend account ------------------------------------------------------
  # Unprobeable by design: the key lives in a gitignored .env, and Resend has no API for
  # creating keys. Listed anyway so nobody discovers halfway through that mail is dead.
  row_you "resend acct" "free account + an API key from https://resend.com/api-keys (Phase 5 opens it for you)"

  # --- Chrome + the extension ----------------------------------------------
  # /setup drives the browser for every signup, login and key, so this is a development
  # requirement now, not a nicety. Only half of it is probeable: a Chrome binary can be
  # found, but whether the extension is installed and permissioned for the five vendor
  # domains is a question for the user — the skill cannot grant a site permission.
  chrome_found=""
  for c in google-chrome google-chrome-stable chromium chromium-browser; do
    command -v "$c" >/dev/null 2>&1 && { chrome_found="$c"; break; }
  done
  # macOS installs an .app rather than something on PATH.
  [ -z "$chrome_found" ] && [ -d "/Applications/Google Chrome.app" ] && chrome_found="Google Chrome.app"
  if [ -n "$chrome_found" ]; then
    row_you chrome "$chrome_found — /setup needs the Claude extension permissioned for stripe, resend, neon, cloudflare, github"
  else
    row_you chrome "no Chrome found — /setup drives it for signups and keys; without it you paste each value by hand"
  fi

  # --- the clipboard relay --------------------------------------------------
  # How a key gets from a vendor's dashboard into an env file without the model reading
  # it: click the page's Copy button, then pipe the clipboard straight into the file.
  # clipboard.sh knows the per-OS backends; asking it is better than duplicating that
  # detection here. A miss is a warning, not a block — the fallbacks still work.
  clip_check="$(bash "$(dirname "$0")/clipboard.sh" --check 2>&1)"
  if [ $? -eq 0 ]; then
    row_ok clipboard "${clip_check#ok } — keys can go from the browser to a file without passing through the model"
  else
    row_warn clipboard "${clip_check#unavailable — } — /setup will read keys with read_page instead, or you paste them"
  fi

  # --- openssl -------------------------------------------------------------
  # Only used to mint BETTER_AUTH_SECRET. Node's crypto does the same job, so a miss is
  # a warning with the substitute spelled out rather than a blocker.
  if command -v openssl >/dev/null 2>&1; then
    row_ok openssl "$(openssl version 2>/dev/null | awk '{print $2}') — mints BETTER_AUTH_SECRET"
  else
    row_warn openssl "absent — use: node -e \"console.log(require('node:crypto').randomBytes(32).toString('base64'))\""
  fi

  printf '\n'
fi

# ---------------------------------------------------------------------------
# Production
# ---------------------------------------------------------------------------
if [ "$scope" = production ] || [ "$scope" = all ]; then
  section=production
  printf '%sPRODUCTION%s   %s— on top of the above, to deploy it where strangers can reach it%s\n' \
    "$BOLD" "$OFF" "$DIM" "$OFF"
  printf '%s  status   requirement  what it is for, or how to get it%s\n' "$DIM" "$OFF"

  # --- wrangler ------------------------------------------------------------
  # wrangler and neonctl are routinely run through npx, so "not installed globally" is
  # not the same as "unusable" — the hint names the npx form the rest of the skill uses.
  if command -v wrangler >/dev/null 2>&1; then
    row_ok wrangler "$(wrangler --version 2>/dev/null | tail -1)"
    if guard wrangler whoami >/dev/null 2>&1; then
      wrangler_email="$(guard wrangler whoami 2>/dev/null | grep -oE '[[:alnum:]._%+-]+@[[:alnum:].-]+' | head -1)"
      row_you cloudflare "signed in as ${wrangler_email:-unknown} — /setup will confirm WHICH account before deploying"
    else
      row_bad cloudflare "wrangler is not authenticated — run: wrangler login"
    fi
  else
    row_warn wrangler "not global — the skill uses: npx wrangler@4  (or: pnpm add -g wrangler)"
    row_you cloudflare "account + login not verified (no global wrangler) — run: npx wrangler@4 login"
  fi

  # --- neon ----------------------------------------------------------------
  # `neonctl auth` opens a browser consent screen; there is no quiet probe worth
  # trusting here, so the account row is a human one either way.
  if command -v neonctl >/dev/null 2>&1; then
    row_ok neonctl "$(neonctl --version 2>/dev/null)"
  else
    row_warn neonctl "not global — the skill uses: npx neonctl@latest"
  fi
  row_you neon "free Postgres project at https://neon.tech — the deployed database"

  # --- gh ------------------------------------------------------------------
  # Optional: only Phase 2 uses it, and only to hand the user a repository of their own.
  # Detaching from the template is plain git and needs nothing.
  if command -v gh >/dev/null 2>&1; then
    if gh auth status >/dev/null 2>&1; then
      row_ok gh "$(gh --version 2>/dev/null | head -1 | awk '{print $3}') (authenticated)"
    else
      row_warn gh "installed but not logged in — run: gh auth login (only to create your own repo)"
    fi
  else
    row_warn gh "not on PATH — https://cli.github.com (only to create your own repo)"
  fi

  printf '\n'
fi

# ---------------------------------------------------------------------------
# Verdict — human lines, then one machine-readable line the skill branches on.
# ---------------------------------------------------------------------------
# A scope that was not probed reports `unknown`, never `ready` — the caller must not read
# an absent table as a clean one.
dev_state=unknown
prod_state=unknown
if [ "$scope" = development ] || [ "$scope" = all ]; then
  dev_state=ready; [ "$dev_missing" -gt 0 ] && dev_state=blocked
fi
if [ "$scope" = production ] || [ "$scope" = all ]; then
  prod_state=ready; [ "$prod_missing" -gt 0 ] && prod_state=gaps
fi

if [ "$scope" = development ] || [ "$scope" = all ]; then
  if [ "$dev_missing" -gt 0 ]; then
    printf '%s%d development requirement(s) missing.%s Install them before Phase 3 — the fix is on each row.\n' \
      "$RED" "$dev_missing" "$OFF"
  else
    printf '%sDevelopment is ready to set up.%s\n' "$GREEN" "$OFF"
  fi
fi
if [ "$scope" = production ] || [ "$scope" = all ]; then
  if [ "$prod_missing" -gt 0 ]; then
    printf '%s%d production requirement(s) missing.%s These block a deploy only — development is unaffected, and you can rerun /setup for production later.\n' \
      "$YELLOW" "$prod_missing" "$OFF"
  fi
fi
if [ "$manual" -gt 0 ]; then
  printf '%s%d row(s) marked "you"%s cannot be checked from a shell — /setup will walk you through each one.\n' \
    "$BLUE" "$manual" "$OFF"
fi

printf 'SUMMARY development=%s production=%s manual=%d\n' "$dev_state" "$prod_state" "$manual"
[ "$dev_missing" -gt 0 ] && exit 1
exit 0
