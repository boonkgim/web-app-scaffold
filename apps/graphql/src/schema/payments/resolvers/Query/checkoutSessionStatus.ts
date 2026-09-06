import { GraphQLError } from "graphql";
import { createStripe } from "./../../../../stripe";
import type { QueryResolvers } from "./../../../types.generated";

// Stripe's status strings are typed as a union widened with `string` (the SDK spells it
// OtherString), so this switch is the narrowing rather than decoration. An unrecognised
// value is not mapped to a guess: a new terminal state is something to find out about,
// not to render as OPEN.
const STATUS = {
  open: "OPEN",
  complete: "COMPLETE",
  expired: "EXPIRED",
} as const;

/** Read a session back from Stripe by the id on the return URL.
 *
 *  The id arrives in a query string, which makes it a claim: anyone can type one. This
 *  is the sanctioned way to turn it into a fact — ask Stripe — and it is why the return
 *  page does not simply believe a `?paid=true`.
 *
 *  The field is public and returns nothing but the status, deliberately. It is an
 *  oracle for "is this session id complete?", which is worth little against ids that are
 *  unguessable random strings; adding the customer's email to the response is what would
 *  make it worth something to an attacker.
 */
export const checkoutSessionStatus: NonNullable<
  QueryResolvers["checkoutSessionStatus"]
> = async (_parent, { id }, ctx) => {
  let status: string | null;
  try {
    ({ status } = await createStripe(ctx).checkout.sessions.retrieve(id));
  } catch (cause) {
    // Stripe's message names the id and the account. Logged, not returned.
    console.error("[stripe] could not retrieve session", cause);
    throw new GraphQLError("No such Checkout Session");
  }

  const known = status && STATUS[status as keyof typeof STATUS];
  if (!known) {
    throw new GraphQLError(
      `Unhandled Checkout Session status ${String(status)}`,
    );
  }
  return known;
};
