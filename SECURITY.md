# Security policy

## Reporting a vulnerability

**Please do not open a public issue for a security vulnerability.**

Report it privately through GitHub's private vulnerability reporting:

> **[Report a vulnerability](https://github.com/boonkgim/web-app-scaffold/security/advisories/new)**
> — or, in the repository, **Security → Advisories → Report a vulnerability**.

That opens a private thread visible only to the maintainers and to you.

Please include what you can of: the affected file or component, how to reproduce it, what
an attacker gains, and any proof-of-concept. A rough report sent promptly beats a polished
one sent late.

Expect an acknowledgement within a few days. This is a small project maintained in spare
time, so please allow reasonable time for a fix before disclosing publicly — and tell us if
you have a disclosure deadline in mind, so we can work to it rather than around it.

## Scope

This is a **scaffold**. It ships no running service and holds no user data, so the
interesting vulnerabilities are ones a downstream project would inherit by using it as
intended. In scope:

- Anything that would leak a secret from a clone — a credential reaching a committed file,
  a build artifact, a log line, or the browser bundle.
- A default that fails **open** where it should fail closed: an unset `CORS_ORIGINS`
  allowing an origin, an empty `MAIL_TEST_RECIPIENTS` accepting a recipient, an unset
  required variable resolving to a permissive value instead of throwing.
- Flaws in the auth flow (`apps/graphql` Better Auth server, the same-origin proxy in
  `apps/web`, session handling) or in the Stripe webhook's signature verification.
- SQL injection, XSS, SSRF, or auth bypass reachable through the scaffold's own code.

Out of scope:

- Vulnerabilities in upstream dependencies with no scaffold-specific exposure — report
  those upstream. (Dependabot handles routine updates here.)
- Findings that require a maintainer or user to have already committed a real secret.
- Missing hardening on the local Docker Postgres. It binds `localhost:5434` with
  `postgres:postgres` **by design**, for local development only; it is not a deployment
  target and is documented as such.
- Anything requiring physical or shell access to a developer's machine.

## What this project already does

Worth knowing before you report, and worth preserving if you contribute:

- **Secrets are never in committed config.** Cloudflare secrets are set with
  `wrangler secret put` and stored by Cloudflare. `wrangler.jsonc` holds only non-secret
  `vars`; the production database connection string lives in Hyperdrive at Cloudflare, not
  in this repo.
- **Empty means closed.** Account-coupled values ship as empty strings and deny rather than
  permit. Required values are read through `requireEnv`, which throws with the variable's
  name instead of guessing.
- **The Stripe webhook verifies the signature over the raw body**, read once as text before
  anything parses it, using `constructEventAsync` with WebCrypto.
- **Stripe mode is asserted, not inferred.** The API refuses to start if the key's prefix
  disagrees with `STRIPE_MODE`; the web app rejects a publishable key of the wrong shape,
  which is what catches an `sk_` pasted into a `NEXT_PUBLIC_` variable.
- **The browser-facing Worker has no database or mail credential** — `apps/web` does not
  depend on `packages/db` or `packages/email` at all.
- **Postinstall scripts are blocked by default** (`allowBuilds` in `pnpm-workspace.yaml`),
  with only `esbuild` and `workerd` allowed, both of which need to link platform binaries.
