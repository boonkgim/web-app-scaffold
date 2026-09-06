---
name: setup
description: Turn a fresh clone of this scaffold into the user's own project in their own accounts — check the toolchain, rename it off the template name, bring Postgres and the apps up locally, then optionally provision Neon, Hyperdrive, Cloudflare Workers, Stripe and Resend. Use when someone says set up this project, configure my clone, make this scaffold mine, get this running locally, or deploy this for the first time. Invoked as /setup.
---

# setup — making this clone yours

This repo is a **scaffold**, and it carries nobody's accounts. Every account-coupled value
— origins, a contact inbox, a Hyperdrive id — ships as an **empty string**, fail-closed by
design, so a clone can never talk to the template author's resources. `/setup` renames what
a rename can fix, **asks** for what only the user knows, and **derives** the rest from the
resources it provisions.

Five phases, run in order. **Phases 1–3 need no cloud account and are a complete, working
outcome on their own** — a local app against Docker Postgres. Many users stop there, so
never treat Phase 4 as the finish line or start it without asking.

Per-service commands, flags and account-resolution recipes: `reference/services.md`.

## The one rule that outranks the phase order

**Before the first create in any service, resolve the concrete account, print it, and get
an explicit yes.** Never accept a CLI's default silently.

On the machine this skill was built against, wrangler and the Stripe CLI both defaulted to
the *wrong* account, and one configured Stripe project holds a **live-mode** key. A wrong
Cloudflare default deploys to someone else's account; a wrong Stripe default charges a real
card and does not error. The resolution recipe per service is the first table in
`reference/services.md`.

## Phase 1 — preflight

```bash
bash .claude/skills/setup/scripts/preflight.sh
```

Exits non-zero only for what Phase 3 genuinely needs — node ≥24, pnpm, docker and its
compose plugin. Cloud CLIs are warnings by design.

- **On a non-zero exit, stop.** Offer to install what is missing; the script prints the
  exact command per tool. Do not proceed on a hope that the tool appears later.
- On warnings only, say which cloud tools are absent and that they matter for Phase 4,
  then carry on. Do not install them yet.

## Phase 2 — the project name

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

**Skip this step entirely when `origin` is already theirs.** A repo made with
`gh repo create --template` (or "Use this template") starts with one fresh commit and its
own remote — there is nothing attached, and unpicking it would be busywork.

Otherwise ask which they want. Neither is wrong; they differ in what they keep:

| Choice | What it does | Suits |
| ------ | ------------ | ----- |
| **Detach, keep history** | `git remote remove origin` | they want the scaffold's build history, and `docs/setup` read as the record of how it was built |
| **Start fresh** | `rm -rf .git && git init -b main && git add -A && git commit -m "Initial commit"` | they want their own history and their own name on it — the template's commits are authored by someone else |

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
someone else's values. `MAIL_FROM` still carries the project name and *is* the rename's job.

### The four empty values

| Value                   | Comes from                                          | Empty at runtime |
| ----------------------- | --------------------------------------------------- | ---------------- |
| `MAIL_TEST_RECIPIENTS`  | **Asked** — Phase 3 (local) and reused in Phase 4    | `src/mail.ts` refuses **every** recipient — silent, and the first thing a user hits testing mail locally |
| `CORS_ORIGINS`          | **Derived** — the web Worker's deploy URL, step 5    | `src/cors.ts` allows **no** origin — every browser request fails cross-origin |
| `WEB_ORIGIN`            | **Derived** — the same URL, step 5                   | read via `requireEnv` (`src/env.ts`), which **throws** `Missing required environment variable: WEB_ORIGIN` at the auth endpoints — a named error, not a wrong answer |
| `hyperdrive[0].id`      | **Derived** — `wrangler hyperdrive create` output, step 2 | config still parses and `wrangler dev` does not care (it dials `localConnectionString`); only a real deploy needs a real id |

Empty is **fail-closed on purpose**. Only the first row is a question for the user — never
prompt for the other three, they are discovered during Phase 4 provisioning.

## Phase 3 — local bring-up

Self-contained: no account anywhere, nothing deployed, nothing costs money. This is the
phase that must always work.

```bash
pnpm install
cp apps/graphql/.env.example apps/graphql/.env.development
cp apps/web/.env.example     apps/web/.env.development
cp packages/db/.env.example  packages/db/.env.development
```

Each `.env.example` is a **commented checklist with dummy values**, not a ready file — read
it and fix the values it describes rather than copying blind. The two edits that are not
optional:

