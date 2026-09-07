#!/usr/bin/env bash
# Report how far /setup has already got, so a rerun resumes instead of starting over.
#
# There is no state file, deliberately. Every row below is derived from what is actually
# on disk or actually running, because a state file and the repo can disagree — someone
# edits an .env by hand, a rename is reverted, a container is pruned — and when they
# disagree the file is the one that lies. Probing costs a few milliseconds and cannot
# drift.
#
# Two blocks, matching preflight.sh's two scopes: DEVELOPMENT (Phases 2-3) and
# PRODUCTION (Phase 4). Each row is done / todo / n/a, and the machine-readable SUMMARY
# line at the end is what the skill branches on when deciding which phase to offer.
#
# Secrets are never printed. A row says "set", "placeholder" or "missing" and nothing
# more — this output goes into a transcript.
#
# Usage: state.sh [--scope development|production|all]   (default: all)

set -uo pipefail

cd "$(dirname "$0")/../../../.." || exit 1     # scripts/ -> setup/ -> skills/ -> .claude/ -> repo root

# The literal token this scaffold ships under — never the current clone's name. rename.mjs
# excludes this file from its rewrite sweep (its NEVER_TOUCH set) for exactly this reason:
# a plain sed-style rename would overwrite this constant with the new name too, and the
# checks below would then always match and misreport a correctly renamed clone as todo.
readonly TEMPLATE_NAME=web-app-scaffold

scope=all
while [ $# -gt 0 ]; do
  case "$1" in
    --scope) scope="${2:-all}"; shift 2 ;;
    --scope=*) scope="${1#--scope=}"; shift ;;
    -h|--help) sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) printf 'unknown argument: %s\n' "$1" >&2; exit 64 ;;
  esac
done
case "$scope" in
  development|production|all) ;;
  *) printf 'unknown --scope %s (want: development, production, all)\n' "$scope" >&2; exit 64 ;;
esac

if [ -t 1 ]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; OFF=$'\033[0m'
else
  BOLD=''; DIM=''; GREEN=''; YELLOW=''; OFF=''
fi

dev_done=0; dev_todo=0; prod_done=0; prod_todo=0
section=development

row_done() { printf '  %sdone%s  %-22s %s\n' "$GREEN" "$OFF" "$1" "$2"
  if [ "$section" = development ]; then dev_done=$((dev_done+1)); else prod_done=$((prod_done+1)); fi; }
row_todo() { printf '  %stodo%s  %-22s %s\n' "$YELLOW" "$OFF" "$1" "$2"
  if [ "$section" = development ]; then dev_todo=$((dev_todo+1)); else prod_todo=$((prod_todo+1)); fi; }

# Read one key out of a dotenv file. Prints nothing (and returns 1) if the file or the
# key is absent, so callers can test with [ -n ... ] and not care which it was.
envval() {
  [ -f "$1" ] || return 1
  sed -n "s/^[[:space:]]*$2=//p" "$1" | tail -1 | sed 's/^"//; s/"$//'
}

# A dotenv value that is still the committed dummy is worse than an absent one: it looks
# configured and fails at the first real call. Every .env.example placeholder in this
# repo carries the same tell.
is_placeholder() { case "$1" in *dev_only_not_a_real*|*"dev-only-not-a-real"*) return 0 ;; *) return 1 ;; esac; }

# One JSON-ish string value out of wrangler.jsonc. jq is not a dependency of this repo
# and jsonc is not JSON anyway (trailing commas, comments), so this reads the literal.
jsonc_val() { sed -n "s/.*\"$2\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" "$1" | head -1; }

