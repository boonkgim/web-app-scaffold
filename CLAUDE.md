# web-app-scaffold

pnpm workspace. What is in it:

- `apps/web` — Next.js on Cloudflare Workers via OpenNext. Holds the theme: every token
  value is in `src/styles/theme.css` and no component names a colour. See
  `.claude/skills/project-web/SKILL.md`.
- `apps/graphql` — GraphQL Yoga Worker: the SDL modules and the resolvers implementing
  them. `apps/web` reads its merged `schema.generated.graphqls` and reaches it over the
  `API` service binding. See `.claude/skills/project-graphql/SKILL.md`.
- `packages/db` — Drizzle schema, migrations and the client factory. Postgres in Docker
  locally, Neon through Hyperdrive in production. `apps/graphql` is its only consumer;
  `apps/web` never imports it. See `.claude/skills/project-db/SKILL.md`.
- `packages/email` — React Email templates and the Resend transport. `apps/graphql` is its
  only consumer. See `.claude/skills/project-email/SKILL.md`.
- `packages/config` — shared tsconfig and ESLint base, extended by every package.

## Running it locally

`pnpm dev` brings up `apps/web` (3000) and `apps/graphql` (8787) against Docker Postgres,
but that alone does not forward Stripe webhooks. When starting the local server for work
that touches checkout, also start, in its own terminal:

```bash
stripe listen --events checkout.session.completed --forward-to localhost:8787/stripe/webhook
```

Otherwise `/stripe/webhook` never receives an event. See
`.claude/skills/project-payments/SKILL.md`.
