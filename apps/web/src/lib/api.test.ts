import { expect, test, vi } from "vitest";
import { apiFetch, graphqlFetch } from "./api";
import { TypedDocumentString } from "@/generated/graphql";

// vi.mock's factory is hoisted above the imports, so the env it hands back has to
// be reachable from up there too -- that is what vi.hoisted is for.
const mocks = vi.hoisted(() => ({
  env: {} as Record<string, unknown>,
  cookie: null as string | null,
}));
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => ({ env: mocks.env }),
}));

// connection() is Next's prerender boundary and throws outside a render, so it is
// stubbed rather than exercised. What it guards is a build-time concern that only
// `next build` can prove -- see the production gate, not this file.
vi.mock("next/server", () => ({ connection: () => Promise.resolve() }));

// headers() is the inbound request's, which only exists during a render.
vi.mock("next/headers", () => ({
  headers: () =>
    Promise.resolve(new Headers(mocks.cookie ? { cookie: mocks.cookie } : {})),
}));

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
  mocks.cookie = null;

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
  mocks.cookie = null;

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
  mocks.cookie = null;

  await graphqlFetch(noVars);

  const [, init] = fetchMock.mock.calls[0];
  expect(typeof JSON.parse(init.body as string).query).toBe("string");
});

// Without this, `viewer` is null for a signed-in visitor and nothing else fails: the
// query succeeds, the page renders, the app just never recognises anyone.
test("the visitor's cookie is forwarded to the API", async () => {
  const fetchMock = vi.fn(ok);
  vi.stubGlobal("fetch", fetchMock);
  mocks.env = {};
  mocks.cookie = "better-auth.session_token=abc";

  await graphqlFetch(noVars);

  const [, init] = fetchMock.mock.calls[0];
  expect((init.headers as Record<string, string>).cookie).toBe(
    "better-auth.session_token=abc",
  );
});

test("apiFetch proxies to the binding, preserving path, query, method and headers", async () => {
  const fetchMock = vi.fn(ok);
  vi.stubGlobal("fetch", fetchMock);
  const bindingFetch = vi.fn(ok);
  mocks.env = { API: { fetch: bindingFetch } };

  await apiFetch(
    new Request("https://web.example/api/auth/sign-in/magic-link?next=/", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://web.example",
      },
      body: JSON.stringify({ email: "a@b.test" }),
    }),
  );

  expect(fetchMock).not.toHaveBeenCalled();
  const [url, init] = bindingFetch.mock.calls[0];
  // Verbatim: Better Auth routes on the path, so rewriting the prefix 404s every
  // endpoint at the other end — and the plugin's routes sit under the same prefix.
  expect(url).toBe("https://api/api/auth/sign-in/magic-link?next=/");
  expect(init.method).toBe("POST");
  expect(new Headers(init.headers).get("origin")).toBe("https://web.example");
});

// apiFetch rebuilds the upstream response rather than returning it, so the status and
// every Set-Cookie have to survive the copy. A Headers copy that joined them into one
// value would set a single malformed cookie and log nobody in.
test("apiFetch carries the status and each Set-Cookie back separately", async () => {
  const headers = new Headers();
  headers.append("set-cookie", "better-auth.session_token=abc; HttpOnly");
  headers.append("set-cookie", "better-auth.session_data=xyz; HttpOnly");
  const bindingFetch = vi.fn((_url: string, _init: RequestInit) =>
    Response.json({ ok: true }, { status: 201, headers }),
  );
  vi.stubGlobal("fetch", vi.fn(ok));
  mocks.env = { API: { fetch: bindingFetch } };

  const res = await apiFetch(
    new Request("https://web.example/api/auth/sign-in/magic-link", {
      method: "POST",
      body: "{}",
    }),
  );

  expect(res.status).toBe(201);
  expect(res.headers.getSetCookie()).toEqual([
    "better-auth.session_token=abc; HttpOnly",
    "better-auth.session_data=xyz; HttpOnly",
  ]);
  await expect(res.json()).resolves.toEqual({ ok: true });
});

// Better Auth ends /magic-link/verify with a 302 to callbackURL on the web origin. Under
// fetch's default "follow" the proxy resolves that against the API Worker, lands on its
// root and returns Yoga's landing page as a 200 -- the visitor is signed in and shown a
// 404. With magic link this is the *only* way in, so this test guards the whole product.
test("apiFetch does not follow redirects; the 302 reaches the browser", async () => {
  const bindingFetch = vi.fn(
    (_url: string, _init: RequestInit) =>
      new Response(null, { status: 302, headers: { location: "/" } }),
  );
  vi.stubGlobal("fetch", vi.fn(ok));
  mocks.env = { API: { fetch: bindingFetch } };

  const res = await apiFetch(
    new Request(
      "https://web.example/api/auth/magic-link/verify?token=t&callbackURL=%2F",
    ),
  );

  expect(bindingFetch.mock.calls[0][1].redirect).toBe("manual");
  expect(res.status).toBe(302);
  expect(res.headers.get("location")).toBe("/");
});

// Constructing a GET Request with a body throws, so an unconditional forward would
// break the session check that runs on every page load.
test("apiFetch falls back to the local Worker in dev, and sends no body for GET", async () => {
  const fetchMock = vi.fn(ok);
  vi.stubGlobal("fetch", fetchMock);
  mocks.env = {};

  await apiFetch(new Request("http://localhost:3000/api/auth/get-session"));

  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("http://localhost:8787/api/auth/get-session");
  expect(init.body).toBeUndefined();
});
