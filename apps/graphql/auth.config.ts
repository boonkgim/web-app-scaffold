import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createDb } from "@web-app-scaffold/db";
import { authOptions } from "./src/auth-options";

/** Read by `pnpm auth:generate` and by nothing else.
 *
 *  The CLI needs an auth instance to read table shape off, and runs on your machine
 *  where there is no env. The database is a prop: node-postgres opens no socket until a
 *  query runs, so this never connects. The secret is a literal because generation
 *  neither signs nor reads anything — a real one here would be a committed credential.
 *  The sender is a no-op for the same reason — and it is supplied rather than omitted,
 *  because dropping the magicLink plugin to avoid needing one would describe a
 *  different schema from the one the running server validates against.
 *
 *  authOptions is called, not restated. Two configs that disagreed would produce a
 *  migration for a schema the runtime does not use.
 *
 *  At the app root, outside tsconfig's include, like codegen.ts and vitest.config.ts.
 */
export const auth = betterAuth({
  ...authOptions(async () => {}),
  database: drizzleAdapter(
    createDb("postgres://generate-only/never-connected"),
    { provider: "pg" },
  ),
  secret: "schema-generation-only-not-a-credential",
  baseURL: "http://localhost",
});
