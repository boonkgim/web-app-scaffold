import { expect, test } from "vitest";
import { handleStripeWebhook, isStripeWebhookPath } from "./stripe-webhook";
import type { Env } from "./context";

// No HYPERDRIVE on purpose: every case below must be refused before the database is
// reached, and a missing binding is what proves it — a handler that got that far would
// throw rather than return the status asserted.
const env = {
  STRIPE_MODE: "test",
  STRIPE_SECRET_KEY: "sk_test_not_a_real_key",
  STRIPE_WEBHOOK_SECRET: "whsec_not_a_real_secret",
} as unknown as Env;

const deliver = (init: RequestInit & { signature?: string }) =>
  handleStripeWebhook(
    new Request("http://localhost/stripe/webhook", {
      ...init,
      headers: init.signature ? { "stripe-signature": init.signature } : {},
    }),
    env,
  );

test("claims exactly its own path", () => {
  expect(isStripeWebhookPath("http://localhost/stripe/webhook")).toBe(true);
  expect(isStripeWebhookPath("http://localhost/stripe/webhook?x=1")).toBe(true);
});

test("leaves graphql and the auth base path alone", () => {
  expect(isStripeWebhookPath("http://localhost/graphql")).toBe(false);
  expect(isStripeWebhookPath("http://localhost/api/auth/sign-in/email")).toBe(
    false,
  );
  expect(isStripeWebhookPath("http://localhost/stripe/webhook/extra")).toBe(
    false,
  );
});

// A GET here is a browser or a scanner, never Stripe.
test("anything but POST is refused", async () => {
  expect((await deliver({ method: "GET" })).status).toBe(405);
});

test("a delivery with no signature header is refused", async () => {
  expect((await deliver({ method: "POST", body: "{}" })).status).toBe(400);
});

// The one that matters: an attacker can post any body they like to this URL.
test("a signature that does not verify is a 400, not a 500", async () => {
  const res = await deliver({
    method: "POST",
    body: JSON.stringify({
      id: "evt_forged",
      type: "checkout.session.completed",
    }),
    signature: "t=1,v1=deadbeef",
  });

  expect(res.status).toBe(400);
});
