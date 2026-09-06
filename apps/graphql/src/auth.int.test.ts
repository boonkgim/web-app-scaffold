import { expect, test, vi } from "vitest";
import worker, { type Env } from "./index";

const DOCKER_URL = "postgres://postgres:postgres@localhost:5434/cc4-test";
const CONNECTION = process.env.DATABASE_URL ?? DOCKER_URL;
const WEB = "http://localhost:3000";

// The web origin, because that is what a browser sends and what trustedOrigins allows.
// MAIL_TRANSPORT=log so the run sends nothing and the link lands on stdout, which is
// where these tests read it from. Values in code, not in a gitignored env file a fresh
// clone does not have.
const env = {
  HYPERDRIVE: { connectionString: CONNECTION },
  BETTER_AUTH_URL: WEB,
  BETTER_AUTH_SECRET: "integration-test-secret-not-used-anywhere-else",
  MAIL_TRANSPORT: "log",
  MAIL_FROM: "cc4-test <no-reply@example.test>",
} as unknown as Env;

const post = (path: string, body: object, cookie?: string) =>
  worker.fetch(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: WEB,
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(body),
    }),
    env,
  );

const get = (path: string) =>
  worker.fetch(
    new Request(`http://localhost${path}`, { headers: { origin: WEB } }),
    env,
  );

const viewerQuery = (cookie?: string) =>
  post("/graphql", { query: "{ viewer { email } }" }, cookie);

/** Ask for a link, and read the one that was mailed back off the log transport.
 *
 *  Deliberately the mail and not the `verification` table: the token's storage shape is
 *  the library's business and reading it here would be a guess that keeps compiling
 *  after the library changes it. The URL in the message is what a person actually
 *  clicks, so asserting on it covers the plugin, the template and the transport at
 *  once — the link end of the pipeline Slice 5 could not reach.
 */
async function requestLink(email: string) {
  const logged = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    const res = await post("/api/auth/sign-in/magic-link", {
      email,
      callbackURL: "/",
    });
    const line = logged.mock.calls
      .map(([first]) => String(first))
      .find((l) => l.startsWith("[mail:log]"));
    const url = line?.match(/url=(\S+)/)?.[1];
    if (!url) throw new Error(`no link in the mail log: ${line ?? "(none)"}`);

    return { res, url };
  } finally {
    logged.mockRestore();
  }
}

/** The path half of a mailed link. The URL names the *web* origin, and the Worker under
 *  test is the API — in production the proxy is what closes that gap. */
const routeOf = (url: string) => {
  const { pathname, search } = new URL(url);
  return `${pathname}${search}`;
};

test("asking for a link mails one and issues no session", async () => {
  const email = `request-${process.pid}-${Date.now()}@example.test`;
  const { res, url } = await requestLink(email);

  expect(res.status).toBe(200);
  // The request itself must not authenticate anyone. Otherwise the address in the form
  // is enough to sign in as, and the mail is decoration.
  expect(res.headers.get("set-cookie")).toBeNull();
  // Built from baseURL, so it must land where the app is served — not on this Worker.
  // In production this is the difference between a working link and a 404.
  expect(new URL(url).origin).toBe(WEB);
});

test("following the link is what makes viewer resolve", async () => {
  const email = `viewer-${process.pid}-${Date.now()}@example.test`;
  const { url } = await requestLink(email);

  const verified = await get(routeOf(url));
  // A redirect to callbackURL, carrying the session. Not a 200: the browser is meant
  // to be sent on to the app, which is what apiFetch's redirect:"manual" preserves.
  expect(verified.status).toBe(302);
  const cookie = verified.headers.get("set-cookie");
  expect(cookie).not.toBeNull();

  const res = await viewerQuery(cookie?.split(";")[0]);

  // Also proves ctx.request exists: without it getSession throws rather than answering.
  expect(await res.json()).toEqual({ data: { viewer: { email } } });
});

// A link that still works after it has been used is a credential sitting in a mailbox
// forever. This is the test that fails if storeToken or the plugin's defaults are
// changed carelessly, and nothing else would notice.
test("a spent link does not work a second time", async () => {
  const email = `replay-${process.pid}-${Date.now()}@example.test`;
  const { url } = await requestLink(email);
  const route = routeOf(url);

  expect((await get(route)).headers.get("set-cookie")).not.toBeNull();
  expect((await get(route)).headers.get("set-cookie")).toBeNull();
});

test("no cookie is a null viewer, not an error", async () => {
  const res = await viewerQuery();

  expect(await res.json()).toEqual({ data: { viewer: null } });
});
