## What this changes

<!-- And why. The diff shows what; the reason is the part that gets lost. -->

## How it was verified

<!-- `pnpm verify` is the baseline. Say what else you ran, especially anything CI
     cannot: a deploy, a real Stripe webhook, mail actually delivered. -->

- [ ] `pnpm verify` passes
- [ ] Integration tests pass (`pnpm test:integration` with Docker Postgres up and migrated), or not applicable

## Checklist

- [ ] `docs/setup/` updated if this changes a file the plan writes (`pnpm docs:check` is green)
- [ ] No credential, account id, or personal detail added to a committed file
- [ ] Any new account-coupled value ships **empty** and fails closed
- [ ] No component names a colour; new tokens went into `apps/web/src/styles/theme.css`
- [ ] New tests needing a container or credential are named `*.int.test.ts`
