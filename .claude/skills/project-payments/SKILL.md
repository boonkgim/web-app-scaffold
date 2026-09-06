---
name: project-payments
description: Work with Stripe in cc4-test — embedded Checkout Sessions from apps/graphql, the form mounted in apps/web, the signed webhook at /stripe/webhook, and the stripe_event table in packages/db. Use when a feature takes money, when a Stripe event must be acted on, or when the Stripe configuration changes.
---

# payments — Stripe, across three layers

## Shape

Checkout is **embedded**: Stripe's form runs in an iframe on our own origin, and the
browser never navigates to Stripe.

```
apps/web  ──server action──▶ apps/graphql ──▶ Stripe API     (create a session)
          ◀──────── client secret ◀───────────────────────
browser   ──▶ js.stripe.com ──▶ iframe mounted on our page
Stripe    ──POST /stripe/webhook────────────▶ apps/graphql ──▶ Postgres
```

`/stripe/webhook` is on the **API** Worker's own public URL, routed in `src/index.ts` ahead
of Yoga. It is deliberately _not_ behind apps/web's auth proxy: that proxy exists so a
cookie can belong to the browser's origin, and a webhook has no cookie, no Origin, and
nothing to gain from a hop that can re-encode the bytes the signature covers.

## Owns / never touches

- **Owns:** `apps/graphql/src/stripe.ts` (client factory + mode guard),
  `src/stripe-webhook.ts` (verification + recording), `src/schema/payments/**`,
  `apps/web/src/lib/stripe.ts`, `apps/web/src/app/checkout/**`, and `stripeEvent` in
  `packages/db/src/schema.ts`.
- **`apps/web` never imports `stripe`** — the server SDK. It _does_ import
  `@stripe/stripe-js` and `@stripe/react-stripe-js`, which are the browser half and hold
  no secret. The distinction is the whole security boundary: the secret key and the
  database binding are in `apps/graphql` and stay there.
- **Never act on a Stripe object the client sent you.** A session id in a query string is a
  claim. Read it back from Stripe's API — as `checkoutSessionStatus` does — or take it
  from a verified event.
- **Never branch on `event.type` in the handler** without deciding what happens to every
  other type. Recording is type-agnostic on purpose; fulfilment is not.

## Embedded Checkout, and what the mode implies

- **`ui_mode: "embedded_page"`** — not `"embedded"`, which the API rejects outright with
  _"no longer supported. Use `embedded_page` instead."_ It is what makes `client_secret`
  present and `url` absent. Re-verified against the live API 2026-09-06.
- **There is no `cancel_url`.** The API rejects it on an embedded session. Everything comes
  back through `return_url`, so the return page must handle `OPEN` — a declined card — and
  not assume it means success.
- **`return_url` carries `{CHECKOUT_SESSION_ID}`**, which Stripe substitutes. Anything the
  return page says about that id must be read back from Stripe first.
- **`fetchClientSecret`, not a rendered `clientSecret`.** A secret in the page means a
  session created for every visitor who loads the route, and no way to get a fresh one
  when the visitor retries.
- **`loadStripe` at module scope, exactly once.** It injects a script tag; calling it in a
  render re-runs that. Stripe.js is loaded from `js.stripe.com` and is never bundled or
  self-hosted — that is a PCI posture, not a performance choice.
- The iframe does not inherit `theme.css` and will not follow the mode toggle. Embedded
  Checkout is styled from the account's dashboard branding settings.
- Under `pnpm preview` the form area sits **empty for about five seconds** before the iframe
  mounts. That is latency, not failure — a real key or session error logs to the console.

## The webhook, and the four things that break it

1. **Read the body once, as text, before anything parses it.** The signature covers the
   exact bytes. `request.json()` consumes the body, re-serialising gives different bytes,
   and a second read on a Workers `Request` throws.
2. **`constructEventAsync`, never `constructEvent`.** WebCrypto is async, so the sync form
   cannot work on workerd. The provider is `Stripe.createSubtleCryptoProvider()`, passed
   as the fifth argument — the fourth is the tolerance, left `undefined`.
3. **Idempotency is the primary key, not a lookup.** Insert with `onConflictDoNothing()` and
   read the returned rows. Stripe retries, and can deliver the same event concurrently, so
   a "have I seen this?" read has a window that a conflict does not.
4. **Reject with 4xx, never 5xx.** Stripe retries a 5xx for days. A body that failed
   verification will fail it every time; a duplicate is a success, so it answers 200 too.

## Keys and modes

| Value                                | Kind        | Where                                                   |
| ------------------------------------ | ----------- | ------------------------------------------------------- |
| `STRIPE_MODE`                        | var         | `wrangler.jsonc`, `.env.development` — `test` or `live` |
| `STRIPE_SECRET_KEY`                  | secret      | `wrangler secret put`, `.env.development`               |
| `STRIPE_WEBHOOK_SECRET`              | secret      | `wrangler secret put`, `.env.development`               |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | build input | `apps/web/.env.development` + `.env.production`         |

- **`createStripe(env)` is per request.** Never hoist it: secrets do not exist at import
  time on a Worker.
- **`httpClient: Stripe.createFetchHttpClient()` is named on purpose, not required.** Since
  `stripe` 22 the `workerd` export condition already resolves to a build whose default
  client is fetch and whose default crypto provider is SubtleCrypto. Naming both keeps this
  Worker correct without depending on export-condition resolution — and the node build it
  would otherwise fall back to reaches for `node:https`, failing at the first API call
  rather than at import.
