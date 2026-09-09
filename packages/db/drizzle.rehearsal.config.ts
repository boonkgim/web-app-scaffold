import { defineDrizzleConfig } from "./drizzle.shared";

// A Neon branch of production. `pnpm migrate:rehearsal`.
// The branch is a copy-on-write clone carrying production's rows *and* its
// drizzle.__drizzle_migrations, so migrating here applies exactly the pending set
// production will apply, to data of the same size and shape. See the `deploy-production`
// skill, "The migration review".
//
// A separate env file rather than an exported DATABASE_URL: drizzle.shared loads with
// `override: true`, so a variable exported in the shell loses to whichever file the
// command names. The target has to come from the command you typed, which means it has
// to be a file. Gitignored like the other two — write the branch's direct/unpooled URL
// into it, and delete both the file and the branch when the rehearsal is done.
export default defineDrizzleConfig(".env.rehearsal");
