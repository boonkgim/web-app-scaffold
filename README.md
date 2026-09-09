# web-app-scaffold

A full-stack web application scaffold that runs entirely on Cloudflare's edge — and a
written record of how it was built, one infrastructure slice at a time.

Most starter templates hand you a finished tree and leave you to reverse-engineer the
decisions. This one ships `docs/setup/`: eight slice documents that build the stack from an
empty directory, each recording what was tried, what broke, and why the surviving choice
won. A script (`pnpm docs:check`) reconciles those documents against the code on every
run, so the explanation cannot quietly drift from the thing it explains.

> **Status:** the scaffold carries **nobody's accounts**. Every account-coupled value —
> origins, contact addresses, resource ids — ships as an empty string and fails closed, so
> a fresh clone cannot reach the author's resources even by accident.

## The stack

| Layer             | What it is                                                                    |
| ----------------- | ----------------------------------------------------------------------------- |
| `apps/web`        | Next.js on Cloudflare Workers via OpenNext. Owns the theme.                   |
| `apps/graphql`    | GraphQL Yoga Worker — SDL modules and the resolvers implementing them.        |
| `packages/db`     | Drizzle schema, migrations, client factory. Postgres in Docker; Neon in prod. |
| `packages/email`  | React Email templates and the Resend transport.                               |
| `packages/config` | Shared tsconfig and ESLint base, extended by every package.                   |

