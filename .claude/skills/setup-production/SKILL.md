---
name: setup-production
description: Take an already-set-up development clone of this scaffold live for the first time — provision Neon, Hyperdrive, Cloudflare Workers and the deployed Stripe webhook, and set the four `wrangler secret`s. Use when someone wants to deploy this scaffold for the first time, put it on real infrastructure, or make it reachable by strangers. Requires `setup-development` to be complete first and refuses to run otherwise. Also use when someone explicitly asks to switch Stripe to live mode or accept real payments on an already-deployed clone — invoked as /setup-production stripe live, a separate step from the rest of this skill and never inferred from a plain "set up production" request. Once this skill has run once, shipping every later feature change to production is `deploy-production`, not this skill — never rerun this one just to deploy new code. Invoked as /setup-production.
---

# setup-production — going live, once

This is the part of standing up this scaffold that can be reached by strangers or charge a
real card: Neon, Hyperdrive, deployed Workers, a deployed webhook endpoint, and the four
`wrangler secret`s. Everything account-coupled up to this point — Docker Postgres, Stripe
test mode, Resend — is `setup-development`'s job, and it is a precondition here, not
something this skill repeats.

**This still deploys on Stripe test keys.** "Production" here means Cloudflare Workers,
Neon and a deployed webhook endpoint reachable by strangers — not a Worker that can charge
them. Going live with Stripe is a further, separate, explicit step: see **Stripe, live
mode** below. Never fold it into this skill's own steps, and never enter it because the
user said they want production — that sentence means "deploy it," not "start charging
cards."

**This is a one-time (or rarely rerun) skill, not the ongoing release path.** Once it has
provisioned Neon, Hyperdrive, the two Workers and the webhook, shipping a later feature is
`deploy-production`'s job — migrate, deploy the API, deploy the web app, in that order,
against infrastructure this skill already created. Reaching for this skill to ship a new
feature is the mistake this split exists to prevent: it would mean re-walking account gates
and vendor consoles for a change that only needs three commands.

Per-service commands, flags and account-resolution recipes: `reference/services.md`. The
browser playbook, shared with `setup-development`:
`.claude/skills/setup-development/reference/browser.md`.

## Precondition: development is complete

```bash
bash .claude/skills/setup-development/scripts/state.sh --scope development
```

If this does not read `complete`, stop and say so — run `setup-development` first. This
skill provisions real infrastructure and assumes the rename, the env files and the local
gate are already done; it does not repeat any of that.

## Drive the browser; do not read instructions aloud

Every step a person would otherwise do in a tab — signing in, approving an OAuth screen,
copying a key or an id off a dashboard — you do with the `mcp__claude-in-chrome` tools.
Handing the user a URL and a list of clicks is the fallback, not the plan.

What stays on the CLI is narrow: the **verified creates** in `reference/services.md`
(`neonctl projects create`, `wrangler hyperdrive create`, `stripe webhook_endpoints
create`, `wrangler secret put`), plus `wrangler`, `neonctl` and `pnpm`. A command checked
live against a real account beats clicking through a console that redesigns itself.
Everything else is the browser's.

Before anything else, ask once for the three domains this skill needs:
`console.neon.tech`, `dash.cloudflare.com`, `dashboard.stripe.com`. Without them the first
`navigate` fails and the fix is a click only the user can make. Keys and ids still move by
clipboard relay — the same discipline as `setup-development`: `--expect` every time,
`--shape` to confirm, `--clear` after.

## The one rule that outranks the step order

**Before the first create in any service, resolve the concrete account, print it, and get
an explicit yes.** Never accept a CLI's default silently.

On the machine this skill was built against, wrangler and the Stripe CLI both defaulted to
the _wrong_ account, and one configured Stripe project holds a **live-mode** key. A wrong
Cloudflare default deploys to someone else's account; a wrong Stripe default charges a real
card and does not error. The resolution recipe per service is the first table in
`reference/services.md`.

Test mode is not a reason to skip this gate — it is the gate that establishes it _is_ test
mode.

## Provisioning, in order