- `packages/db/.env.development` → `DATABASE_URL=postgres://postgres:postgres@localhost:5434/<name>`.
  Port **5434**, not 5432 (`docker-compose.yml` maps `5434:5432`), and the database name is
  the project name, because the rename changed `POSTGRES_DB` too.
- `apps/graphql/.env.development` → `BETTER_AUTH_SECRET`, from
  `openssl rand -base64 32`. Paste only the value; the generator's output is the whole line
  in some tools and the `KEY=` prefix ends up inside the secret.

- `apps/graphql/.env.development` → `MAIL_TEST_RECIPIENTS`, which **ships blank**, and blank
  means `sendTestEmail` refuses every address it is given. **Ask the user for a contact
  email** here — `AskUserQuestion` or a plain question, the same way Phase 2 asks for the
  project name — and say why the answer is constrained: `MAIL_FROM` uses Resend's shared
  `onboarding@resend.dev` sender, which needs no verified domain but **only delivers to the
  Resend account owner's own address**, so this should normally be that address. Keep the
  answer; Phase 4 writes the same value into `wrangler.jsonc` for the deployed Worker.

Leave `MAIL_TRANSPORT=log` — local mail renders to the log and sends nothing, so a wrong
address here surfaces as a log line rather than a bounce. The dummy `sk_test_` / `pk_test_`
values are enough to boot; real Stripe keys are Phase 4.

```bash
docker compose up -d --wait                  # --wait blocks until Postgres accepts connections
pnpm --filter @<name>/db migrate             # drizzle-kit, against the direct local URL
pnpm verify                                  # format:changed, docs:check, lint, typecheck, unit
```

`--wait` is load-bearing: without it the container reports "up" seconds before the socket
answers and `migrate` races it.

Then `pnpm dev`, open the app, and confirm with the user that it works. **Stop here and ask
before Phase 4.** Say plainly that what follows creates real resources in real accounts.

## Phase 4 — cloud provisioning

Do not start this without the account gate above, per service, at the moment of first
create. The order below is a dependency chain with one cycle in it — do not reorder it.

| #   | Step                                                       | Needs |
| --- | ---------------------------------------------------------- | ----- |
| 1   | Neon project → **direct** (unpooled) connection string     | —     |
| 2   | Hyperdrive binding → id into `apps/graphql/wrangler.jsonc` | 1     |
| 3   | Deploy graphql → learn its `workers.dev` URL               | 2     |
| 4   | Deploy web → learn its `workers.dev` URL                   | 3     |
| 5   | `CORS_ORIGINS` + `WEB_ORIGIN` ← (4), **redeploy graphql**  | 4     |
| 6   | Stripe webhook at (3) + `/stripe/webhook` → capture `whsec_` | 3   |
| 7   | `wrangler secret put` ×4                                    | 6     |

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
  binding does not resolve across accounts.

Run `packages/db`'s `migrate:production` against the Neon direct URL, not through
Hyperdrive; the `project-db` skill owns that step.

## Phase 5 — browser steps

The fallback for anything with no API: creating the Resend API key
(`https://resend.com/api-keys` — Resend has no key-creation API), and any vendor signup
where the user has no account yet.

Drive Chrome with `mcp__claude-in-chrome`: **`tabs_context_mcp` first, always**, then
`tabs_create_mcp` / `navigate`, then `read_page` before acting, and `computer` only for
what reading cannot do. Details and the Resend specifics are in `reference/services.md`.

- Open a **new** tab. Never navigate a tab the user is using.
- Never echo a key into the transcript. Pipe it into `wrangler secret put`, which reads
  stdin.
- Signup, payment details and email verification are the user's steps. Get them to the
  right page, say what to do, and wait — do not fill in a signup form on their behalf.

## Judgment calls

- **Ask, do not infer, for anything account-shaped.** A name, an account id, a Stripe
  project, a sender address. Guessing these is cheap to type and expensive to unwind.
- **A live-mode Stripe key stops the phase.** Say so and ask. Never pipe one into a secret,
  and never test against one.
- **Never invent a CLI flag.** `reference/services.md` lists what was verified live. If
  what you need is not there, do that step in the vendor's web console and say why — a
  wrong flag on a create command is a resource in the wrong shape, not an error message.
- **Report what was created, as you go.** Names and ids, in the transcript, so the user can
  find and delete them. The undo commands are at the end of `reference/services.md`.
- **The rename is the only bulk edit here.** Everything else is a handful of lines in a
  named file. If you find yourself about to sed the repo, the answer is a script or a
  question to the user.
