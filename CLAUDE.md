# cc4-test

pnpm workspace. What is in it:

- `apps/web` — Next.js on Cloudflare Workers via OpenNext. Holds the theme: every token
  value is in `src/styles/theme.css` and no component names a colour. See
  `.claude/skills/project-web/SKILL.md`.
- `apps/graphql` — GraphQL Yoga Worker: the SDL modules and the resolvers implementing
  them. `apps/web` reads its merged `schema.generated.graphqls` and reaches it over the
  `API` service binding. See `.claude/skills/project-graphql/SKILL.md`.
- `packages/config` — shared tsconfig and ESLint base, extended by every package.
