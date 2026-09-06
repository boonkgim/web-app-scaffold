---
name: graphql
description: Change the cc4-test GraphQL API in apps/graphql — SDL schema modules, resolvers, codegen. Use when a feature needs a new field, query, or mutation, or when a resolver must change. Covers the schema module layout, the graphql-codegen server preset that scaffolds resolver files, orphan cleanup, and the Worker context.
---

# graphql layer — `apps/graphql`

## Owns / never touches

- **Owns:** SDL modules at `src/schema/<module>/schema.graphql`, with resolvers colocated
  at `src/schema/<module>/resolvers/{Query,Mutation}/<field>.ts`. Also the merged
  `src/schema/schema.generated.graphqls` — the published artifact `apps/web` types itself
  against.
- **A new feature gets a new module directory, not a line in someone else's.**
  `system/` is health/version/appEnv, `mail/` is sendTestEmail, `auth/` is the viewer.
- **This Worker also serves Better Auth**, at `authOptions.basePath` — `src/index.ts`
  routes there before Yoga. Read the `auth` skill before touching `src/auth*.ts`.
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

One run scaffolds a resolver file per **root** field — `Query` and `Mutation` alike — wires
every one into `resolvers.generated.ts`, regenerates `types.generated.ts`, and rewrites the
merged `schema.generated.graphqls`.

`resolverGeneration: "minimal"` means **only root fields get files**. Object fields like
`Item.name` and `Viewer.email` are served by GraphQL's default resolvers — don't write
files for them.

Resolvers take `(_parent, _args, ctx)`. The underscore prefix is the repo's
deliberately-unused marker and the eslint base is configured for it. `ctx` is the Worker
env plus Yoga's `request` (`contextType: "../context#Env"`), so every binding and var a
resolver needs is reached through it:

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
- **A nullable field's unimplemented stub typechecks clean** and returns null forever —
  `void` is assignable to `T | null | undefined`. `pnpm test:unit`'s stub scan is the only
  thing that catches it. `viewer` is the first such field.
- `wrangler.jsonc` carries production-only `vars` — today `CORS_ORIGINS`, `APP_ENV`, the
  mail keys and `BETTER_AUTH_URL`. `wrangler dev` overlays `.env.development` on top, which
  is what keeps a localhost origin out of the deployed allowlist. Don't merge the two. Any
  binding whose id Cloudflare hands out is added to this file by hand, which is why
  `scripts/docs-check.ignore` baselines it.
- **An account-scoped field takes the account as an argument; it never infers one from the
  session.** The session answers _who is asking_, not _which account they are acting for_ — and
  those two separate the moment one user may act on another's behalf, or holds more than one
  account. A resolver that reads the account off the viewer can only ever serve the caller's own
  rows, so delegated access then arrives as a signature change on every field instead of a row in
  a grant table. `orders(accountId: ID!)`, not `orders`.
- **The argument and the grant check are one rule, and half of it is an IDOR.** An `accountId`
  off the wire is a claim — the `auth` skill's _never trust a client-supplied identity_ — so the
  resolver's first act, before any other argument is validated and before any read, is checking
  the viewer's grant on that account; the read is then scoped to it as well, because authorising
  and then reading unscoped stays correct only until someone refactors the filter. Fail
  identically for "no such account" and "no grant on it": two distinguishable errors are an
  enumeration oracle. The `auth` skill holds the check itself.

## Enforced elsewhere

- The server preset generates a file per root field and wires it in, so **a field can never
  be silently unresolved** — unlike a bare `Resolvers` type, whose fields are all optional.
  `pnpm typecheck` catches the gap.
- `pnpm test:unit` catches a scaffolded resolver left as a stub.
- `src/cors.test.ts` drives the real `worker.fetch`, so the CORS allowlist is proven as
  headers a browser would receive rather than as a function returning an object.
- This package's `integration` vitest project (`src/**/*.int.test.ts`) runs the real Worker
  against real Postgres: `src/index.int.test.ts` (Slice 3) and `src/auth.int.test.ts`
  (Slice 6). Both need `docker compose up -d`.
