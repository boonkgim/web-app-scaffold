# cc4-test

pnpm workspace. What is in it:

- `apps/web` — Next.js on Cloudflare Workers via OpenNext.
- `apps/graphql` — GraphQL Yoga Worker: the SDL modules and the resolvers implementing
  them. `apps/web` reads its merged `schema.generated.graphqls` and reaches it over the
  `API` service binding. See `.claude/skills/project-graphql/SKILL.md`.
- `packages/config` — shared tsconfig and ESLint base, extended by every package.
