import { GraphQLError } from "graphql";
import { createStripe } from "./../../../../stripe";
import { requireEnv } from "./../../../../env";
import type { MutationResolvers } from "./../../../types.generated";

// Integer cents, like every amount in this repo — nothing in a money path is a float.
// Inline on the session rather than a Price created in the dashboard: a hand-made
// product is a one-time step no doc can check, and the amount belongs in the repo.
const TEST_ITEM_CENTS = 1900;

export const createTestCheckoutSession: NonNullable<
  MutationResolvers["createTestCheckoutSession"]
> = async (_parent, _arg, ctx) => {
  const origin = requireEnv(ctx, "WEB_ORIGIN");

  const session = await createStripe(ctx).checkout.sessions.create({
    // "embedded_page", not "embedded" — the latter is not a value this API accepts.
    // Re-verified against the live API on 2026-09-06, in this project's own sandbox:
    // a session created with ui_mode=embedded_page comes back with client_secret set
    // and url null, and `embedded` is still refused with "The ui_mode value `embedded`
    // is no longer supported. Use `embedded_page` instead."
    ui_mode: "embedded_page",
    mode: "payment",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: TEST_ITEM_CENTS,
          product_data: { name: "cc4-test test item" },
        },
      },
    ],
    // Where the iframe sends the browser once the attempt is over, one way or the
    // other. There is no cancel_url to pair it with: the API rejects that param on an
    // embedded session, because the form was never a page the visitor could leave.
    // Stripe substitutes the real id for the template before redirecting.
    return_url: `${origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
    // redirect_on_completion is left at its default, "always". The alternative is
    // "never" plus an onComplete callback in the browser — which would make a
    // client-side event the only completion signal, and this slice's whole position is
    // that the browser is not what proves a payment.
  });

  // Typed nullable because a hosted session has no client secret. This one is embedded,
  // so a null here means something changed rather than something is optional.
  if (!session.client_secret) {
    throw new GraphQLError(
      "Stripe returned an embedded session with no client secret",
    );
  }
  return session.client_secret;
};
