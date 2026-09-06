import { expect, test } from "vitest";
import worker, { type Env } from "./index";

const DOCKER_URL = "postgres://postgres:postgres@localhost:5434/web-app-scaffold";
const env = {
  HYPERDRIVE: { connectionString: process.env.DATABASE_URL ?? DOCKER_URL },
} as unknown as Env;

test("health round-trips through Postgres", async () => {
  const res = await worker.fetch(
    new Request("http://localhost/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "{ health }" }),
    }),
    env,
  );
  expect(await res.json()).toEqual({ data: { health: "ok:db" } });
});
