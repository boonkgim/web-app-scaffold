import { createDb, desc, stripeEvent } from "@web-app-scaffold/db";
import type { QueryResolvers } from "./../../../types.generated";

// A ceiling the caller cannot raise. The SDL's default is a default, not a limit, and
// this field is public — `stripeEvents(limit: 100000)` is otherwise a free table scan.
const MAX_ROWS = 50;

export const stripeEvents: NonNullable<QueryResolvers["stripeEvents"]> = async (
  _parent,
  { limit },
  ctx,
) => {
  const db = createDb(ctx.HYPERDRIVE.connectionString);
  const rows = await db
    .select()
    .from(stripeEvent)
    .orderBy(desc(stripeEvent.receivedAt))
    .limit(Math.min(Math.max(limit, 1), MAX_ROWS));

  // Converted here rather than left to JSON.stringify on a Date, which produces the
  // same string today by coincidence rather than by contract.
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    receivedAt: row.receivedAt.toISOString(),
  }));
};
