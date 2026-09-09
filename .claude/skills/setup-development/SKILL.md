---
name: setup-development
description: Turn a fresh clone of this scaffold into the user's own project in their own accounts, and stand up a complete local development environment — rename it off the template name, then drive Chrome to sign in to each vendor and collect the keys for Docker Postgres, Stripe test mode and Resend. Use when someone says set up this project, configure my clone, make this scaffold mine, or get this running locally. Never provisions production infrastructure or touches real money — that is the separate `setup-production` skill, run once development here is complete. Invoked as /setup-development.
---

# setup-development — making this clone yours, and running it locally

This repo is a **scaffold**, and it carries nobody's accounts. Every account-coupled value
— origins, a contact inbox — ships as an **empty string** or a committed placeholder,
fail-closed by design, so a clone can never talk to the template author's resources.
`/setup-development` renames what a rename can fix, **asks** for what only the user knows,
and **derives** the rest from the resources it provisions.

## Development still needs real accounts

A development environment needs third-party accounts too, not just node and docker:

- **Stripe test mode.** Embedded Checkout will not mount without a real `pk_test_`, the
  resolver cannot create a session without a real `sk_test_`, and `/stripe/webhook`
  rejects every event as a bad signature without the `whsec_` that `stripe listen` prints.
- **Resend.** With `MAIL_TRANSPORT=log` mail renders to a log and is never delivered, so
  magic-link sign-in cannot be exercised end to end.

Neither costs anything — test mode charges nothing, Resend's free tier delivers to the
account owner. Nothing this skill does is reachable by a stranger or can charge a real
card: that part — Neon, Hyperdrive, deployed Workers, a deployed webhook endpoint, and the
four `wrangler secret`s — is the `setup-production` skill, run separately, once this one is
complete.

Per-service commands, flags and account-resolution recipes for the vendors this skill
touches: `reference/services.md` in `setup-production` also documents Stripe and Resend, in
addition to the production-only services. The browser playbook, which most of the steps
below run through: `reference/browser.md`.

## Drive the browser; do not read instructions aloud

Every step a person would otherwise do in a tab — signing up, signing in, approving an
OAuth screen, copying a key off a dashboard — you do with the `mcp__claude-in-chrome`
tools. Handing the user a URL and a list of clicks is the fallback, not the plan.

What stays on the CLI is narrow: `stripe listen`, `pnpm`, `docker` and `git`. A command
checked live against a real account beats clicking through a console that redesigns
itself. Everything else is the browser's.

Three things to settle in Phase 1, before any of it starts:

- **Site permissions are the user's to grant and you cannot.** Ask once for the two
  domains this skill needs: `dashboard.stripe.com` and `resend.com`.
- **Keys move by clipboard relay, not by reading them.** Click the page's own Copy button,
  then pipe the clipboard into the file:
  `clipboard.sh --paste --expect re_ >> …`. The value goes browser → clipboard → file and
  never enters the model's context. `preflight.sh` reports whether the relay works here;
  it needs the browser and the shell on the same machine, so an ssh or web session falls
  back to `read_page` (the model sees the key) or to the user pasting. Say which one is in
  play, once, and honour it for the whole run.
- **A key goes into its destination file and nowhere else.** Never into a reply, a summary,
  a commit message or a filename. Confirm by shape — `clipboard.sh --shape` prints
  "36 chars, starts `re_a`" — never by value, then `--clear`.

Signup forms, payment details, email verification and MFA stay the user's own: drive them
to the page, say what to do, and wait.

## The one rule that outranks the phase order

**Before the first create in any service, resolve the concrete account, print it, and get
an explicit yes.** Never accept a CLI's default silently.

| Service | Resolve with                       | Show the user                          |
| ------- | ---------------------------------- | -------------------------------------- |
| Stripe  | `cat ~/.config/stripe/config.toml` | project name + whether it is live-mode |
| Resend  | the signed-in avatar on resend.com | the account email                      |

On the machine this skill was built against, the Stripe CLI defaulted to the _wrong_
account, and one configured Stripe project holds a **live-mode** key. A wrong Stripe
default charges a real card and does not error. **A live-mode project is a hard stop here
— always.** This skill never has a reason to touch a live key; that only happens inside
`setup-production`'s own explicit "Stripe, live mode" step, gated separately.