Do not start this without the account gate above, per service, at the moment of first
create. Each of `wrangler login` and `neonctl auth` opens a consent page — drive it, and
**read the account and org on that page back to the user before approving**. That page is
the account gate, not a formality on the way to it. The order below is a dependency chain
with one cycle in it — do not reorder it.

| #   | Step                                                          | Needs |
| --- | -------------------------------------------------------------- | ----- |
| 1   | Neon project → **direct** (unpooled) connection string        | —     |
| 2   | Hyperdrive binding → id into `apps/graphql/wrangler.jsonc`     | 1     |
| 3   | Deploy graphql → learn its `workers.dev` URL                   | 2     |
| 4   | Deploy web → learn its `workers.dev` URL                        | 3     |
| 5   | `CORS_ORIGINS` + `WEB_ORIGIN` ← (4), **redeploy graphql**       | 4     |
| 6   | Stripe webhook at (3) + `/stripe/webhook` → capture `whsec_`   | 3     |
| 7   | `wrangler secret put` ×4                                       | 6     |

Steps 3–5 are the **two-pass deploy**. The API must know the web origin and the web Worker
must be built against the API, so neither URL can be set before both Workers exist. The
first graphql deploy is expected to be wrong about CORS; step 5 is what fixes it, and
skipping it leaves an app whose every request fails cross-origin.

Three things reliably go wrong here, all covered in `reference/services.md`:

- The committed `hyperdrive[0].id` is **empty**, which is why nothing complained during
  `setup-development`: the config parses, the Worker builds, and `wrangler dev` ignores the
  id entirely. A real deploy does not — fill it at step 2 or the deploy fails.
- `CORS_ORIGINS` and `WEB_ORIGIN` are the **web** origin, never the API's own. Both are
  empty until step 5: empty `CORS_ORIGINS` rejects every origin, empty `WEB_ORIGIN` throws
  a named `requireEnv` error at the auth endpoints.
- `MAIL_TEST_RECIPIENTS` in `wrangler.jsonc` is also empty — write `setup-development`'s
  answer into it before deploying, or the deployed Worker refuses every recipient.
- Both `.env.production` files must name the **same** `CLOUDFLARE_ACCOUNT_ID` — a service
  binding does not resolve across accounts. `state.sh` checks that they agree.

The step-6 `whsec_` is a **different secret** from `setup-development`'s local one and
belongs in `wrangler secret put STRIPE_WEBHOOK_SECRET`, never in `.env.development`. Step
7's secrets pipe in the same way the relay does — `wrangler secret put` reads stdin, so
nothing needs to be echoed:

```bash
bash .claude/skills/setup-development/scripts/clipboard.sh --paste --expect re_ | npx wrangler@4 secret put RESEND_API_KEY
```

Run `packages/db`'s `migrate:production` against the Neon direct URL, not through
Hyperdrive; the `project-db` skill owns that step, and `deploy-production` owns running it
on every later deploy.

## Stripe, live mode — separate and explicit

Not part of the provisioning table above, and never entered on inference — only when the
user explicitly asks, in words: `/setup-production stripe live`, "go live with Stripe," "switch
to real payments." The provisioning above leaves the deploy on Stripe **test** keys
indefinitely, and that is correct — most clones should stay there until there is a real
reason to accept a real card. Elsewhere in this document, "a live-mode key is a hard stop"
still means exactly that; this section is the one place it does not, and only once its own
gate below has run.

**Precondition:** provisioning above is done —
`bash .claude/skills/setup-development/scripts/state.sh --scope production` reports
`complete`. This section swaps keys in an already-deployed app; it does not stand one up.
If production is not deployed yet, say so and offer to run the provisioning above first, on
test keys, and come back here.

### 1 — the account gate, again, and harder

`cat ~/.config/stripe/config.toml`, resolve the project exactly as provisioning did, and
show the user its name. The question this time is not "is this the right test account" but
"do you want this project charging real cards on `<the deployed URL>` starting now" — ask it
in those words and get an explicit yes before touching anything. A confirmation from earlier
in the run, including provisioning's own account gate, is not consent for this one.

