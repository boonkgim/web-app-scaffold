---
name: project-web
description: Change the cc4-test Next.js app in apps/web — pages, components, typed GraphQL operations, and theming. Use when a feature needs UI, a new query from the web side, or a re-theme. Covers typed documents from codegen, the graphqlFetch boundary, the theme token contract, and the vendored shadcn checkout.
---

# web layer — `apps/web`

## Owns / never touches

- **Owns:** `src/app/**` (routes), `src/components/**`, `src/lib/**`, `src/styles/theme.css`.
- **Never imports `@cc4-test/db`.** Web reaches data only through the GraphQL API. The
  dependency graph is what enforces the architecture.
- **Never edits `src/generated/**`** — regenerated from the API's merged SDL.
- **This is not the Next.js you know.** Next 16 has breaking changes against training data:
  read the relevant guide in `node_modules/next/dist/docs/` before reaching for an API from
  memory. `export const dynamic` is gone — `connection()` replaces it.

## Query mechanics

```bash
# 1. write the operation inside graphql`...` from @/generated
# 2. pnpm turbo codegen --filter @cc4-test/web    # types it off apps/graphql's merged SDL
# 3. call it with graphqlFetch from @/lib/api
```

```ts
const HomeQuery = graphql(`
  query Home {
    version
    health
    appEnv
  }
`);
const res = await graphqlFetch(HomeQuery);
```

- `documentMode: "string"` — the document is a **String subclass, not a DocumentNode**.
  Don't `print()` it and don't pull the graphql runtime into the Worker bundle to send it.
- `graphqlFetch` already calls `connection()` at the boundary, because reading Worker
  bindings needs a real request and `getCloudflareContext()` throws during prerender.
  **Don't add your own prerender opt-out in a page** — the helper is where it belongs so a
  new page cannot forget it.
- Variables are positional-by-type: the argument is required exactly when the operation
  declares variables.

## Theme

- **`src/styles/theme.css` holds every token _value_ and is the only file a re-theme
  touches.** No component changes, because no component names a colour.
- `src/app/globals.css` holds the `@theme inline` mapping and changes only when the token
  _vocabulary_ grows.
- **Every colour token needs both a `:root` and a `.dark` value.** A token missing its dark
  value silently renders its light one.
- **Dark mode is a `.dark` class, never `prefers-color-scheme`** — a media query cannot be
  toggled.
- **Fonts are not in `theme.css`, deliberately.** `next/font` self-hosts the file and emits a
  hashed variable, so there is no value to write in CSS. A font swap is the two `next/font`
  calls in `layout.tsx` and nothing else — that is what `--font-sans-src` / `--font-mono-src`
  are named for. Never put a `font-family` declaration in `theme.css` or a `body` rule.
- **`src/components/ui/**` is a vendored checkout of the shadcn registry**, not code we
  write. The CLI owns it and `shadcn add` rewrites it, so an edit there is a fork you are
  choosing to maintain. Compose around these components rather than editing them — e.g.
  `CardHeader` becomes a `grid-cols-[1fr_auto]` when it contains a `CardAction`, so put a
  header control in that slot instead of fighting it with flex utilities.
- **`shadcn add` appends to `globals.css`.** If a new component brings new tokens, keep the
  `@theme inline` mapping line there and move the _values_ down into `theme.css`. Same for
  `shadcn apply --only theme`, which writes a token block into `globals.css` where it sits
  after the `@import` of `theme.css` and wins on cascade — move it, or the file you edit is
  the one that does nothing.

## Judgment calls

- **No component ever names a colour.** Semantic tokens only: `bg-background`,
  `text-muted-foreground`, `text-destructive`.
- `NEXT_PUBLIC_*` must be written as a **literal member expression**
  (`process.env.NEXT_PUBLIC_APP_ENV`). `process.env[name]` and destructuring are not
  inlined by `next build` and arrive `undefined` in the browser. Nothing secret ever gets
  the `NEXT_PUBLIC_` prefix.
- New binding in `wrangler.jsonc` → `pnpm cf-typegen`.
- `next dev` rewrites the rules block in `AGENTS.md`. Committing that with your work keeps
  the tree clean; removing it just re-creates the uncommitted change.

## Enforced elsewhere

- The palette rule: `no-restricted-syntax` in `apps/web/eslint.config.mjs` fails lint with
  _"Raw palette colour in className. Use a semantic token…"_. It matches both string and
  template-literal `className`s, and skips `src/components/ui/**`.
- `src/styles/theme.test.ts` asserts the seam from the other side: every mapped token is
  declared, every colour token has a dark value, and the dark block overrides nothing the
  light block never declared.
- `--max-warnings 0` is part of `lint` — a warning that does not fail is a rule nobody obeys.