## Phase 1 — preflight, state, and the browser

Two scripts, then one question. Run both; they answer different things.

```bash
bash .claude/skills/setup-development/scripts/preflight.sh --scope development   # what is INSTALLED
bash .claude/skills/setup-development/scripts/state.sh --scope development       # what is already DONE — resumable, no state file
```

`preflight.sh` prints a table, each row `ok` / `MISSING` / `warn` / `you`, and every row
carries its own fix. It **exits non-zero when a development requirement is missing**.

- **On a non-zero exit, stop.** Show the user the table as printed — it is already the
  requirement list with steps, so do not restate it in prose. Offer to install what is
  missing, and do not proceed on a hope that a tool appears later.
- Rows marked **`you`** are the ones a shell cannot check: whether a Stripe account exists
  and which project is right, and whether the user has a Resend key. Confirm each with the
  user before Phase 3 needs it.

`state.sh` derives progress from the repo and the running containers — there is no state
file, deliberately, because a file and the repo can disagree and the file is the one that
lies. Its `SUMMARY development=…` line is what you branch on: if it already reads
`complete`, say so and ask whether the user wants to redo anything, rather than starting
over. Otherwise resume at whatever it marks `todo`.

### And settle the browser, in the same breath

Ask in the same `AskUserQuestion` round, so the run is not interrupted later:

1. **Which connected browser is theirs.** `list_connected_browsers` first — this skill can
   run from a different machine than the one the user is looking at, and more than one
   Chrome can have the extension installed. Never take the default connection silently;
   see `reference/browser.md`'s "Before the first navigate" for the exact flow
   (`select_browser` or `switch_browser`, then name the chosen browser back to the user).
2. **Grant the extension the two vendor domains** listed above. Without them the first
   `navigate` fails and the fix is a click only the user can make.