- **The API's mode is named, not inferred.** `assertKeyMatchesMode` refuses a `sk_live_` key
  under `STRIPE_MODE=test` and the reverse. Deleting that check makes a live key in a dev
  deploy a silent, chargeable success.
- **Web checks its key's shape, not its mode.** A `pk_live_` in a test build fails loudly and
  charges nothing; an `sk_` in a `NEXT_PUBLIC_` var is published to every visitor.
  `assertPublishableKey` catches the second and never echoes the value.
- **The publishable key is the one credential a deploy cannot change.** It is compiled in,
  so rotating it is a rebuild of `apps/web`, not `wrangler secret put`. It is read from
  `.env.production` by `pnpm preview` as well as by `deploy:production` — keep a live key
  out of a working copy, or the next preview mounts a real payment form on localhost.
- **The local `whsec_` and the deployed one are different secrets.** The CLI's belongs to
  your machine and account and is stable across runs — `stripe listen --print-secret` prints
  it, and taking it that way _before_ starting `wrangler dev` avoids a restart; the deployed
  endpoint has its own, returned once by `stripe webhook_endpoints create` and re-revealable
  only from that endpoint's dashboard page. Swapping them gives a 400 that reads exactly
  like a forgery.
- **Local development pins port 8787.** `apps/web/src/lib/api.ts` hardcodes it for `next dev`
  and `stripe listen` forwards to it, so a second `wrangler dev` holding the port pushes the
  new one to 8788 — and the browser keeps talking to the stale Worker while deliveries land
  nowhere. Vanished deliveries: check `ss -ltnp | grep 8787`.
- **`stripe listen --events checkout.session.completed`**, mirroring the deployed
  subscription. A bare `stripe listen` forwards the whole cascade a trigger produces, and
  since the handler records every type, the newest row ends up `charge.updated`.
- The SDK pins its own Stripe API version. Upgrading `stripe` moves it — read the changelog
  rather than the diff.

## Judgment calls

- **The return page proves nothing.** It means the browser came back; a visitor can pay and
  close the tab. Only the webhook is evidence that money moved.
- **Money is integer cents, everywhere**, and `formatPrice` is the only thing that renders
  it. Nothing in a money path is a float.
- Inline `price_data` keeps the amount in the repo. Reach for a dashboard Price when a
  human needs to change it without a deploy, and accept that it is then untracked.
- **A public list field needs a server-side ceiling.** The SDL's `limit: Int! = 5` is a
  default, not a limit; `stripeEvents` clamps it.
- **A public field that takes a Stripe id is an oracle.** `checkoutSessionStatus` returns a
  status and nothing else on purpose — adding the customer's email would make it worth
  attacking.
- **Resolvers reach drizzle through `@cc4-test/db`, never `drizzle-orm` directly.** That
  package is not a dependency of `apps/graphql` and should not become one — `packages/db`
  owns the version, and its `index.ts` re-exports the operators (`eq`, `desc`, …).
- **Testing the return page needs no card.** A `stripe trigger checkout.session.completed`
  leaves a real `complete` session and any abandoned session is `open`; loading
  `/checkout/return?session_id=…` with each exercises every branch.
- **An agent cannot fill the embedded form.** The fields are in a cross-origin
  `js.stripe.com` iframe, so they never enter the accessibility tree and coordinate clicks do
  not focus them. Card entry is a human step; everything else is reachable through the CLI.
- **Prove a deployed webhook with `stripe trigger`, then `stripe events resend <evt>
--webhook-endpoint <we>`.** The first exercises the real endpoint secret end to end, the
  second is the idempotency check. Read `receivedAt`, not just the row count — a delete-and
  -reinsert bug also leaves one row, and only an unchanged timestamp rules it out. Note that
  a trigger fans out to every endpoint on the account subscribed to that event.
- **Move a test key with a pipe and a guard, never a paste.** `wrangler secret put` reads
  stdin, so a `sk_test_` key can go from the local Stripe config straight to Cloudflare
  without touching a terminal or clipboard — behind a check that exits non-zero on anything
  without `_test_`. A live key is never handled this way, or any way.

## Enforced elsewhere

- `apps/graphql/src/stripe.test.ts` pins the mode guard in both directions, including an
  unset mode.
- `apps/graphql/src/stripe-webhook.test.ts` pins the routing switch and every refusal path:
  wrong method, no signature, bad signature — all without a database binding, so a handler
  that reached one would throw instead of returning the asserted status.
- `apps/graphql/src/stripe-webhook.int.test.ts` drives a correctly signed delivery, its
  retry, and a tampered body against real Postgres. Needs `docker compose up -d`.
- `apps/web/src/lib/stripe.test.ts` pins that a secret key in the public var is refused.
  `apps/web/vitest.config.ts` supplies a dummy `pk_test_` to the unit project — that module
  guards its own `loadStripe` call at import, so without one it throws before collection.
- `apps/web/src/app/actions.test.ts` pins that a failed session rejects without surfacing
  the API's message.
- `apps/web/src/lib/formatUtc.test.ts` pins that the event time stays in UTC rather than the
  running machine's zone, and that an unparseable value is never rendered as `Invalid Date`.
