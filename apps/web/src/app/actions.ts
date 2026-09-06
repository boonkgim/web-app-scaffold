"use server";

import { graphql } from "@/generated";
import { graphqlFetch } from "@/lib/api";

const CreateTestCheckoutSession = graphql(`
  mutation CreateTestCheckoutSession {
    createTestCheckoutSession
  }
`);

/** Create a Checkout Session and hand its client secret to the embedded form.
 *
 *  A server action rather than a route handler: graphqlFetch runs in this Worker, where
 *  the API service binding is, and Stripe's `fetchClientSecret` option wants exactly a
 *  `() => Promise<string>` — which is what a server action imported into a client
 *  component already is. No route, no JSON envelope, no second place to keep in sync.
 *
 *  It throws rather than returning a sentinel because a rejected promise is the only
 *  failure shape Stripe.js understands here; the caller turns that into something on
 *  screen.
 */
export async function fetchCheckoutClientSecret(): Promise<string> {
  const res = await graphqlFetch(CreateTestCheckoutSession);
  const clientSecret = res.data?.createTestCheckoutSession;

  if (!clientSecret) {
    // The API's message is for the log. The visitor gets the caller's sentence.
    console.error("createTestCheckoutSession failed", res.errors);
    throw new Error("Could not start checkout");
  }
  return clientSecret;
}
