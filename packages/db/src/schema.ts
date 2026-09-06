import { pgTable, serial, text } from "drizzle-orm/pg-core";

// user, session, account, verification — generated into ./auth-schema.ts by
// `pnpm --filter @cc4-test/graphql auth:generate`. Never hand-written.
export * from "./auth-schema";

export const items = pgTable("items", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
});
