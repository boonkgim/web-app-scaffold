import { loadStripe } from "@stripe/stripe-js";

/** Assert the public key is a public key.
 *
 *  Not a mode check, unlike the API's. A publishable key cannot move money, so a
 *  pk_live_ shipped in a test build is a form that refuses to load — loud, immediate,
 *  and free. The mistake worth catching here is the opposite one and it is silent:
 *  pasting an sk_ key into a NEXT_PUBLIC_ var hands a key that can charge cards to
 *  everyone who views source, and nothing else in the stack would notice.
 *
 *  The message never echoes the value, for the case where the value is the secret.
 */
export function assertPublishableKey(key: string | undefined): string {
  if (!key) {
    throw new Error("Missing NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY");
  }
  if (!key.startsWith("pk_")) {
    throw new Error(
      "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY must begin pk_ — never a secret key",
    );
  }
  return key;
}

/** Module scope and exactly once, which is Stripe's own instruction: loadStripe injects
 *  a script tag, and calling it inside a render would re-run that on every render.
 *
 *  The literal member expression is the only form `next build` inlines — see the web
 *  skill. It also means this value is fixed at build time rather than read from the
 *  Worker's env, so changing keys is a rebuild, not a `wrangler secret put`.
 */
export const stripePromise = loadStripe(
  assertPublishableKey(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY),
);
