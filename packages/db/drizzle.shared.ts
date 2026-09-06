import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Both migration targets are built from here so `out` and `schema` cannot drift
// apart. Two configs that disagreed about `out` would split the migration history
// between environments, which is the one bug in this package with no easy repair.
export function defineDrizzleConfig(envFile: string) {
  // override: true — the file named by the command wins over anything already in the
  // environment. dotenv's default is the opposite, so an exported DATABASE_URL left
  // in a shell would silently retarget the run. For the only command here that can
  // mutate production, the target must come from the command you typed.
  config({ path: envFile, override: true });

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      `packages/db/${envFile} is missing or defines no DATABASE_URL. ` +
        `Both env files are gitignored and use the same key — see docs/setup, Slice 3.`,
    );
  }

  return defineConfig({
    dialect: "postgresql",
    schema: "./src/schema.ts",
    out: "./migrations",
    dbCredentials: { url },
  });
}
