# Per-service detail for `/setup`

## Contents

- [The account gate, service by service](#the-account-gate-service-by-service)
- [Cloudflare — wrangler](#cloudflare--wrangler)
- [Neon — neonctl](#neon--neonctl)
- [Hyperdrive](#hyperdrive)
- [The two-pass deploy](#the-two-pass-deploy)
- [Stripe](#stripe)
- [Resend, and the browser fallback](#resend-and-the-browser-fallback)
- [Secrets](#secrets)
- [Undo](#undo)
- [Verified surfaces — as of 2026-09-06](#verified-surfaces--as-of-2026-09-06)

## The account gate, service by service

The rule from SKILL.md, made concrete: before the **first create** in a service, resolve
the account, print it, and get a yes. Not a paraphrase of it — the literal id or name the
CLI will act under.

| Service    | Resolve with                              | Show the user                      |
| ---------- | ----------------------------------------- | ---------------------------------- |
| Cloudflare | `wrangler whoami`                         | email + the chosen account id/name |
| Neon       | the browser page `neonctl auth` opens     | the org and email on the consent screen |
| Stripe     | `cat ~/.config/stripe/config.toml`        | project name + whether it is live-mode |
| Resend     | the signed-in avatar on resend.com        | the account email                  |

This is not ceremony. On the machine this skill was built against, **both** wrangler and
the Stripe CLI defaulted to the wrong account, and one configured Stripe project holds a
live-mode key — a wrong default there does not error, it charges a real card.

## Cloudflare — wrangler

`wrangler whoami` prints the signed-in email and every account the token can reach. With
more than one account, wrangler refuses to deploy and lists them rather than picking; that
error is the design working, not a fault.

Resolve it by writing the chosen id into the two `.env.production` files, which is where
this repo already expects it:

```
apps/web/.env.production        CLOUDFLARE_ACCOUNT_ID=<id>
apps/graphql/.env.production    CLOUDFLARE_ACCOUNT_ID=<id>
```

They must be the **same** account. A `services` binding (`API` in `apps/web/wrangler.jsonc`)
only resolves between Workers in one account, so a split deploy produces a web Worker whose
API binding is permanently unresolvable.

Neither file is committed. Create them from `.env.example` in the same package.

## Neon — neonctl

```bash
npx neonctl@latest auth                     # browser OAuth; the consent page names the org
npx neonctl@latest projects create --name <project> --pg-version 18 --region-id <region>
npx neonctl@latest connection-string        # DIRECT url — omit --pooled
```

- `--pg-version 18` matches `docker-compose.yml`'s `postgres:18`, so local and production
  are the same major. Diverging here means a migration can pass locally and fail deployed.
- **Omit `--pooled`.** Migrations run from your machine through drizzle-kit against a direct
  connection; the pooled endpoint does not support the session-level work they do. The
  pooling that production needs is Hyperdrive's, one layer up.
- The direct URL goes in `packages/db/.env.production` under `DATABASE_URL` — the same key
  the local file uses, which is why `migrate:production` is a separate script and not a
  flag. See the `project-db` skill.
- **`neonctl projects create` does not enable Neon Auth, and must not.** Neon's own auth
  tables would collide with the Better Auth tables `packages/db` owns.
- Only `auth`, `projects create` and `connection-string` are verified surfaces. For
  anything else — listing projects, checking the org, deleting one — use the Neon console
  in the browser rather than guessing a flag.

## Hyperdrive

```bash
npx wrangler@4 hyperdrive create <name> --connection-string "<neon direct url>"
```

Returns an id. Put it in `apps/graphql/wrangler.jsonc` at `hyperdrive[0].id`, replacing the
committed **empty string** — the template carries no id at all, by design. An empty id is
not an error you will see early: the config parses and `wrangler deploy --dry-run` builds
the Worker fine, and `wrangler dev` ignores the id entirely and dials
`localConnectionString` instead, which is what makes the same config work on a laptop with
no Cloudflare account. **Only a real deploy needs a real id**, so fill it here. Leave
`localConnectionString` alone.

## The two-pass deploy

There is a cycle: the API needs to know the web Worker's URL for CORS and Better Auth, and
the web Worker is built against the API. Neither URL exists until its Worker deploys. So:

1. `pnpm --filter <name>/graphql deploy:production` → note `https://<name>-graphql.<sub>.workers.dev`
2. `pnpm --filter <name>/web deploy:production` → note `https://<name>-web.<sub>.workers.dev`
3. Set **both** `CORS_ORIGINS` and `WEB_ORIGIN` in `apps/graphql/wrangler.jsonc` to (2)'s
   URL — they are the web origin, never the API's own — then redeploy graphql.

`<sub>` is your account's workers.dev subdomain and is **not** the project name — it is not
knowable before a deploy. That is why `CORS_ORIGINS` and `WEB_ORIGIN` ship **empty** and are
derived here rather than asked for or renamed into correctness. Until they are set, empty
`CORS_ORIGINS` allows no origin at all (`src/cors.ts`) and empty `WEB_ORIGIN` throws
`Missing required environment variable: WEB_ORIGIN` from `requireEnv` (`src/env.ts`) at the
auth endpoints — the CORS failure is silent, the auth one is named.

## Stripe

The CLI stores several accounts as named *projects*. `cat ~/.config/stripe/config.toml`
lists them; each `[name]` section is a project and its keys reveal whether it is test or
live mode. `default` is a project like any other and was **not** the right one on the
machine this was verified against.

Select explicitly on every call:

```bash
stripe --project-name <project> webhook_endpoints create \
  --url https://<name>-graphql.<sub>.workers.dev/stripe/webhook \
  --enabled-events checkout.session.completed
```

- `--enabled-events` is repeatable — pass it once per event, not a comma list.
- The URL is the **API** Worker's own origin plus `/stripe/webhook`, never the web
  Worker's. The route sits ahead of Yoga in `apps/graphql/src/index.ts` and deliberately
  does not go through the auth proxy. See the `project-payments` skill.
- The `whsec_` in the create response is shown **once**. Capture it straight into
  `wrangler secret put STRIPE_WEBHOOK_SECRET`; re-revealing it later means a dashboard trip.
- The deployed endpoint's secret is not the local `stripe listen` one. Mixing them gives a
  400 that reads exactly like a forged signature.
- `webhook_endpoints list` / `delete` are the verified cleanup surfaces.

**A live-mode project is a hard stop.** If the resolved project's config holds a live key,
say so and ask before anything is created, and never pipe a live key into a secret.

## Resend, and the browser fallback

Resend has no public API for creating API keys, so this step is a browser step. So is any
vendor signup where the user has no account yet (Neon, Resend, Stripe, Cloudflare).

Drive it with the `mcp__claude-in-chrome` tools, in this order:

1. `tabs_context_mcp` — always first. It reports what tabs exist and which are permitted;
   acting before it is how you end up typing into someone's unrelated tab.
2. `tabs_create_mcp` / `navigate` — open `https://resend.com/api-keys` in a **new** tab.
3. `read_page` — read before clicking. Prefer it to screenshots; it is cheaper and the
   result is text you can quote back to the user.
4. `computer` — only for what `read_page` cannot do: clicking the create button, typing a
   key name.

Then: copy the `re_` key straight into `wrangler secret put RESEND_API_KEY` and into
`apps/graphql/.env.development`. Never echo it into the transcript.

`MAIL_FROM` ships as `<name> <onboarding@resend.dev>` — the rename fills in `<name>`, and
`onboarding@resend.dev` is Resend's shared sender, which needs no verified domain but
**only delivers to the Resend account owner's own address**. `MAIL_TEST_RECIPIENTS` is the
address that mail is allowed to reach, and it ships **blank** in both `.env.example` and
`wrangler.jsonc` — blank is fail-closed, `src/mail.ts` refuses every recipient. It is the
one value `/setup` asks the user for outright, in Phase 3; use that same answer here, and it
should normally be the Resend account owner's address. A custom domain is later work, not
setup.

## Secrets

Four, all on `apps/graphql`, all set the same way — `wrangler secret put` reads stdin, so
nothing has to pass through a clipboard:

```bash
printf %s "$SECRET" | npx wrangler@4 secret put BETTER_AUTH_SECRET
```

| Secret                  | Source                                                     |
| ----------------------- | ---------------------------------------------------------- |
| `BETTER_AUTH_SECRET`    | `openssl rand -base64 32` (the same value as local, or a new one) |
| `RESEND_API_KEY`        | the browser step above                                     |
| `STRIPE_SECRET_KEY`     | the resolved Stripe project's **test** key                 |
| `STRIPE_WEBHOOK_SECRET` | the `whsec_` from `webhook_endpoints create`               |

Guard the Stripe one: refuse anything not containing `_test_` unless the user has
explicitly said they want live mode and confirmed the account.

## Undo

Everything Phase 4 creates is deletable, and knowing that up front is what makes the
account gate recoverable rather than terminal:

```bash
npx wrangler@4 delete --name <worker> --force
npx wrangler@4 hyperdrive delete <id>
stripe --project-name <project> webhook_endpoints delete <we_id>
```

Neon projects are deleted from the console.

## Verified surfaces — as of 2026-09-06

Checked live: neonctl 4.14.1, wrangler 4, stripe CLI 1.45.1. Every flag on this page comes
from that check. **If a flag you want is not on this page, it is not verified** — do that
step in the vendor's web console and tell the user why, rather than guessing.
