---
name: graphql
description: Change the cc4-test GraphQL API in apps/graphql — SDL schema modules, resolvers, codegen. Use when a feature needs a new field, query, or mutation, or when a resolver must change. Covers the schema module layout, the graphql-codegen server preset that scaffolds resolver files, orphan cleanup, and the Worker context.
---

# graphql layer — `apps/graphql`

## Owns / never touches

- **Owns:** SDL modules at `src/schema/<module>/schema.graphql`, with resolvers colocated
  at `src/schema/<module>/resolvers/Query/<field>.ts`. Also the merged
  `src/schema/schema.generated.graphqls` — the published artifact `apps/web` types itself
  against.
- **A new feature gets a new module directory, not a line in someone else's.**
  `system/` is health/version/appEnv only.
- **Never hand-write a file under `src/schema/*/resolvers/`.** The codegen preset owns that
  tree and re-annotates every file in it via ts-morph on each run. **If the resolver file
  isn't there, you haven't run codegen yet** — that is the whole failure mode this rule
  exists to prevent.
- **Never edit `*.generated.*` or `schema.generated.graphqls`** — regenerate instead. They
  are committed (so `apps/web` needs no build ordering to read them) but machine-owned, and
  the eslint base ignores `**/*.generated.ts` entirely.

## Codegen mechanics

```bash
# 1. edit src/schema/<module>/schema.graphql
# 2. then, ONCE — after ALL SDL edits are complete, not after each one:
pnpm turbo codegen --filter @cc4-test/graphql
# 3. implement the resolver files it scaffolded
```

One run scaffolds a resolver file per **root** field, wires every one into
`resolvers.generated.ts`, regenerates `types.generated.ts`, and rewrites the merged
`schema.generated.graphqls`.

`resolverGeneration: "minimal"` means **only root fields get files**. Object fields like
`Item.name` are served by GraphQL's default resolvers — don't write files for them.

Resolvers take `(_parent, _args, ctx)`. The underscore prefix is the repo's
deliberately-unused marker and the eslint base is configured for it. `ctx` is the Worker
env (`contextType: "../context#Env"`), so every binding and var a resolver needs is reached
through it:

```ts
const origins = ctx.CORS_ORIGINS;
```

New binding in `wrangler.jsonc` → `pnpm cf-typegen` to retype `WorkerEnv`.

## Judgment calls

- **Removing a field leaves an orphan resolver file.** Codegen unwires it from
  `resolvers.generated.ts` but does **not** delete it from disk. Verified behaviour — it is
  not silent: `pnpm typecheck` then fails with
  `Property 'X' does not exist on type 'QueryResolvers'`, naming the exact file. **Delete
  that file.** Don't try to make it compile.
- Sequential SDL edits followed by one codegen run is the correct rhythm. Running codegen
  against half-finished SDL scaffolds resolvers for fields you're about to rename, and each
  one becomes an orphan to clean up.
- `wrangler.jsonc` carries production-only `vars` — today `CORS_ORIGINS` and `APP_ENV`.
  `wrangler dev` overlays `.env.development` on top, which is what keeps a localhost origin
  out of the deployed allowlist. Don't merge the two. Any binding whose id Cloudflare hands
  out is added to this file by hand, which is why `scripts/docs-check.ignore` baselines it.

## Enforced elsewhere

- The server preset generates a file per root field and wires it in, so **a field can never
  be silently unresolved** — unlike a bare `Resolvers` type, whose fields are all optional.
  `pnpm typecheck` catches the gap.
- `pnpm test:unit` catches a scaffolded resolver left as a stub.
- `src/cors.test.ts` drives the real `worker.fetch`, so the CORS allowlist is proven as
  headers a browser would receive rather than as a function returning an object.
- This package's `integration` vitest project (`src/**/*.int.test.ts`) is wired and empty.
  Nothing here has a real dependency to integrate against yet; the slice that gives it one
  writes the first file into it.
