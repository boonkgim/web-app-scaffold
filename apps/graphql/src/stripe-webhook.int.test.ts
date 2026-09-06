import Stripe from "stripe";
import { expect, test } from "vitest";
import { createDb, eq, stripeEvent } from "@cc4-test/db";
import worker, { type Env } from "./index";

const DOCKER_URL = "postgres://postgres:postgres@localhost:5434/cc4-test";
const CONNECTION = process.env.DATABASE_URL ?? DOCKER_URL;
const SECRET = "whsec_integration_test_secret_not_used_anywhere_else";

// Values in code, not in a gitignored env file a fresh clone does not have.
const env = {
  HYPERDRIVE: { connectionString: CONNECTION },
  STRIPE_MODE: "test",
  STRIPE_SECRET_KEY: "sk_test_never_calls_stripe_in_this_file",
  STRIPE_WEBHOOK_SECRET: SECRET,
} as unknown as Env;

// Nothing here reaches the network. Verifying a signature is HMAC over the body and the
// secret, computed locally; the client exists only to hold that code.
const stripe = new Stripe("sk_test_never_calls_stripe_in_this_file");

const sign = (payload: string) =>
  stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });

const deliver = (body: string, signature: string) =>
  worker.fetch(
    new Request("http://localhost/stripe/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": signature,
      },
      body,
    }),
    env,
  );

const event = (id: string) =>
  JSON.stringify({
    id,
    object: "event",
    type: "checkout.session.completed",
    data: { object: { id: "cs_test_integration" } },
  });

async function rowsFor(id: string) {
  const db = createDb(CONNECTION);
  try {
    return await db.select().from(stripeEvent).where(eq(stripeEvent.id, id));
  } finally {
    // createDb hides the Pool; drizzle re-exposes it as $client. Without this the open
    // handle keeps vitest from exiting.
    await db.$client.end();
  }
}

async function forget(id: string) {
  const db = createDb(CONNECTION);
  try {
    await db.delete(stripeEvent).where(eq(stripeEvent.id, id));
  } finally {
    await db.$client.end();
  }
}

test("a signed delivery is recorded once, however many times it arrives", async () => {
  const id = `evt_int_${process.pid}_${Date.now()}`;
  const payload = event(id);

  try {
    const first = await deliver(payload, sign(payload));
    expect(await first.json()).toEqual({ received: true, duplicate: false });

    // What a retry looks like: Stripe resends the same body under the same event id.
    const second = await deliver(payload, sign(payload));
    expect(await second.json()).toEqual({ received: true, duplicate: true });

    const rows = await rowsFor(id);
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("checkout.session.completed");
  } finally {
    await forget(id);
  }
});

test("a body that does not match its signature writes nothing", async () => {
  const id = `evt_tampered_${process.pid}_${Date.now()}`;
  const signed = event(id);
  // Signed as one event, delivered as another — the exact attack the signature exists
  // for, and the reason the raw bytes are never re-serialised on the way in.
  const tampered = signed.replace("checkout.session.completed", "invoice.paid");

  const res = await deliver(tampered, sign(signed));

  expect(res.status).toBe(400);
  expect(await rowsFor(id)).toHaveLength(0);
});
