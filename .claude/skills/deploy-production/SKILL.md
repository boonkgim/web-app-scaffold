---
name: deploy-production
description: Ship an already-committed, already-green change to production — migrate, then the API, then the web app. Use whenever a feature or fix is committed and green locally and has to reach the already-deployed production Workers. Owns the deploy order, the migration review and branch rehearsal that happen before any production row is touched, the observation that ends the gate, and the failure path. Requires `setup-production` to have already provisioned Neon, Hyperdrive, the two Workers and the webhook — this skill never provisions infrastructure, and refuses to run if it does not exist yet.
---

# deploy-production — the production gate

**Shape: orchestration.** It owns an order, a gate and a failure path, and no mechanics: how
a migration is written is the `project-db` skill, how a resolver is written is
`project-graphql`, how a component is built is `project-web`.

This is the only skill in this repo that changes something a customer can see, and the only
one that can destroy data. Everything below exists because of one asymmetry: **`wrangler
rollback` restores a Worker in seconds, and nothing restores a dropped column.** Code is
reversible here and data is not, so the review sits before the migration and not before the
deploy.

**The name carries the same rule the scripts do.** Anything acting on production is suffixed
`:production` so a destructive command cannot be typed by accident; a skill called `deploy`
would have handed that back. The suffix is the first of the two guards. §1 is the second.

## Owns / never touches

- **Owns:** the deploy order, the migration review and its rehearsal, the observation, and
  the failure path.
- **Never provisions infrastructure.** Neon, Hyperdrive, the Workers and the webhook already
  exist by the time this skill runs — that is `setup-production`'s job, done once. If
  `state.sh --scope production` (below) does not read `complete`, stop and say so.
- **Never runs unattended.** See §1. A run with nobody watching must stop here and report the
  deploy as work remaining.
- **Never deploys a working tree.** Only a commit. Uploading source that is not in git means
  production runs a version with no hash: `wrangler rollback` can restore the service, but
  nothing can say what it restored.
- **Never edits code to make a deploy pass.** A red local gate is a reason to stop, not a
  thing to fix from inside the gate. Fix it, commit it, start again.
- **Never amends the deployed commit.** It is the record of what was live. Fix forward.

## 1. Attended only

A production gate ends in a person looking at the live app and deciding it is right. That
judgement cannot be delegated, and the credentials involved must not be held by an unattended
run.

Before anything else, establish that a person is here and will stay for the observation in §6.
If this was reached from an unattended run, **stop and say so.** Report the commits that are
ready to deploy and end there.

## 2. Preflight

Four things, in this order. A failure at any of them ends the run; none of them is a thing to
work around.

1. **Production infrastructure exists.**
   ```bash
   bash .claude/skills/setup-development/scripts/state.sh --scope production
   ```
   If this does not read `complete`, stop — this is `setup-production`'s job, not this
   skill's, and it is a one-time run, not something to redo per feature.
2. **The working tree is clean and HEAD is committed.** `git status --porcelain` returns
   nothing.
3. **The local gate is green**, from the repo root:
   ```bash
   pnpm lint && pnpm typecheck && pnpm test
   ```
   From the root, because that is what fans out through Turborepo and answers "is the
   workspace green". Inside a package you get that package's tally, which stays green while
   another package burns.
4. **You know which commits are being deployed.** Usually the commit you just made and
   verified with `pnpm verify`; on a run that accumulated several, name the range.

## 3. What this deploy touches

Read the range, do not guess it:

```bash
git show --stat HEAD                        # one commit
git diff --stat <last-deployed>..HEAD       # accumulated commits
```

| Changed under              | Step to run |
| --------------------------- | ----------- |
| `packages/db/migrations/`  | migrate     |
| `apps/graphql/`             | the API     |
| `apps/web/`                 | the web app |

Skip a step nothing changed under. **Never reorder the ones you keep** — §5 explains what
each order is forced by.

If nothing changed under `packages/db/migrations/`, skip §4 as well and go to §5.

## 4. The migration review

This is the step the rest of the skill is arranged around, and it happens **before**
`migrate:production` runs, not after.

The `project-db` skill already says to read the generated SQL before applying it locally.
That check is about whether the migration is what you meant. This one is different: local
Postgres is thrown away and has nothing to lose, so a migration can pass there and still
destroy rows in Neon.

**There is no dry-run flag.** `drizzle-kit migrate` has no `--dry-run` in any form, and no
undo. What exists instead is a **rehearsal on a branch** — step 4 below — and the reading
that comes first, both done before you type the command against production.

**The local gate proves the migration is valid, not that it is safe.** It runs against an
empty (or fixture-seeded) database, so every row in the middle band of the table below passes
there. Green locally says nothing about this step.

