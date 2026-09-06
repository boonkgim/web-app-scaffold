import { expect, test } from "vitest";
import worker, { type Env } from "./index";

// Driven through `worker.fetch` rather than against `corsFor` directly. The unit under
// test is not the allowlist — it is the headers a browser actually receives, and those
// come from Yoga's plugin reading our options. Testing the function alone would keep
// passing if the `cors` wiring in index.ts were dropped entirely.
// Any absolute origin does: every case below feeds this same string in as the allowlist
// and asserts against it, so the test pins the *shape* of the answer and never the
// deployment. Deliberately not the real origin — that lives in wrangler.jsonc alone.
const WEB = "https://cc4-test-web.example.workers.dev";
const EVIL = "https://evil.example";

const envWith = (origins?: string) =>
  ({ CORS_ORIGINS: origins }) as unknown as Env;

const query = (origin?: string) =>
  new Request("http://localhost/graphql", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(origin ? { origin } : {}),
    },
    body: JSON.stringify({ query: "{ version }" }),
  });

const preflight = (origin: string) =>
  new Request("http://localhost/graphql", {
    method: "OPTIONS",
    headers: {
      origin,
      "access-control-request-method": "POST",
      "access-control-request-headers": "content-type",
    },
  });

test("an allowed origin is echoed back, uncredentialed", async () => {
  const res = await worker.fetch(query(WEB), envWith(WEB));

  expect(res.headers.get("access-control-allow-origin")).toBe(WEB);
  // The header Yoga would have set on its own. Its absence is the point of the fix.
  expect(res.headers.get("access-control-allow-credentials")).toBeNull();
});

test("an origin outside the allowlist is refused", async () => {
  const res = await worker.fetch(
    query(EVIL),
    envWith(`${WEB},http://localhost:3000`),
  );

  // Not a missing header but a literal "null" origin, which no browser can match.
  expect(res.headers.get("access-control-allow-origin")).toBe("null");
});

test("a one-entry allowlist answers with that entry whatever the caller sends", async () => {
  const res = await worker.fetch(query(EVIL), envWith(WEB));

  // Yoga short-circuits a single allowed origin to a fixed header instead of comparing
  // against the request — so the refusal here reads differently from the case above.
  // Still closed: the browser blocks any response whose allowed origin is not its own.
  // Worth pinning, because production runs exactly this one-entry shape.
  expect(res.headers.get("access-control-allow-origin")).toBe(WEB);
  expect(res.headers.get("access-control-allow-origin")).not.toBe(EVIL);
});

test("an unset allowlist fails closed rather than open", async () => {
  const res = await worker.fetch(query(WEB), envWith(undefined));

  // The trap this guards: an empty origin list means "reflect everything" to the
  // plugin, so a forgotten var must disable CORS rather than configure it emptily.
  expect(res.headers.get("access-control-allow-origin")).toBeNull();
});

test("a request with no Origin is untouched — the service binding still works", async () => {
  const res = await worker.fetch(query(), envWith(WEB));

  expect(res.headers.get("access-control-allow-origin")).toBeNull();
  expect(await res.json()).toEqual({ data: { version: "1" } });
});

test("preflight advertises only POST and content-type", async () => {
  const res = await worker.fetch(preflight(WEB), envWith(WEB));

  expect(res.status).toBe(204);
  expect(res.headers.get("access-control-allow-origin")).toBe(WEB);
  expect(res.headers.get("access-control-allow-methods")).toBe("POST");
  expect(res.headers.get("access-control-allow-headers")).toBe("content-type");
  expect(res.headers.get("access-control-max-age")).toBe("86400");
});
