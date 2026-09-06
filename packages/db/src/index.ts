export { createDb } from "./client";
export * from "./schema";

// The query operators resolvers need, re-exported rather than imported from
// "drizzle-orm" at the call site. apps/graphql does not depend on drizzle-orm and
// should not start: this package owns the drizzle version, and a second direct pin in
// another package is a second version to drift. Every other db symbol a resolver uses
// (createDb, items, stripeEvent) already arrives this way, so this keeps one import
// line per resolver instead of two from two different owners.
//
// Named explicitly, not `export * from "drizzle-orm"` — that would re-export hundreds
// of symbols and collide with the table names above.
export { and, asc, desc, eq, inArray, isNull, not, or, sql } from "drizzle-orm";