### 2 — live keys, from the dashboard, never the CLI

Same relay discipline as test mode, a different page and a different prefix:
`https://dashboard.stripe.com/apikeys` (no `/test/`). Confirm the page reads **Live mode**
before reading anything on it — the same check as confirming Test mode in
`setup-development`, just the other answer — then relay `--expect sk_live_` and
`--expect pk_live_` in place of the `_test_` ones. `stripe login`'s restricted key is still
not the secret key, same as test mode: the dashboard is the only source for either.

### 3 — the secret key is a runtime swap; the publishable key is not

```bash
bash .claude/skills/setup-development/scripts/clipboard.sh --paste --expect sk_live_ | npx wrangler@4 secret put STRIPE_SECRET_KEY
```

Takes effect immediately — no rebuild, no redeploy. `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is
different: `apps/web/.env.example` says why — it is inlined into the browser bundle by
`next build`, not read at runtime, so writing the new `pk_live_` into
`apps/web/.env.production` does nothing on its own until the Worker is rebuilt and
redeployed:

```bash
pnpm --filter <name>/web deploy:production
```

Skipping this step is the one way this section fails silently: the API takes real cards,
Embedded Checkout still mounts with the old `pk_test_`, and the mismatch surfaces as a
confusing client-side error rather than a clean one.

### 4 — a new webhook endpoint, in the dashboard

Stripe webhook endpoints are mode-scoped: the test-mode `we_...` from the provisioning
table's step 6 does not start firing for live events, and it does not need deleting either
— it costs nothing idle. Create the live one at `https://dashboard.stripe.com/webhooks`,
not the CLI — `reference/services.md`'s `stripe webhook_endpoints create` is verified for
test mode only, there is no verified live-mode flag for it, and per the rule against
inventing a CLI flag, this stays a browser step until someone verifies one live and adds it
to `services.md`. Same URL as before —
`https://<name>-graphql.<sub>.workers.dev/stripe/webhook` — same one event,
`checkout.session.completed`. The signing secret is shown once; capture it straight into:

```bash
bash .claude/skills/setup-development/scripts/clipboard.sh --paste --expect whsec_ | npx wrangler@4 secret put STRIPE_WEBHOOK_SECRET
```

### 5 — say it plainly

Close with a summary the user cannot misread: which project, which URL, and the fact that it
is now charging real cards. Reverting means repeating this section with the test-mode keys
and a new test-mode webhook endpoint — there is no toggle, only doing it again with the
other keys.

## Rerunning /setup-production

Provisioning is a one-time run in the common case, but it is safe to resume if it was
interrupted:

- `state.sh --scope production` is the resume point. Run it first, and skip what reads
  `done`.
- Steps in the provisioning table are creates. Before rerunning one, check whether the
  resource already exists (`wrangler hyperdrive list`, `webhook_endpoints list`) rather than
  creating a second one; the undo commands are at the end of `reference/services.md`.
- Reruns still ask the account gate. A previously confirmed account is not consent for
  today's create.

**Do not rerun this skill to ship a feature.** Once provisioning is done, `deploy-production`
is the only skill that should touch the deployed app.

## Judgment calls

- **Ask, do not infer, for anything account-shaped.** An account id, a Stripe project.
  Guessing these is cheap to type and expensive to unwind.
- **A live-mode Stripe key stops this skill — everywhere except the "Stripe, live mode"
  section, and only after its own account gate has run.** Say so and ask. Never pipe one
  into a secret, and never test against one, outside that section.
- **Never invent a CLI flag.** `reference/services.md` lists what was verified live. If
  what you need is not there, do that step in the vendor's web console and say why — a
  wrong flag on a create command is a resource in the wrong shape, not an error message.
- **Report what was created, as you go.** Names and ids, in the transcript, so the user can
  find and delete them. The undo commands are at the end of `reference/services.md`.
- **A page that does not match what `browser.md` describes is a stop, not a puzzle.**
  Consoles get redesigned. Say what you found instead, and let the user point at the right
  control rather than clicking through a layout you are inferring.
