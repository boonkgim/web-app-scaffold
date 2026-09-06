---
name: project-auth
description: Work with authentication in cc4-test — magic-link sign-in, sessions, the Better Auth server in apps/graphql, the same-origin proxy in apps/web, and the generated auth tables in packages/db. Use when a feature needs to know who the visitor is, when a resolver or page must be restricted, or when the auth configuration changes.
---

# auth — the surface that spans all three layers

## Sign-in is a magic link, and only a magic link

There is no password anywhere in this repo — no field, no column, no reset flow. A visitor
gives an address, Better Auth's `magicLink` plugin mails a single-use link, and following
it both creates the session and proves the address. `packages/email`'s `renderSignInEmail`
is that mail.

Three consequences that catch people:

- **There is no sign-up.** An address the database has not seen gets a row when the link is
  followed. UI must never say "no account with that address" — see the oracle rule below.
- **Mail delivery is the login path.** If Resend is down, nobody can sign in. That is the
  trade; it is not a bug to route around with a back door.
- **Adding password sign-in is a decision, not a tweak.** It changes a security default and
  brings back a whole pipeline. Slice 6's plan carries the variant; read it rather than
  enabling `emailAndPassword` and hoping.

## Shape

The browser talks **only** to `apps/web`, which mounts `/api/auth/*` as a transparent proxy
(`src/app/api/auth/[...all]/route.ts` → `apiFetch` in `src/lib/api.ts`) and forwards it over
the `API` service binding. Better Auth runs in `apps/graphql` (`src/auth.ts`), where the
Hyperdrive binding is. Its tables are generated into `packages/db/src/auth-schema.ts`. The
session cookie is host-only on the web origin.

Why, and do not undo it: `workers.dev` is on the Public Suffix List, so a cookie cannot span
`cc4-test-web` and `cc4-test-graphql`. The alternative is `SameSite=None` plus credentialed
CORS — what `apps/graphql/src/cors.ts` exists to switch off.

## Owns / never touches

- **Owns:** `apps/graphql/src/auth.ts`, `src/auth-options.ts`, `auth.config.ts`,
  `src/schema/auth/**`; `apps/web/src/lib/auth-client.ts`, `src/components/auth-panel.tsx`,
  `src/app/api/auth/[...all]/route.ts`.
- **No auth logic in the proxy.** It forwards a request and returns a response. Anything
  inspecting or rewriting a session there is a second auth implementation.
- **Never give the browser client a `baseURL`.** `createAuthClient()` defaults to the page's
  origin. Naming the API Worker sets the cookie on an origin the app is not served from, and
  fails silently, in production only.
- **Never hand-edit `packages/db/src/auth-schema.ts`.** Regenerate it (below).
- **Never trust a client-supplied identity.** A user id in a GraphQL argument is a claim. The
  session comes from `ctx.request.headers`.
- **Never let the sign-in form answer whether an address has an account.** Same message, same
  timing, whether or not the row exists. `SERVER_ERRORS` in `auth-panel.tsx` has no
  `USER_NOT_FOUND` entry on purpose; adding one turns the form into a membership oracle.
- **`callbackURL` is a path, never a URL from the browser.** Better Auth resolves it against
  `baseURL`. Passing an absolute one through makes the mailed link an open redirect that
  arrives carrying a fresh session.
- The sign-in mail is `@cc4-test/email`'s `renderSignInEmail`, sent from the
  `sendMagicLink` callback `createAuth` passes into `authOptions`. Template and copy belong
  to the `email` skill.

## Reading the session

In a resolver — `ctx` is the Worker env plus Yoga's `request`:

```ts
const session = await createAuth(ctx).api.getSession({
  headers: ctx.request.headers,
});
if (!session) return null; // or throw, for a field that requires one
```

In a server component, `graphqlFetch` already forwards the cookie, so `{ viewer { email } }`
in the page's query is all of it. In a client component, `authClient.useSession()`.

Signed out is an answer, not an error — hence a nullable `viewer`. A field that genuinely
requires a session should **throw**, so the client can tell "nobody is signed in" from "you
may not see this".

## Changing the auth configuration

`src/auth-options.ts` is shared by the running server and the schema generator, so a change
there can move the tables. Two commands, and they are **not** automatic:

```bash
pnpm --filter @cc4-test/graphql auth:generate   # rewrites packages/db/src/auth-schema.ts
pnpm --filter @cc4-test/db generate             # drizzle-kit diffs it into a migration
#   ↳ READ THE GENERATED SQL
pnpm --filter @cc4-test/db migrate
```

`auth:generate` is not part of `turbo codegen`: it runs in `apps/graphql` and writes into
`packages/db`, which would be a dependency cycle. Adding a plugin and skipping this is the
failure mode — everything typechecks and the runtime queries a column that does not exist.

## Judgment calls

- **`createAuth(env)` is per request.** Never hoist it: bindings and secrets do not exist at
  import time on a Worker.
- **`authOptions` is a function, and the argument is the whole reason.** It takes the magic
  link sender because that is the one option the schema generator cannot supply. Everything
  else lives inside it, so `auth.config.ts` and the running server describe the same tables.
  Never add a plugin to `src/auth.ts` directly — it will be missing from the generator.
- **The client's plugin list must mirror the server's.** `magicLinkClient()` missing from
  `src/lib/auth-client.ts` does not fail to compile; it makes `signIn.magicLink` undefined.
- **`BETTER_AUTH_URL` is the web origin**, never this Worker's. It is what Better Auth
  validates the browser's `Origin` against, and what `trustedOrigins` is built from.
- **`BETTER_AUTH_SECRET` is a secret, not a var**: `wrangler secret put` in production,
  `.env.development` locally, different values. A shared key makes a local session valid in
  production.
- **Rate limiting is in-memory, so per-isolate on Workers** — much weaker than it reads, and
  the endpoint it fails to protect **sends mail** to any address given to it. KV
  `secondaryStorage` is the fix. Treat it as outstanding, not as handled.
- **Requesting a link issues no session.** UI that assumes a signed-in user after the form is
  submitted is wrong; say a mail is on its way and nothing more.
- **The link is built from `baseURL`**, so it lands on the web origin and is proxied back.
  Nothing works if `BETTER_AUTH_URL` names the API Worker — it mails a dead link.
- **`MAIL_TRANSPORT=log` prints the link** (`url=` on the `[mail:log]` line). That is how you
  sign in locally, and how the integration tests do it. Never on the `resend` branch.
- Changing the route prefix means changing `authOptions.basePath` **and** the
  `src/app/api/auth/` directory name. A route segment is a directory, not a value.

## Enforced elsewhere

- `apps/graphql/src/auth.int.test.ts` drives request-link → read the link off the mail log →
  follow it → `viewer`, against real Postgres, including the anonymous case and that a spent
  link does not work twice. Needs `docker compose up -d`, and runs with `MAIL_TRANSPORT=log`
  so it sends nothing.
- `apps/graphql/src/auth.test.ts` pins the routing switch, including the plugin's
  `/magic-link/verify` route and that `/api/authorize` is not claimed by a prefix match.
- `apps/web/src/lib/api.test.ts` pins cookie forwarding and both proxy branches. The
  production case asserts global `fetch` was _not_ called — the bug that would send session
  traffic out of Cloudflare's network.

