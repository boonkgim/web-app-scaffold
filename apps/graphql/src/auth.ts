import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createDb } from "@cc4-test/db";
import { createMailer, renderSignInEmail } from "@cc4-test/email";
import { AUTH_BASE_PATH, authOptions } from "./auth-options";
import { requireEnv } from "./env";
import type { Env } from "./context";

/** The auth server, per request — bindings and secrets do not exist at import time.
 *
 *  baseURL is the *web* origin, not this Worker's: Better Auth validates the browser's
 *  Origin header against it, and every request here arrived from apps/web over the
 *  service binding. Point it at this Worker and two things break at once — the proxy's
 *  own traffic is rejected, and the magic link, which is built from baseURL, is mailed
 *  to a host the app is not served from.
 */
export function createAuth(env: Env) {
  // WEB_ORIGIN, not BETTER_AUTH_URL: Slice 7 needs this same origin for Stripe's
  // return URL, and one fact under two names disagrees with itself the first time
  // either moves. The name says what the value is, not which library first wanted it.
  const webOrigin = requireEnv(env, "WEB_ORIGIN");

  return betterAuth({
    // The sender is passed in rather than declared in auth-options.ts because it needs
    // env, which the schema generator has none of. Everything else in there is shared
    // verbatim, so the two configs cannot describe different tables.
    ...authOptions(async ({ email, url }) => {
      const message = await renderSignInEmail(url);
      await createMailer(env).send({ to: email, ...message });
    }),
    database: drizzleAdapter(createDb(env.HYPERDRIVE.connectionString), {
      provider: "pg",
    }),
    // requireEnv, not env.BETTER_AUTH_SECRET: Better Auth would otherwise fall back to
    // process.env, which on a Worker is empty, and fail as a session that never verifies.
    secret: requireEnv(env, "BETTER_AUTH_SECRET"),
    baseURL: webOrigin,
    // This Worker has a public origin, so the auth routes are reachable without the
    // proxy. The allowlist is what makes that harmless.
    trustedOrigins: [webOrigin],
  });
}

/** Exact match or child path — a bare startsWith would also claim /api/authorize. */
export function isAuthPath(url: string): boolean {
  const { pathname } = new URL(url);
  return (
    pathname === AUTH_BASE_PATH || pathname.startsWith(`${AUTH_BASE_PATH}/`)
  );
}
