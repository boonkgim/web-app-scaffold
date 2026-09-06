import Stripe from "stripe";
import { createDb, stripeEvent } from "@web-app-scaffold/db";
import { createStripe, STRIPE_WEBHOOK_PATH } from "./stripe";
import { requireEnv } from "./env";
import type { Env } from "./context";

// Module scope, and safe there unlike everything else in this Worker: building a crypto
// provider reads no binding and performs no I/O.
const webCrypto = Stripe.createSubtleCryptoProvider();

/** Exact match, not a prefix — this path has no children, and a startsWith would also
 *  claim /stripe/webhooks-disabled. */
export function isStripeWebhookPath(url: string): boolean {
  return new URL(url).pathname === STRIPE_WEBHOOK_PATH;
}

/** Verify a delivery, record it at most once, and answer.
 *
 *  Every rejection here is a 4xx and never a 5xx. Stripe retries a 5xx with backoff for
 *  days, and a body that failed verification will fail it on the tenth attempt too — so
 *  retrying is noise. The case genuinely worth retrying is a database that is down, and
 *  that one throws past this handler and becomes a 500 on its own.
 */
export async function handleStripeWebhook(
  request: Request,
  env: Env,
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return new Response("Missing stripe-signature", { status: 400 });
  }

  // Read once, as text, before anything parses it. The signature covers the exact bytes
  // Stripe sent: request.json() consumes the body and re-serialising the parsed object
  // produces different bytes for identical data, while a second read on a Workers
  // Request throws outright.
  const payload = await request.text();

  let event: Stripe.Event;
  try {
    event = await createStripe(env).webhooks.constructEventAsync(
      payload,
      signature,
      requireEnv(env, "STRIPE_WEBHOOK_SECRET"),
      // The timestamp tolerance, left at its default. It is spelled out only because
      // the crypto provider is positional and comes after it.
      undefined,
      webCrypto,
    );
  } catch (cause) {
    // The reason goes to the log and not to the caller: whoever sent this is
    // unauthenticated by definition, and the detail is only useful to us.
    console.error("[stripe] signature verification failed", cause);
    return new Response("Invalid signature", { status: 400 });
  }

  // No branch on event.type. This slice records deliveries; deciding what a
  // checkout.session.completed *means* is fulfilment, and fulfilment is a feature.
  const db = createDb(env.HYPERDRIVE.connectionString);
  const inserted = await db
    .insert(stripeEvent)
    .values({ id: event.id, type: event.type })
    .onConflictDoNothing()
    .returning({ id: stripeEvent.id });

  // 200 either way: a duplicate is a delivery that worked, and answering 4xx would make
  // Stripe retry the one event already handled.
  return Response.json({ received: true, duplicate: inserted.length === 0 });
}
