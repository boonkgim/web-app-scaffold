import { expect, test, vi } from "vitest";
import { graphqlFetch } from "./api";
import { TypedDocumentString } from "@/generated/graphql";

// vi.mock's factory is hoisted above the imports, so the env it hands back has to
// be reachable from up there too -- that is what vi.hoisted is for.
const mocks = vi.hoisted(() => ({ env: {} as Record<string, unknown> }));
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => ({ env: mocks.env }),
}));

// connection() is Next's prerender boundary and throws outside a render, so it is
// stubbed rather than exercised. What it guards is a build-time concern that only
// `next build` can prove -- see the production gate, not this file.
vi.mock("next/server", () => ({ connection: () => Promise.resolve() }));

// Declaring the parameters is what makes `mock.calls[0]` a typed tuple. With a
// zero-arg impl vitest infers `[]`, and reading the recorded args needs a cast.
const ok = (_url: string, _init: RequestInit) =>
  Response.json({ data: { health: "ok" } });

// Standing in for a codegen output. The type arguments are what codegen bakes into
// the real documents; spelling them here keeps the test on the same call signature
// production uses -- including that `noVars` takes no second argument and `withVars`
// requires one.
type Health = { health: string };
const noVars = new TypedDocumentString<Health, Record<string, never>>(
  "{ health }",
);
const withVars = new TypedDocumentString<Health, { a: number }>("{ health }");

test("dev path: plain HTTP to the local Worker when no binding is present", async () => {
  const fetchMock = vi.fn(ok);
  vi.stubGlobal("fetch", fetchMock);
  mocks.env = {};

  await expect(graphqlFetch(noVars)).resolves.toEqual({
    data: { health: "ok" },
  });

  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("http://localhost:8787/graphql");
  expect(JSON.parse(init.body as string)).toEqual({ query: "{ health }" });
});

test("production path: the service binding is used and global fetch is not", async () => {
  const fetchMock = vi.fn(ok);
  vi.stubGlobal("fetch", fetchMock);
  const bindingFetch = vi.fn(ok);
  mocks.env = { API: { fetch: bindingFetch } };

  await expect(graphqlFetch(withVars, { a: 1 })).resolves.toEqual({
    data: { health: "ok" },
  });

  expect(fetchMock).not.toHaveBeenCalled();
  const [url, init] = bindingFetch.mock.calls[0];
  expect(url).toBe("https://api/graphql");
  expect(JSON.parse(init.body as string)).toEqual({
    query: "{ health }",
    variables: { a: 1 },
  });
});

// The document is a String object. If the payload ever carried the boxed form -- or
// the class's own `value`/`__meta__` fields -- the API would receive an unparseable
// query, and every assertion above would still pass on a deep-equal of the parsed body.
test("the query is serialised as a plain string, not a boxed String", async () => {
  const fetchMock = vi.fn(ok);
  vi.stubGlobal("fetch", fetchMock);
  mocks.env = {};

  await graphqlFetch(noVars);

  const [, init] = fetchMock.mock.calls[0];
  expect(typeof JSON.parse(init.body as string).query).toBe("string");
});