project_name="$(sed -n 's/^[[:space:]]*"name":[[:space:]]*"\([^"]*\)".*/\1/p' package.json | head -1)"

# ---------------------------------------------------------------------------
# Development — Phases 2 and 3
# ---------------------------------------------------------------------------
if [ "$scope" = development ] || [ "$scope" = all ]; then
  section=development
  printf '%sDEVELOPMENT%s %s— Phases 2-3%s\n' "$BOLD" "$OFF" "$DIM" "$OFF"

  # --- the rename ----------------------------------------------------------
  if [ "$project_name" = "$TEMPLATE_NAME" ]; then
    row_todo "project name" "still \"$TEMPLATE_NAME\" — Phase 2 renames it"
  else
    row_done "project name" "$project_name"
  fi

  # --- the repository ------------------------------------------------------
  # Origin still on the scaffold is the one state here that can destroy someone else's
  # work: in a workshop the attendee has push rights, so the first push overwrites the
  # template. Worth a row of its own even though it is not strictly setup progress.
  origin="$(git remote get-url origin 2>/dev/null)"
  if [ -z "$origin" ]; then
    row_done "git origin" "none — nothing to push at by accident"
  elif printf '%s' "$origin" | grep -q "$TEMPLATE_NAME"; then
    row_todo "git origin" "still the scaffold ($origin) — Phase 2 detaches it"
  else
    row_done "git origin" "$origin"
  fi

  [ -d node_modules ] && row_done "dependencies" "node_modules present" \
                      || row_todo "dependencies" "run: pnpm install"

  # --- env files -----------------------------------------------------------
  missing_env=""
  for f in apps/graphql/.env.development apps/web/.env.development packages/db/.env.development; do
    [ -f "$f" ] || missing_env="$missing_env $f"
  done
  if [ -z "$missing_env" ]; then
    row_done "env files" "all three .env.development exist"
  else
    row_todo "env files" "missing:$missing_env — copy from each .env.example"
  fi

  # --- DATABASE_URL --------------------------------------------------------
  # Port 5434 and the renamed database are the two things people get wrong here, and
  # both fail at migrate time with a message about neither.
  db_url="$(envval packages/db/.env.development DATABASE_URL)"
  if [ -z "$db_url" ]; then
    row_todo "DATABASE_URL" "unset in packages/db/.env.development"
  elif ! printf '%s' "$db_url" | grep -q ':5434/'; then
    row_todo "DATABASE_URL" "set but not on port 5434 — docker-compose maps 5434:5432"
  elif ! printf '%s' "$db_url" | grep -q "/$project_name\$"; then
    row_todo "DATABASE_URL" "set but the database is not \"$project_name\" — the rename changed POSTGRES_DB"
  else
    row_done "DATABASE_URL" "localhost:5434/$project_name"
  fi

  # --- the four development secrets ---------------------------------------
  # Values are never printed; a row says only which of the three states it is in.
  check_secret() {  # label, file, key, hint
    v="$(envval "$2" "$3")"
    if [ -z "$v" ]; then row_todo "$1" "unset in $2 — $4"
    elif is_placeholder "$v"; then row_todo "$1" "still the committed placeholder — $4"
    else row_done "$1" "set"; fi
  }
  check_secret "BETTER_AUTH_SECRET" apps/graphql/.env.development BETTER_AUTH_SECRET "openssl rand -base64 32"
  check_secret "STRIPE_SECRET_KEY"  apps/graphql/.env.development STRIPE_SECRET_KEY  "the resolved Stripe project's TEST key"
  check_secret "STRIPE_WEBHOOK_SECRET" apps/graphql/.env.development STRIPE_WEBHOOK_SECRET "from: stripe listen --print-secret"
  check_secret "STRIPE publishable" apps/web/.env.development NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY "the pk_test_ matching that same project"
  check_secret "RESEND_API_KEY"     apps/graphql/.env.development RESEND_API_KEY    "https://resend.com/api-keys"

  # A live key in a development file is the same hard stop as anywhere else, and this is
  # the cheapest place to notice it.
  sk="$(envval apps/graphql/.env.development STRIPE_SECRET_KEY)"
  case "$sk" in sk_live_*) row_todo "STRIPE key mode" "a LIVE key is in .env.development — stop and replace it with sk_test_" ;; esac

  mail_to="$(envval apps/graphql/.env.development MAIL_TEST_RECIPIENTS)"
  [ -n "$mail_to" ] && row_done "MAIL_TEST_RECIPIENTS" "set — mail has somewhere to go" \
                    || row_todo "MAIL_TEST_RECIPIENTS" "blank — src/mail.ts refuses every recipient"

  # --- Postgres ------------------------------------------------------------
  # `ps --status running` rather than `ps -q`: a stopped container still has an id.
  if docker compose ps --status running --services 2>/dev/null | grep -qx postgres; then
    row_done "postgres" "container running on 5434"
    # Any table in `public` means drizzle-kit has been through. Cheaper and more robust
    # than reading drizzle's own bookkeeping table, whose schema is drizzle's business.
    tables="$(docker compose exec -T postgres psql -U postgres -d "$project_name" -tAc \
      "select count(*) from information_schema.tables where table_schema='public'" 2>/dev/null | tr -d '[:space:]')"
    if [ -n "$tables" ] && [ "$tables" -gt 0 ] 2>/dev/null; then
      row_done "migrations" "$tables table(s) in public"
    else
      row_todo "migrations" "database reachable but empty — pnpm --filter @$project_name/db migrate"
    fi
  else
    row_todo "postgres" "not running — docker compose up -d --wait"
  fi

  printf '\n'
fi

# ---------------------------------------------------------------------------
# Production — Phase 4
# ---------------------------------------------------------------------------
if [ "$scope" = production ] || [ "$scope" = all ]; then
  section=production
  printf '%sPRODUCTION%s %s— Phase 4. Every row here is derived from a resource that must exist first.%s\n' \
    "$BOLD" "$OFF" "$DIM" "$OFF"

  wj=apps/graphql/wrangler.jsonc

  hid="$(jsonc_val "$wj" id)"
  [ -n "$hid" ] && row_done "hyperdrive id" "$hid" \
                || row_todo "hyperdrive id" "empty — from: wrangler hyperdrive create (step 2)"

  cors="$(jsonc_val "$wj" CORS_ORIGINS)"
  [ -n "$cors" ] && row_done "CORS_ORIGINS" "$cors" \
                 || row_todo "CORS_ORIGINS" "empty — the WEB Worker's URL, learned at step 4"

  weborigin="$(jsonc_val "$wj" WEB_ORIGIN)"
  [ -n "$weborigin" ] && row_done "WEB_ORIGIN" "$weborigin" \
                      || row_todo "WEB_ORIGIN" "empty — requireEnv throws at the auth endpoints"

  wmail="$(jsonc_val "$wj" MAIL_TEST_RECIPIENTS)"
  [ -n "$wmail" ] && row_done "MAIL_TEST_RECIPIENTS" "set in wrangler.jsonc" \
                  || row_todo "MAIL_TEST_RECIPIENTS" "empty in wrangler.jsonc — reuse the Phase 3 answer"

  # A service binding does not resolve across accounts, so these two agreeing is a
  # requirement and not a convention.
  acc_api="$(envval apps/graphql/.env.production CLOUDFLARE_ACCOUNT_ID)"
  acc_web="$(envval apps/web/.env.production CLOUDFLARE_ACCOUNT_ID)"
  if [ -z "$acc_api" ] || [ -z "$acc_web" ]; then
    row_todo "CLOUDFLARE_ACCOUNT_ID" "not set in both .env.production files"
  elif [ "$acc_api" != "$acc_web" ]; then
    row_todo "CLOUDFLARE_ACCOUNT_ID" "the two .env.production files name DIFFERENT accounts — the API service binding cannot resolve"
  else
    row_done "CLOUDFLARE_ACCOUNT_ID" "$acc_api, same in both"
  fi

  # Deployed Workers and the four wrangler secrets are not probed: both need an
  # authenticated wrangler and a chosen account, which is the skill's account gate.
  # Guessing at them here would be the exact silent-default failure that gate exists for.
  printf '  %s  -   %-22s %s%s\n' "$DIM" "deployed Workers" "not probed — needs an authenticated wrangler and a confirmed account" "$OFF"
  printf '  %s  -   %-22s %s%s\n' "$DIM" "wrangler secrets" "not probed — Cloudflare does not read them back" "$OFF"

  printf '\n'
fi

# ---------------------------------------------------------------------------
# Verdict
# ---------------------------------------------------------------------------
verdict() {  # done, todo -> not-started | partial | complete
  if [ "$1" -eq 0 ]; then printf 'not-started'
  elif [ "$2" -eq 0 ]; then printf 'complete'
  else printf 'partial'; fi
}
dev_state=unknown; prod_state=unknown
[ "$scope" = development ] || [ "$scope" = all ] && dev_state="$(verdict "$dev_done" "$dev_todo")"
[ "$scope" = production ]  || [ "$scope" = all ] && prod_state="$(verdict "$prod_done" "$prod_todo")"

if [ "$scope" = development ] || [ "$scope" = all ]; then
  printf 'Development: %s (%d done, %d to do)\n' "$dev_state" "$dev_done" "$dev_todo"
fi
if [ "$scope" = production ] || [ "$scope" = all ]; then
  printf 'Production:  %s (%d done, %d to do)\n' "$prod_state" "$prod_done" "$prod_todo"
fi
printf 'SUMMARY development=%s production=%s\n' "$dev_state" "$prod_state"
exit 0
