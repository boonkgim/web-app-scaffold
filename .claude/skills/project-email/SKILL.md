---
name: project-email
description: Write or change transactional email in cc4-test — React Email templates in packages/email, the render helpers, and the Resend transport. Use when a feature sends mail, when a template's copy or markup changes, or when the mail transport or sender address changes.
---

# email — `packages/email`

## Owns / never touches

- **Owns:** `emails/*.tsx` (templates), `src/render.tsx` (subject + html + text),
  `src/mailer.ts` (transports). Exported through `src/index.ts`.
- **`emails/sign-in-email.tsx` is a credential, not a notification.** From Slice 6 it
  carries a working magic link. It must keep the bare URL as text (a client that blocks
  the button leaves the recipient stranded), keep the "if you did not request this" line
  (anyone can put an address into the form), and name no expiry in minutes — that number
  lives in `authOptions` and a copy here goes stale silently. See the `auth` skill.
- **The `log` transport prints the link; the `resend` one must never.** `MAIL_TRANSPORT=log`
  adds `url=` to its line because locally that is the only way to sign in. Adding the same
  to the Resend branch would write live credentials into a production log.
- **Never imports the Worker's `Env`.** `createMailer` takes `MailEnv`, declared
  structurally, so this package does not know it runs on Workers.
- **Never sends from a test.** Unit tests mock the `resend` module and assert the payload.
  The one real send is a gate row a human runs.
- Only `apps/graphql` imports this package. `apps/web` has no reason to.

## Adding a template

```bash
# 1. emails/<name>.tsx — a component, plus a default export and PreviewProps
# 2. src/render.tsx — a render<Name>Email() returning { subject, html, text }
# 3. export it from src/index.ts
pnpm --filter @cc4-test/email email:dev      # preview on :3001, not :3000
```

- **Inline styles only.** Email clients strip or ignore `<style>` and there is no cascade.
  This is the one place in the repo where naming a colour is correct — `theme.css` does not
  reach a mail client.
- **Always render a text alternative** (`render(element, { plainText: true })`). Without one
  the message scores as spam and shows empty in a client with HTML off.
- **Import everything from `react-email`** — components and `render` both. The old
  `@react-email/components` and per-component packages are deprecated as of `react-email@6`;
  an example written before then imports from packages that still install and no longer get
  fixed.
- **The subject belongs in the render function, not the template.** A component renders a
  body; keeping the pair in one function is what stops a template going out under someone
  else's subject.
- **Every actionable link appears as bare text as well as a button.** A client that blocks
  the button otherwise leaves the recipient with no way through.

## Transports

`MAIL_TRANSPORT` selects one, and unset or unknown **throws**:

| Value    | Behaviour                      | Where                     |
| -------- | ------------------------------ | ------------------------- |
| `log`    | renders, prints, sends nothing | `.env.development`, tests |
| `resend` | sends; needs `RESEND_API_KEY`  | `wrangler.jsonc` `vars`   |

Never infer the transport from `NODE_ENV` or from whether a key is present: both fail open,
and a production deploy that lost its key would report every send as a success.

## Judgment calls

- `RESEND_API_KEY` is a **secret** — `wrangler secret put`, never a `vars` entry. It is
  therefore **absent from the generated `WorkerEnv`**, and `createMailer(ctx)` typechecks only
  because `MailEnv` declares it optional. A missing secret is a runtime error by design, not a
  compile-time one; the `if (!key) throw` in `createMailer` is what turns it into a loud one.
- `MAIL_FROM` must be on a domain Resend has verified for the account, or delivery fails at
  Resend rather than in your code. `onboarding@resend.dev` needs no domain but only delivers
  to your own account address.
- The Resend SDK returns `{ data, error }` and does **not** throw. An unchecked call makes a
  failed send indistinguishable from a successful one.
- `sendTestEmail` is a scaffold mutation guarded by `MAIL_TEST_RECIPIENTS`, which fails
  closed. Do not widen it, and do not model real mail on it — real sends are triggered by a
  domain event, not by a caller naming a recipient.

## Enforced elsewhere

- `src/mailer.test.ts` pins the payload, the error path, that `log` touches no network, and
  that an unset transport throws.
- `src/render.test.ts` pins that the link survives into the text alternative.
- `apps/graphql/src/mail.test.ts` pins the allowlist, including that empty means nobody.