1. **List the migrations this deploy will apply.** Every `.sql` file added under
   `packages/db/migrations/` in the range from §3:
   ```bash
   git diff --name-only --diff-filter=A <last-deployed>..HEAD -- packages/db/migrations
   ```
   Drizzle applies **every** pending migration, not only the ones in this range. If you
   cannot account for what production already has, read `drizzle.__drizzle_migrations` in
   the Neon console before going further — it is the applied set, and it is the only
   authority on it.
2. **State what each one does to rows that already exist**, in plain English, and name every
   table and column it deletes. Not a summary of the SQL — the effect on data.
3. **Say which of the three kinds it is:**

   | Kind                                                          | What happens against real rows          |
   | -------------------------------------------------------------- | ---------------------------------------- |
   | Adds a table, or an optional column                            | Nothing existing changes                 |
   | Adds a required column, a `UNIQUE`, or a foreign key           | **Fails** if any row breaks the new rule |
   | Drops a column, or changes what a column holds                 | **Deletes** the data in it               |

   The middle row is a stopped deploy, not data loss, and it is the common one: most
   migrations that fail in production fail there. The bottom row is why this section exists.
4. **Rehearse it on a branch, for anything not in the top row.** Neon branches are
   copy-on-write, so a branch of production is instant and costs nothing to throw away. It
   carries the rows **and** `drizzle.__drizzle_migrations`, which is what makes the rehearsal
   worth running: the branch has exactly the applied set production has, so `migrate` against
   it applies exactly the pending set production will apply, to data of the same size and
   shape.

   Create the branch in the Neon console or with `neonctl branches create`, take its
   **direct/unpooled** URL, and put it in `packages/db/.env.rehearsal`:
   ```bash
   cd packages/db && pnpm migrate:rehearsal
   ```
   **Write the URL to that file, not to an exported `DATABASE_URL`.** `drizzle.shared.ts`
   loads with `override: true`, so a variable exported in the shell loses to whichever env
   file the config names — an exported URL here would silently rehearse against local Docker
   and report a green that means nothing. And never point `.env.production` at the branch:
   that file is what `migrate:production` reads, and a rehearsal that leaves it aimed
   somewhere else is a production migration that goes to the wrong database.

   Report what happened: applied clean, or failed and on which statement. Then **delete the
   branch and `.env.rehearsal`** — the branch is a full-fidelity copy of customer data and
   should not outlive the rehearsal, and a stale env file is a rehearsal that quietly runs
   against a branch that no longer exists.

   A failure here is the good outcome. It is the middle row of the table arriving as a
   stopped rehearsal instead of a stopped deploy, and the fix is the split at the bottom of
   this section.

   The rehearsal is not a substitute for step 3. It tells you the migration runs; it does not
   tell you the deletion it performed was intended. A bottom-row migration can rehearse
   perfectly green and still be the wrong migration.
5. **Wait for a go-ahead** before running anything in §5. A migration in the bottom row that
   was not intended is the one failure in this repo with no repair.

A change in the middle row that has to ship is not run as one migration. Split it: add the
column optional, backfill every existing row, then apply the constraint. Each of the three
passes on its own, and the third one passes because the second ran.

## 5. Run, in this order

From the repo root, one step at a time, reading each result before starting the next:

```bash
cd packages/db && pnpm migrate:production     # only if §3 said so
cd ../../apps/graphql
pnpm wrangler deploy --dry-run                # read the bundle figure, then
pnpm deploy:production                        # API FIRST — hard constraint
cd ../web && pnpm deploy:production
```

**Migrate first**, because the API queries the new shape the moment it goes up. An app cannot
read a column that is not there.

**API before web is a constraint, not a habit.** The web Worker's `API` service binding is
resolved at upload time, so the graphql Worker must already exist or web's deploy fails
outright.

**Read the dry run's bundle figure before deploying the API.** It reports the size against
Cloudflare's 3 MiB ceiling. Reading it here is how you find the ceiling before an upload does.

**Anything acting on production is suffixed `:production`.** A bare script name never touches
production, which is what makes a destructive command impossible to type by accident. Do not
add a script that breaks that.

Web is the slow one: `deploy:production` builds with `opennextjs-cloudflare` before it
uploads.

## 6. Observe

The gate is not passed because three commands exited zero. Open the live app and check the
thing this deploy was for. Name what you looked at and what you saw.

A blocked or skipped observation here is a deploy that is not done.

## 7. When it fails

**Restore service first, diagnose second.** `wrangler rollback` on the Worker that broke, then
fix forward in a second commit.

The database does not roll back with it. A Worker rollback puts the old code in front of the
new schema, so a migration that dropped a column leaves the restored code querying something
that no longer exists. That is the asymmetry at the top of this file, arriving in the middle
of an incident — and it is why §4 runs before §5 rather than alongside it.

Start from which of the four parts is wrong — code, data, settings, secrets — rather than from
the error text.

## Return

Report: the commits deployed, which of the three steps ran, what the migration review said,
whether a rehearsal ran and what it did, and what you observed in §6. **Do not commit** — this
gate deploys what is already committed and writes nothing.
