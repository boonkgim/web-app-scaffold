import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

// user, session, account, verification — generated into ./auth-schema.ts by
// `pnpm --filter @web-app-scaffold/graphql auth:generate`. Never hand-written.
export * from "./auth-schema";

export const items = pgTable("items", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
});

// Stripe's own event id is the primary key, not a surrogate: a retried or duplicated
// delivery then conflicts instead of inserting twice, and that conflict is the entire
// idempotency mechanism. Nothing reads before writing, so there is no window for two
// concurrent deliveries of the same event to both decide they are the first.
//
// No payload column. The event body is Stripe's to hold and is retrievable from their
// API by id; copying it here would put card metadata in our database for nothing.
export const stripeEvent = pgTable("stripe_event", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