3. **How the keys move.** Lead with what `preflight.sh`'s `clipboard` row already says.
   If the relay is available, there is no real choice to put in front of the user — it is
   strictly better (the key never enters the model's context) and preflight already proved
   it works on this machine. Do not add it as an `AskUserQuestion` option; just state it as
   a fact in your own message ("keys will move by clipboard relay — copy on the page, and
   the value goes straight into the file without me seeing it") and proceed. Only turn it
   into a real question when the relay is _not_ available: then the choice is genuine —
   `read_page`, which means each key passes through the model's context, or they paste each
   value themselves. State that trade-off in one sentence; do not editorialise, and do not
   decide for them.

If they decline the extension entirely, everything still works: fall back to naming the
page and the clicks, and let them paste each value. Say that the run will be slower and
that you cannot see whether a page matched what you described.

## Phase 2 — project identity

### First: whose repository is this?

Do this **before the rename**, because the rename ends in a commit and that commit must not
be aimed at someone else's repository. `git clone` leaves `origin` on the scaffold with
`main` tracking it, so the first `git push` afterwards targets the template. Usually that
fails on permissions — but in a workshop, where attendees are collaborators precisely so
they can read a private template, it **succeeds and overwrites the scaffold**.

```bash
git remote -v                 # is origin still the scaffold?
git log --oneline | wc -l     # how much of someone else's history came along
```

**Skip this step entirely when `origin` is already theirs** — `state.sh`'s `git origin` row
tells you which case you are in. A repo made with `gh repo create --template` (or "Use this
template") starts with one fresh commit and its own remote — there is nothing attached, and
unpicking it would be busywork.

**No `.git` at all is a third case, not a variant of the one above — act, don't ask.** It
happens when something deleted `.git` before this skill ran (a workshop's clone step, for
example). `state.sh` calls this out as its own `todo` row rather than folding it into "no
origin," because unlike that case there is genuinely nothing here yet: `rename.mjs` commits
as part of the rename and needs a clean tree to gate on, so a repo has to exist first. There
is also no real choice to put to the user — fresh vs. keep-history only differs by whether
scaffold commits survive, and none are present either way — so just run
`git init -b main && git add -A && git commit -m "Initial commit"` and continue; don't spend
an `AskUserQuestion` on it.

Otherwise ask, and **default to starting fresh** — offer it first and recommend it. This is
a new project, not a fork of the scaffold: the inherited commits are the scaffold's own build
log, authored by someone else, and they describe work the user did not do. `docs/setup` still
carries that story as files, so starting fresh loses the provenance from `git log` only, which
is where it was least useful. Keeping the history is the exception, worth choosing only when
the user actually intends to track the scaffold and merge its updates later.

| Choice                    | What it does                                                                      | Suits                                                                                        |
| ------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Start fresh** (default) | `rm -rf .git && git init -b main && git add -A && git commit -m "Initial commit"` | almost everyone: their own history, their own authorship, and no way to push at the template |
| Detach, keep history      | `git remote remove origin`                                                        | they mean to follow the scaffold and merge its later changes                                 |

`git init -b main` — **with the `-b`**. `init.defaultBranch` is unset on most machines, so a
bare `git init` names the branch `master`, and the new repo then disagrees with the scaffold's
docs, GitHub's default and every `origin/main` reference in this skill. The flag needs git
2.28+; on anything older, `git init && git branch -M main`.

Then offer them a remote of their own, which is also the safest way to make the old one
unreachable:

```bash
gh repo create <name> --private --source=. --remote=origin --push
```

If they want to pull scaffold updates later, add it back under a name that is not `origin`
and make it fetch-only, so no branch ever tracks it for push:

```bash
git remote add template https://github.com/<owner>/web-app-scaffold.git
git remote set-url --push template DISABLED
```

### Then: the name

**Ask the user.** Do not infer a name from the directory, the git remote, or anything else
— this is the one value the whole setup is named after and it must be a decision, not a
guess. Use `AskUserQuestion` or a plain question, and say what the constraints are: 2–47
characters, lowercase letters, digits and dashes, starting and ending alphanumeric. It has
to work as an npm scope (`@<name>/db`) **and** a Cloudflare Worker name.

```bash
node .claude/skills/setup-development/scripts/rename.mjs <name>            # dry run — prints the plan
node .claude/skills/setup-development/scripts/rename.mjs <name> --apply    # rewrites
```

Show the user the dry-run summary before applying. The script validates the name itself, so
a rejection is an answer to relay, not a thing to work around.

- **`docs/setup/` is renamed with the code, and that is not cosmetic.** It holds ~two thirds
  of the occurrences, and `node scripts/docs-check.mjs` reconciles those docs against the
  code. Rename the repo but not the docs and docs-check reports ~38 mismatches, which makes
  `pnpm verify` red for a reason several steps removed from the symptom. The script covers
  both; do not hand-edit a subset instead.
- **`pnpm-lock.yaml` is skipped on purpose.** It is regenerated by `pnpm install` in the
  next phase, never text-edited.
- The script refuses to run on a dirty tree (so `git diff` is the review and
  `git checkout .` is the undo), and refuses if the template token is already absent —
  a second run is a no-op, not a double rename.

Then `pnpm install` and `node scripts/docs-check.mjs`, and commit. Four values in
`apps/graphql/wrangler.jsonc` are deliberately **not** renamed, because they are accounts
and origins rather than names: they ship **empty** and get filled in, not rewritten from
someone else's values. `MAIL_FROM` still carries the project name and _is_ the rename's job.

### The four empty values in wrangler.jsonc

| Value                  | Comes from                                                              | Empty at runtime                                                                                                                                                     |
| ---------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MAIL_TEST_RECIPIENTS` | **Asked** — Phase 3 here, reused by `setup-production`                  | `src/mail.ts` refuses **every** recipient — silent, and the first thing a user hits testing mail                                                                     |
| `CORS_ORIGINS`         | **Derived** by `setup-production` — the web Worker's deploy URL         | `src/cors.ts` allows **no** origin — every browser request fails cross-origin                                                                                        |
| `WEB_ORIGIN`           | **Derived** by `setup-production` — the same URL                        | read via `requireEnv` (`src/env.ts`), which **throws** `Missing required environment variable: WEB_ORIGIN` at the auth endpoints — a named error, not a wrong answer |
| `hyperdrive[0].id`     | **Derived** by `setup-production` — `wrangler hyperdrive create` output | config still parses and `wrangler dev` does not care (it dials `localConnectionString`); only a real deploy needs a real id                                          |

Empty is **fail-closed on purpose**. Only the first row is a question for the user here —
never prompt for the other three, they belong to `setup-production` and are discovered
during that skill's provisioning, not this one's.

## Phase 3 — the development environment, complete

Nothing here is deployed and nothing costs money, but this phase is **not** account-free:
finishing it means Stripe test mode and Resend are really wired, not stubbed. This is the
phase that must always work, and the one users are entitled to stop at — this whole skill
never goes further than this.

### 3a — files

```bash
pnpm install
cp apps/graphql/.env.example apps/graphql/.env.development
cp apps/web/.env.example     apps/web/.env.development
cp packages/db/.env.example  packages/db/.env.development
```

Each `.env.example` is a **commented checklist with dummy values**, not a ready file — read
it and fix the values it describes rather than copying blind. Every `*_not_a_real_*` value
left in place is a landmine, which is why `state.sh` reports a placeholder as `todo` rather
than as set.

- `packages/db/.env.development` → `DATABASE_URL=postgres://postgres:postgres@localhost:5434/<name>`.
  Port **5434**, not 5432 (`docker-compose.yml` maps `5434:5432`), and the database name is
  the project name, because the rename changed `POSTGRES_DB` too.
- `apps/graphql/.env.development` → `BETTER_AUTH_SECRET`, from
  `openssl rand -base64 32`. Paste only the value; the generator's output is the whole line
  in some tools and the `KEY=` prefix ends up inside the secret.

### 3b — Stripe, test mode

Run the account gate first: `cat ~/.config/stripe/config.toml`, show the user the project
names, and get an explicit choice. **A live-mode project is a hard stop** — say so and ask.

`stripe login` stores a restricted key, not the secret key, so the two API keys come from
the dashboard rather than the CLI — drive it: `tabs_context_mcp`, a new tab on
`https://dashboard.stripe.com/test/apikeys`, `read_page`, and confirm the page says **test
mode** before touching anything on it. Then relay each key separately, straight into its
file:

```bash
{ printf 'STRIPE_SECRET_KEY='; bash .claude/skills/setup-development/scripts/clipboard.sh --paste --expect sk_test_; printf '\n'; } \
  >> apps/graphql/.env.development
```

`--expect sk_test_` is doing real work: it fails on a stale clipboard when the copy button
did not fire, and it fails on a **live** key before that key reaches a file.
`reference/browser.md` has the per-page detail.

| Key                                  | File                            | Note                                                        |
| ------------------------------------ | ------------------------------- | ----------------------------------------------------------- |
| `STRIPE_SECRET_KEY`                  | `apps/graphql/.env.development` | must start `sk_test_` — refuse anything else                |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `apps/web/.env.development`     | `pk_test_`, and from the **same** account as the secret key |
| `STRIPE_WEBHOOK_SECRET`              | `apps/graphql/.env.development` | `stripe listen --print-secret` — see below                  |

```bash
stripe listen --print-secret        # whsec_… — stable per account and device, not per run
```

Take the secret this way rather than reading it off a running listener: it is the same value
every time, so nothing has to be re-copied when the listener restarts. The listener itself is
for testing, and forwards to the **API** Worker directly:

```bash
stripe listen --events checkout.session.completed --forward-to localhost:8787/stripe/webhook
```

`:8787`, not `:3000` — the webhook does not go through the web app, and
`apps/web/src/lib/api.ts` hardcodes that port for `next dev`. This local `whsec_` is **not**
the deployed endpoint's — that one belongs to `setup-production` — and mixing them gives a
400 that reads exactly like a forged signature.

### 3c — Resend, and where mail may go

`MAIL_TEST_RECIPIENTS` **ships blank**, and blank means `sendTestEmail` refuses every address
it is given. **Ask the user for a contact email** — `AskUserQuestion` or a plain question,
the same way Phase 2 asks for the project name — and say why the answer is constrained:
`MAIL_FROM` uses Resend's shared `onboarding@resend.dev` sender, which needs no verified
domain but **only delivers to the Resend account owner's own address**, so this should
normally be that address. Keep the answer; `setup-production` writes the same value into
`wrangler.jsonc`.

Then create `RESEND_API_KEY` at `https://resend.com/api-keys` — browser-only, because
Resend has no key-creation API at all — and set `MAIL_TRANSPORT=resend` so mail is actually
delivered and the sign-in flow can be exercised end to end. The value is shown **once**,
with a copy button beside it: relay it (`--expect re_`) in the same step, or it is gone and
the user makes another.

`MAIL_TRANSPORT=log` remains available and renders to the log without sending. It is a
**deliberate downgrade, not a default**: offer it only if the user says they do not want a
Resend account, tell them magic-link sign-in cannot be tested that way, and say it plainly in
your summary rather than letting it pass as done.

The same applies to Stripe: if the user declines a Stripe account, the placeholders boot the
app but payments are dead. Record it as a known gap, not as a finished phase.

### 3d — bring it up

```bash
docker compose up -d --wait                  # --wait blocks until Postgres accepts connections
pnpm --filter @<name>/db migrate             # drizzle-kit, against the direct local URL
pnpm verify                                  # format:changed, docs:check, lint, typecheck, unit
```

`--wait` is load-bearing: without it the container reports "up" seconds before the socket
answers and `migrate` races it.

Then `pnpm dev`, and confirm with the user that it works — not just that it boots. Sign in
with a magic link, and run one `stripe trigger checkout.session.completed` against the
listener. Rerun `state.sh --scope development`: every row should read `done`.

**This is the end of `setup-development`.** Say what exists, what it cost (nothing), and
that development is a complete, useful outcome on its own — most clones should stay here
until there is a real reason to go further. Two skills pick up from here, and neither is
inferred from a plain "set up production" request without the user naming one:

- **`setup-production`** — stands up Neon, Hyperdrive, Cloudflare Workers and the deployed
  Stripe webhook for the first time, and is also where switching Stripe to live mode lives.
- **`deploy-production`** — once `setup-production` has run once, this is what ships every
  later feature change to that already-deployed production.

## Phase 4 — the browser itself

Not a phase in sequence: it runs **throughout** Phases 1 through 3, wherever a vendor page
is the surface. `reference/browser.md` is the playbook — the CLI/browser split, the
`read_page` → act → `read_page` loop, the secret-handling rules, and what to look for on
each vendor's page.

The four rules worth carrying without opening it:

- **`tabs_context_mcp` first, always**, then a **new** tab. Never navigate a tab the user
  is using.
- **`read_page` before every action**, and again after, to confirm the page changed. A
  click aimed at a remembered layout hits whatever moved into that spot.
- **Never trigger an `alert`, `confirm` or `prompt`.** A blocked dialog freezes the
  extension until the user dismisses it by hand.
- **Stop after two or three failures on a page.** Say what you tried and hand it over;
  do not keep clicking.
- **Keys move by clipboard relay**, with `--expect` every time, `--shape` to confirm and
  `--clear` after.

## Rerunning /setup-development

Reruns are the intended path, not a recovery mode. `/setup-development` is safe to run
repeatedly because every step is either idempotent or guarded:

- `state.sh --scope development` is the resume point. Run it first, every time, and skip
  what reads `done`.
- `rename.mjs` refuses a dirty tree and refuses when the template token is already gone, so
  a second rename is a no-op rather than a double rewrite.
- Copying an `.env.example` over a configured `.env.development` **would** destroy work —
  so only copy when `state.sh` reports the file missing.

## Judgment calls

- **Ask, do not infer, for anything account-shaped.** A name, a Stripe project, a sender
  address. Guessing these is cheap to type and expensive to unwind.
- **A live-mode Stripe key stops this skill, unconditionally.** Say so and ask. Never pipe
  one into a secret, and never test against one — this skill has no legitimate use for a
  live key at all; that lives entirely in `setup-production`'s own explicit "Stripe, live
  mode" section, gated separately. `state.sh` flags an `sk_live_` in `.env.development`
  unconditionally for the same reason.
- **Never invent a CLI flag.** `reference/services.md` (in `setup-production`) lists what
  was verified live for the vendors it covers. If what you need is not there, do that step
  in the vendor's web console and say why — a wrong flag on a create command is a resource
  in the wrong shape, not an error message.
- **A page that does not match what `browser.md` describes is a stop, not a puzzle.**
  Consoles get redesigned. Say what you found instead, and let the user point at the right
  control rather than clicking through a layout you are inferring.
- **Report what was skipped, too.** A development environment with `MAIL_TRANSPORT=log` or
  placeholder Stripe keys is a partial one; name it as such rather than reporting Phase 3
  complete.
- **The rename is the only bulk edit here.** Everything else is a handful of lines in a
  named file. If you find yourself about to sed the repo, the answer is a script or a
  question to the user.
