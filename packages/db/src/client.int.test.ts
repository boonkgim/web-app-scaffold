import { eq } from "drizzle-orm";
import { expect, test } from "vitest";
import { createDb } from "./client";
import { items } from "./schema";

// Docker Compose defaults, identical for everyone — the override is for a nonstandard port.
const DOCKER_URL = "postgres://postgres:postgres@localhost:5434/web-app-scaffold";
const url = process.env.DATABASE_URL ?? DOCKER_URL;

test("round-trips a row through local Postgres", async () => {
  const db = createDb(url);
  const name = `round-trip-${process.pid}`;

  try {
    const [inserted] = await db.insert(items).values({ name }).returning();
    expect(inserted.name).toBe(name);

    const found = await db
      .select()
      .from(items)
      .where(eq(items.id, inserted.id));
    expect(found).toHaveLength(1);
    expect(found[0].name).toBe(name);

    await db.delete(items).where(eq(items.id, inserted.id));
  } finally {
    // createDb hides the Pool; drizzle re-exposes it as $client. Without this,
    // the open handle keeps vitest from exiting.
    await db.$client.end();
  }
});
