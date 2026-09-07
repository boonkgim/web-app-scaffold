---
name: setup
description: Turn a fresh clone of this scaffold into the user's own project in their own accounts — check what is installed and what is already done, rename it off the template name, stand up a complete development environment (Docker Postgres, Stripe test mode, Resend), then optionally provision Neon, Hyperdrive, Cloudflare Workers and the deployed Stripe webhook. Use when someone says set up this project, configure my clone, make this scaffold mine, get this running locally, or deploy this for the first time. Rerun it to add production later. Invoked as /setup.
---

# setup — making this clone yours

This repo is a **scaffold**, and it carries nobody's accounts. Every account-coupled value
— origins, a contact inbox, a Hyperdrive id — ships as an **empty string** or a committed
placeholder, fail-closed by design, so a clone can never talk to the template author's
resources. `/setup` renames what a rename can fix, **asks** for what only the user knows,
and **derives** the rest from the resources it provisions.

## The axis is development vs production, not local vs cloud

Splitting on "does it touch the cloud" is the wrong cut, and getting it wrong produces a
clone that boots but cannot be tested. A development environment needs third-party
accounts too:

- **Stripe test mode.** Embedded Checkout will not mount without a real `pk_test_`, the
  resolver cannot create a session without a real `sk_test_`, and `/stripe/webhook`
  rejects every event as a bad signature without the `whsec_` that `stripe listen` prints.
- **Resend.** With `MAIL_TRANSPORT=log` mail renders to a log and is never delivered, so
  magic-link sign-in cannot be exercised end to end.

Neither costs anything — test mode charges nothing, Resend's free tier delivers to the
account owner. So both are **development** requirements, sitting beside node and docker.
What is genuinely production-only is the part that can be reached by strangers or charge a
real card: Neon, Hyperdrive, deployed Workers, a deployed webhook endpoint, and the four
`wrangler secret`s.

**Set up development fully, and finish it, before production is even discussed.** A
half-configured development environment is the failure mode this ordering exists to
prevent: it fails later, somewhere unrelated, with a message about neither Stripe nor mail.

Per-service commands, flags and account-resolution recipes: `reference/services.md`.

## The one rule that outranks the phase order

**Before the first create in any service, resolve the concrete account, print it, and get
an explicit yes.** Never accept a CLI's default silently.

On the machine this skill was built against, wrangler and the Stripe CLI both defaulted to
the _wrong_ account, and one configured Stripe project holds a **live-mode** key. A wrong
Cloudflare default deploys to someone else's account; a wrong Stripe default charges a real
card and does not error. The resolution recipe per service is the first table in
`reference/services.md`.

This rule applies in Phase 3 as much as Phase 4. Test mode is not a reason to skip the
gate — it is the gate that establishes it _is_ test mode.

## Phase 1 — preflight, state, and the scope question

Two scripts, then one question. Run both; they answer different things.

```bash
bash .claude/skills/setup/scripts/preflight.sh   # what is INSTALLED — two tables, development and production
bash .claude/skills/setup/scripts/state.sh       # what is already DONE — resumable, no state file
```

`preflight.sh` prints one table per scope, each row `ok` / `MISSING` / `warn` / `you`, and
every row carries its own fix. It **exits non-zero only for a missing development
requirement**; production gaps never fail the exit code, because rerunning `/setup` later
is the supported way to add production.

- **On a non-zero exit, stop.** Show the user the development table as printed — it is
  already the requirement list with steps, so do not restate it in prose. Offer to install
  what is missing, and do not proceed on a hope that a tool appears later.
- Rows marked **`you`** are the ones a shell cannot check: whether a Stripe account exists
  and which project is right, and whether the user has a Resend key. Confirm each with the
  user before Phase 3 needs it.
- Production `warn` rows are not blockers: `wrangler` and `neonctl` both run under `npx`.

`state.sh` derives progress from the repo and the running containers — there is no state
file, deliberately, because a file and the repo can disagree and the file is the one that
lies. Its `SUMMARY development=… production=…` line is what you branch on.

### Then ask which scope

Use `AskUserQuestion`. What to offer depends on the `SUMMARY` line:

| `state.sh` says                               | Offer                                                             |
| --------------------------------------------- | ----------------------------------------------------------------- |
| `development=not-started` or `partial`        | **Development only** (recommended) · Development, then production |
| `development=complete production=not-started` | **Add production now** · Nothing, development is done             |
| `production=partial`                          | **Resume production** — say which rows are outstanding            |

