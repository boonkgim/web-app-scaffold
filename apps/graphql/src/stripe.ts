import Stripe from "stripe";
import { requireEnv } from "./env";
import type { Env } from "./context";

/** Where Stripe posts.
 *
 *  A path on this Worker's own public URL rather than behind apps/web's proxy: that
 *  proxy exists so a session cookie can belong to the origin the browser asked, and a
 *  webhook has neither a cookie nor an origin. What it would add is a hop that can
 *  re-encode the body the signature is computed over.
 */
export const STRIPE_WEBHOOK_PATH = "/stripe/webhook";

// Restricted keys are issued alongside secret ones and are equally valid here, so the
// check is on the environment segment rather than on a single whole prefix. No pk_
// here on purpose: this Worker never holds a publishable key, and apps/web never holds
// one of these.
const KEY_PREFIXES: Record<string, string[]> = {
  test: ["sk_test_", "rk_test_"],
  live: ["sk_live_", "rk_live_"],
};

/** Refuse a key that does not match the mode it was deployed under.
 *
 *  The mode is named rather than inferred, for the reason MAIL_TRANSPORT is: a mode read
 *  off the key can never disagree with the key, so it detects nothing. Naming it
 *  separately is what turns the one mistake in this file that charges a real card — a
 *  live key reached by a deploy that believed it was in test — into a startup error.
 */
export function assertKeyMatchesMode(mode: string, key: string): void {
  const prefixes = KEY_PREFIXES[mode];
  if (!prefixes) {
    throw new Error(
      `Unknown STRIPE_MODE ${JSON.stringify(mode)} — expected "test" or "live"`,
    );
  }
  if (!prefixes.some((prefix) => key.startsWith(prefix))) {
    throw new Error(
      `STRIPE_MODE=${mode} needs a key beginning ${prefixes.join(" or ")}`,
    );
  }
}

/** The Stripe client, per request — bindings and secrets do not exist at import time,
 *  the same reason createDb and createAuth are factories.
 *
 *  httpClient is explicit rather than necessary, which is a change from what older
 *  guidance says. `stripe` 22 declares a `workerd` export condition resolving to a Web
 *  platform build whose createDefaultHttpClient() *is* the fetch client (and whose
 *  default crypto provider is SubtleCrypto) — verified by reading
 *  esm/platform/WebPlatformFunctions.js in the published 22.6.0 tarball.
 *
 *  It stays named anyway. Dropping it makes this Worker correct only for as long as the
 *  bundler keeps choosing that condition; the node build it would otherwise fall back to
 *  reaches for node:https, and that failure surfaces at the first API call rather than
 *  at import — so a bundle that uploaded cleanly is not evidence either way. One
 *  argument buys independence from all of it.
 */
export function createStripe(env: Env): Stripe {
  const key = requireEnv(env, "STRIPE_SECRET_KEY");
  assertKeyMatchesMode(requireEnv(env, "STRIPE_MODE"), key);

  return new Stripe(key, { httpClient: Stripe.createFetchHttpClient() });
}
