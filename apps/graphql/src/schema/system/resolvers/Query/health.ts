import { createDb, items } from "@cc4-test/db";
import type { QueryResolvers } from "./../../../types.generated";

// Reads the migrated table rather than just constructing a client. Building a Pool
// opens no socket, so a health check that skipped this query would pass against a
// database that does not exist. Integration-only by construction.
export const health: NonNullable<QueryResolvers["health"]> = async (
  _parent,
  _arg,
  ctx,
) => {
  const db = createDb(ctx.HYPERDRIVE.connectionString);
  await db.select({ id: items.id }).from(items).limit(1);
  return "ok:db";
};