**Recommend development-only, and say why:** it is a complete, useful outcome, it costs
nothing, and production is one rerun away. Never present production as the finish line.

Say plainly, in the question itself, that production creates real resources in real
accounts. If they choose development-then-production, that is a statement of intent, not
consent for Phase 4 — you still stop at the end of Phase 3 and confirm.

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
node .claude/skills/setup/scripts/rename.mjs <name>            # dry run — prints the plan
node .claude/skills/setup/scripts/rename.mjs <name> --apply    # rewrites
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

| Value                  | Comes from                                                | Empty at runtime                                                                                                                                                     |
| ---------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MAIL_TEST_RECIPIENTS` | **Asked** — Phase 3 (development) and reused in Phase 4   | `src/mail.ts` refuses **every** recipient — silent, and the first thing a user hits testing mail                                                                     |
| `CORS_ORIGINS`         | **Derived** — the web Worker's deploy URL, step 5         | `src/cors.ts` allows **no** origin — every browser request fails cross-origin                                                                                        |
| `WEB_ORIGIN`           | **Derived** — the same URL, step 5                        | read via `requireEnv` (`src/env.ts`), which **throws** `Missing required environment variable: WEB_ORIGIN` at the auth endpoints — a named error, not a wrong answer |
| `hyperdrive[0].id`     | **Derived** — `wrangler hyperdrive create` output, step 2 | config still parses and `wrangler dev` does not care (it dials `localConnectionString`); only a real deploy needs a real id                                          |

Empty is **fail-closed on purpose**. Only the first row is a question for the user — never
prompt for the other three, they are discovered during Phase 4 provisioning.

## Phase 3 — the development environment, complete

Nothing here is deployed and nothing costs money, but this phase is **not** account-free:
finishing it means Stripe test mode and Resend are really wired, not stubbed. This is the
phase that must always work, and the one users are entitled to stop at.

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
the dashboard rather than the CLI. That makes this a Phase 5 browser step:
`https://dashboard.stripe.com/test/apikeys`, in **test** mode.

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
the deployed endpoint's; mixing them gives a 400 that reads exactly like a forged signature.

### 3c — Resend, and where mail may go

`MAIL_TEST_RECIPIENTS` **ships blank**, and blank means `sendTestEmail` refuses every address
it is given. **Ask the user for a contact email** — `AskUserQuestion` or a plain question,
the same way Phase 2 asks for the project name — and say why the answer is constrained:
`MAIL_FROM` uses Resend's shared `onboarding@resend.dev` sender, which needs no verified
domain but **only delivers to the Resend account owner's own address**, so this should
normally be that address. Keep the answer; Phase 4 writes the same value into
`wrangler.jsonc`.

Then get `RESEND_API_KEY` from `https://resend.com/api-keys` — a Phase 5 browser step,
because Resend has no key-creation API — and set `MAIL_TRANSPORT=resend` so mail is actually
delivered and the sign-in flow can be exercised end to end.

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
listener. Rerun `state.sh`: every development row should read `done`.

**Stop here.** If they chose development-only, this is the end — say what exists, what it
cost (nothing), and that `/setup` can be rerun for production whenever they want. If they
said they wanted production, confirm again before starting: what follows creates real
resources in real accounts.

## Phase 4 — production

Do not start this without the account gate above, per service, at the moment of first
create. The order below is a dependency chain with one cycle in it — do not reorder it.

| #   | Step                                                         | Needs |
| --- | ------------------------------------------------------------ | ----- |
| 1   | Neon project → **direct** (unpooled) connection string       | —     |
| 2   | Hyperdrive binding → id into `apps/graphql/wrangler.jsonc`   | 1     |
| 3   | Deploy graphql → learn its `workers.dev` URL                 | 2     |
| 4   | Deploy web → learn its `workers.dev` URL                     | 3     |
| 5   | `CORS_ORIGINS` + `WEB_ORIGIN` ← (4), **redeploy graphql**    | 4     |
| 6   | Stripe webhook at (3) + `/stripe/webhook` → capture `whsec_` | 3     |
| 7   | `wrangler secret put` ×4                                     | 6     |

