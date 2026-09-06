# Contributing

Thanks for taking an interest. This is a scaffold, so the bar for a change is slightly
unusual: it has to be right, and it has to stay _explained_.

## Setting up

See [Getting started](README.md#getting-started) in the README. Short version:

```bash
pnpm install
cp apps/graphql/.env.example apps/graphql/.env.development
cp apps/web/.env.example     apps/web/.env.development
cp packages/db/.env.example  packages/db/.env.development
# then read those three files and fix the values they describe
docker compose up -d --wait
pnpm --filter @web-app-scaffold/db migrate
pnpm dev
```

You do not need a Cloudflare, Neon, Stripe or Resend account to work on this. The local
stack runs against Docker Postgres and sends no mail.

## Before you open a pull request

```bash
pnpm verify
```

That is the whole gate: `format:changed → docs:check → lint → typecheck → test:unit`,
scoped to the packages you touched. CI runs the same thing plus integration tests. If
`pnpm verify` is green locally, CI should be too.

Integration tests need Docker Postgres up and migrated:

```bash
docker compose up -d --wait
pnpm --filter @web-app-scaffold/db migrate
pnpm test:integration
```

## The conventions that actually matter

**`docs/setup/` is part of the code.** The eight slice documents are the plan of record,
and `pnpm docs:check` mechanically compares them against the repo — every file the plan
writes as a heredoc, and every `pnpm pkg set` it performs. If you change a file the plan
describes, update the plan in the same commit. A red `docs:check` is not a formatting nit;
it means the explanation and the code disagree, and one of them is lying to the next
reader.

If a mismatch is genuinely expected and permanent, baseline it in
`scripts/docs-check.ignore` **with the reason**. The script fails on entries that no longer
mismatch, so that file cannot quietly rot.

**Account-coupled values ship empty, and empty fails closed.** `CORS_ORIGINS` with no value
allows no origin. `MAIL_TEST_RECIPIENTS` with no value refuses every recipient. Never add a
fallback that turns an unset value into a permissive default — if a missing value should be
an error, use `requireEnv` so it throws with the variable's name.

**Never commit a credential.** The `.env.example` files are committed with dummy values as
a checklist; the real `.env.development` and `.env.production` are gitignored. Production
secrets belong in `wrangler secret put`, never in a `vars` block.

**No component names a colour.** Tailwind palette utilities in `className` are an ESLint
error outside `src/components/ui` (a vendored shadcn checkout). Add a token to
`apps/web/src/styles/theme.css` instead. See `.claude/skills/project-ui/SKILL.md`.

**Unit tests need no credential and no container.** If a test needs either, name it
`*.int.test.ts` — that is what puts it in the integration project.

**Comments explain why, not what.** Especially where the obvious choice is wrong. Much of
this repo's value is in the comment that stops the next person re-making a decision that
was already tested and rejected.

## Commit messages

Short imperative subject, then a body explaining _why_ if the reason is not obvious from
the diff. Wrap at 88 characters. No trailers.

## Working on a layer

Each layer has a skill document describing its rules and gotchas, useful whether or not you
use an AI agent:

| Area                    | Read                                       |
| ----------------------- | ------------------------------------------ |
| UI, components, theming | `.claude/skills/project-ui/SKILL.md`       |
| `apps/web`              | `.claude/skills/project-web/SKILL.md`      |
| `apps/graphql`          | `.claude/skills/project-graphql/SKILL.md`  |
| `packages/db`           | `.claude/skills/project-db/SKILL.md`       |
| `packages/email`        | `.claude/skills/project-email/SKILL.md`    |
| Auth                    | `.claude/skills/project-auth/SKILL.md`     |
| Payments                | `.claude/skills/project-payments/SKILL.md` |

## Reporting bugs

Open an issue with what you ran, what you expected, and what happened — including the
output. If it involves the local stack, `docker compose ps` and your Node and pnpm versions
help.

Security vulnerabilities go through [SECURITY.md](SECURITY.md) instead. Please don't open a
public issue for those.

## Code of conduct

Participation is governed by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