Auth is [Better Auth](https://better-auth.com) with magic-link sign-in. Payments are
Stripe embedded Checkout with a signature-verified webhook. The workspace is pnpm +
[Turborepo](https://turbo.build).

### How the pieces talk

`apps/web` never imports `packages/db`. It reaches the API over a Cloudflare **service
binding** (`API`), and reads the API's merged `schema.generated.graphqls` at build time to
generate typed documents. `apps/graphql` is the only consumer of `packages/db` and
`packages/email`. That boundary is structural, not a convention: `apps/web` does not
declare either package as a dependency, so in a pnpm workspace the import does not
resolve. The browser-facing Worker holds no database credential and no mail credential,
because it never has a reason to.

In production, `packages/db` talks to Neon through **Hyperdrive**, so the connection string
lives at Cloudflare rather than in this repo. That is why `wrangler.jsonc` is safe to
commit.

## Getting started

**Requirements:** Node ≥ 24, pnpm 11, Docker with the Compose plugin. Cloud CLIs
(`wrangler`, `stripe`) are only needed if you deploy.

### The guided path

If you use [Claude Code](https://claude.com/claude-code), the repo ships a `/setup-development`
skill that does all of the below — checks your toolchain, renames the project off the
template name, and brings up a complete local stack against Stripe test mode and Resend in
your own accounts:

```
/setup-development
```

Nothing here is deployed and nothing costs money. When you're ready to put it on real
infrastructure for the first time, `/setup-production` provisions Neon, Cloudflare and the
deployed Stripe webhook — and it stops and asks before anything creates a real resource in a
real account. After that first deploy, shipping every later change is `/deploy-production`,
not `/setup-production` again.

### By hand

```bash
pnpm install

cp apps/graphql/.env.example apps/graphql/.env.development
cp apps/web/.env.example     apps/web/.env.development
cp packages/db/.env.example  packages/db/.env.development
```

Each `.env.example` is a **commented checklist with dummy values**, not a ready-to-use
file. Read it. Two edits are not optional:

- `packages/db/.env.development` → `DATABASE_URL=postgres://postgres:postgres@localhost:5434/web-app-scaffold`
  — port **5434**, not 5432 (`docker-compose.yml` maps `5434:5432`).
- `apps/graphql/.env.development` → `BETTER_AUTH_SECRET`, from `openssl rand -base64 32`.
  Paste only the value; some generators print the whole `KEY=value` line.

Then bring it up:

```bash
docker compose up -d --wait          # --wait blocks until Postgres actually accepts connections
pnpm --filter @web-app-scaffold/db migrate
pnpm dev
```

`--wait` is load-bearing: without it the container reports "up" seconds before the socket
answers, and `migrate` races it.

| Service       | URL                                                                       |
| ------------- | ------------------------------------------------------------------------- |
| Web           | http://localhost:3000                                                     |
| GraphQL       | http://localhost:8787/graphql                                             |
| Email preview | http://localhost:3001 (`pnpm --filter @web-app-scaffold/email email:dev`) |
| Postgres      | `localhost:5434`                                                          |

No cloud account is needed for any of this, and none of it costs money. Local mail renders
to the log and sends nothing (`MAIL_TRANSPORT=log`), so a wrong address surfaces as a log
line rather than a bounce.

`pnpm dev` does not forward Stripe webhooks by itself. Working on checkout needs one more
process, in its own terminal:

```bash
stripe listen --events checkout.session.completed --forward-to localhost:8787/stripe/webhook
```

Without it, `/stripe/webhook` never receives an event and a completed checkout looks like
nothing happened. See `.claude/skills/project-payments/SKILL.md` for the `whsec_` it prints
and why the `--events` filter matters.

## The verify loop

```bash
pnpm verify
```

One command, and the one to run before every commit. It chains
`format:changed → docs:check → lint → typecheck → test:unit`, scoped by Turborepo to the
packages your change actually touched.

| Command                 | What it does                                                  |
| ----------------------- | ------------------------------------------------------------- |
| `pnpm verify`           | the full pre-commit loop, on changed packages                 |
| `pnpm docs:check`       | reconcile `docs/setup/` against the repo it describes         |
| `pnpm test:unit`        | unit tests everywhere — no Docker, no network                 |
| `pnpm test:integration` | integration tests — **needs Docker Postgres up and migrated** |
| `pnpm build`            | production build of every package                             |

Unit tests never require a credential or a running container. If a test needs either, it is
an integration test and belongs in a `*.int.test.ts` file.

## Deploying

Going live for the first time is `/setup-production`. The order is a dependency chain with
a cycle in it — the API needs the web Worker's URL for CORS, and the web Worker needs the
API to exist. `/setup-production` walks it; `docs/setup/` explains it. Briefly:

1. Neon project → **direct** (unpooled) connection string
2. Hyperdrive binding → id into `apps/graphql/wrangler.jsonc`
3. Deploy `graphql`, learn its URL
4. Deploy `web`, learn its URL
5. `CORS_ORIGINS` + `WEB_ORIGIN` ← step 4, then **redeploy graphql**
6. Stripe webhook at step 3's URL + `/stripe/webhook`
7. `wrangler secret put` × 4

Secrets are set with `wrangler secret put` and stored by Cloudflare. A `vars` entry would
be plaintext in a committed file, which is why the four secrets have no counterpart there.

Once that infrastructure exists, shipping every later feature is `/deploy-production` — it
runs the migration review, deploys the API then the web app in that order, and observes the
live result. It never provisions anything; that stays `/setup-production`'s job, run once.

## Repo conventions

- **No component names a colour** — enforced by an ESLint rule that rejects palette
  utilities in `className`. Every token value lives in `apps/web/src/styles/theme.css`, so
  a re-theme is one file. See `.claude/skills/project-ui`.
- **Account-coupled values ship empty**, and empty fails closed — `CORS_ORIGINS` allows no
  origin, `MAIL_TEST_RECIPIENTS` refuses every recipient. An empty value must never be
  read as a permissive default.
- **`docs/setup/` is part of the code.** It is renamed with the code and checked against
  it. Changing a file the plan writes means updating the plan.
- Comments explain **why**, especially where the obvious choice is wrong. There are a lot
  of them, and that is on purpose.

Working on this with an AI agent? `CLAUDE.md` and `.claude/skills/project-*` carry the
per-layer rules.

## Contributing

Not accepting pull requests for now — but issues are very welcome, especially the scaffold
failing on a fresh clone. [CONTRIBUTING.md](CONTRIBUTING.md) documents the repo's
conventions. For security issues see [SECURITY.md](SECURITY.md), and please don't open a
public issue for those.

## Licence

MIT — see [LICENSE](LICENSE).