Steps 3–5 are the **two-pass deploy**. The API must know the web origin and the web Worker
must be built against the API, so neither URL can be set before both Workers exist. The
first graphql deploy is expected to be wrong about CORS; step 5 is what fixes it, and
skipping it leaves an app whose every request fails cross-origin.

Three things reliably go wrong here, all covered in `reference/services.md`:

- The committed `hyperdrive[0].id` is **empty**, which is why nothing complained in Phase 3:
  the config parses, the Worker builds, and `wrangler dev` ignores the id entirely. A real
  deploy does not — fill it at step 2 or the deploy fails.
- `CORS_ORIGINS` and `WEB_ORIGIN` are the **web** origin, never the API's own. Both are
  empty until step 5: empty `CORS_ORIGINS` rejects every origin, empty `WEB_ORIGIN` throws
  a named `requireEnv` error at the auth endpoints.
- `MAIL_TEST_RECIPIENTS` in `wrangler.jsonc` is also empty — write the Phase 3 answer into
  it before deploying, or the deployed Worker refuses every recipient.
- Both `.env.production` files must name the **same** `CLOUDFLARE_ACCOUNT_ID` — a service
  binding does not resolve across accounts. `state.sh` checks that they agree.

The step-6 `whsec_` is a **different secret** from the Phase 3 one and belongs in
`wrangler secret put STRIPE_WEBHOOK_SECRET`, never in `.env.development`.

Run `packages/db`'s `migrate:production` against the Neon direct URL, not through
Hyperdrive; the `project-db` skill owns that step.

## Phase 5 — browser steps

The fallback for anything with no API, in **both** phases: the Stripe test API keys
(`https://dashboard.stripe.com/test/apikeys`), the Resend API key
(`https://resend.com/api-keys` — Resend has no key-creation API), and any vendor signup
where the user has no account yet.

Drive Chrome with `mcp__claude-in-chrome`: **`tabs_context_mcp` first, always**, then
`tabs_create_mcp` / `navigate`, then `read_page` before acting, and `computer` only for
what reading cannot do. Details and the Resend specifics are in `reference/services.md`.

- Open a **new** tab. Never navigate a tab the user is using.
- Never echo a key into the transcript. Write it into the `.env.development` file, or pipe
  it into `wrangler secret put`, which reads stdin.
- Signup, payment details and email verification are the user's steps. Get them to the
  right page, say what to do, and wait — do not fill in a signup form on their behalf.

## Rerunning /setup

Reruns are the intended path, not a recovery mode — this is how someone sets up development
today and deploys next week. `/setup` is safe to run repeatedly because every phase is
either idempotent or guarded:

- `state.sh` is the resume point. Run it first, every time, and skip what reads `done`.
- `rename.mjs` refuses a dirty tree and refuses when the template token is already gone, so
  a second rename is a no-op rather than a double rewrite.
- Copying an `.env.example` over a configured `.env.development` **would** destroy work —
  so only copy when `state.sh` reports the file missing.
- Phase 4 steps are creates. Before rerunning one, check whether the resource already
  exists (`wrangler hyperdrive list`, `webhook_endpoints list`) rather than creating a
  second one; the undo commands are at the end of `reference/services.md`.

Reruns still ask the account gate. A previously confirmed account is not consent for
today's create.

## Judgment calls

- **Ask, do not infer, for anything account-shaped.** A name, an account id, a Stripe
  project, a sender address. Guessing these is cheap to type and expensive to unwind.
- **A live-mode Stripe key stops the phase.** Say so and ask. Never pipe one into a secret,
  and never test against one. `state.sh` flags an `sk_live_` in `.env.development` too.
- **Never invent a CLI flag.** `reference/services.md` lists what was verified live. If
  what you need is not there, do that step in the vendor's web console and say why — a
  wrong flag on a create command is a resource in the wrong shape, not an error message.
- **Report what was created, as you go.** Names and ids, in the transcript, so the user can
  find and delete them. The undo commands are at the end of `reference/services.md`.
- **Report what was skipped, too.** A development environment with `MAIL_TRANSPORT=log` or
  placeholder Stripe keys is a partial one; name it as such rather than reporting Phase 3
  complete.
- **The rename is the only bulk edit here.** Everything else is a handful of lines in a
  named file. If you find yourself about to sed the repo, the answer is a script or a
  question to the user.
