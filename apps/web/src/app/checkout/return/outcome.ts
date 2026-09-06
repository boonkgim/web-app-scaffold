import type { CheckoutStatus } from "@/generated/graphql";

/** What the return card says, as data rather than JSX.
 *
 *  Separated from the page for two reasons: the page becomes a layout with no copy
 *  decisions in it, and the copy becomes testable without a DOM — which matters here
 *  more than most places, because the difference between two of these strings is the
 *  difference between thanking someone and telling them their card was declined.
 */
export type Outcome = {
  title: string;
  body: string;
  /** Where the single button goes. A failed attempt belongs back at the form; a
   *  successful one has nothing left to do on this page. */
  href: string;
  cta: string;
  /** The ARIA role on the body. Confirmations are announced politely; only a checkout
   *  this app could not read is worth interrupting a screen reader for. */
  role: "status" | "alert";
};

/** A `Record` keyed by the generated enum, not a chain of ternaries. Adding a fourth
 *  value to the SDL's `CheckoutStatus` stops this file compiling, where a ternary chain
 *  would have quietly rendered the last branch for it.
 */
export const OUTCOMES: Record<CheckoutStatus, Outcome> = {
  // Stripe reported this session complete when we asked it directly, so the thanks is
  // a fact about Stripe rather than about the browser that arrived here. What it does
  // not claim is that this stack has recorded anything — the webhook writes the row on
  // the home page, and that is a separate sentence we do not owe the customer.
  COMPLETE: {
    title: "Thank you",
    body: "Your payment is complete. Nothing more is needed from you.",
    href: "/",
    cta: "Back to web-app-scaffold",
    role: "status",
  },
  // A visitor lands here on a decline too, and the session is still open. Saying so
  // plainly is the whole reason this page reads the status instead of assuming that
  // arriving means paying.
  OPEN: {
    title: "Nothing was charged",
    body: "The payment did not go through. You can try again.",
    href: "/checkout",
    cta: "Try again",
    role: "status",
  },
  EXPIRED: {
    title: "Nothing was charged",
    body: "That checkout expired before it was completed.",
    href: "/checkout",
    cta: "Start again",
    role: "status",
  },
};

/** No id on the URL, or Stripe would not tell us about the one there was.
 *
 *  Deliberately says nothing either way about money: the resolver throws the same error
 *  for an id that never existed and for a call that failed, so this text has to be true
 *  of both.
 */
export const UNREADABLE: Outcome = {
  title: "We could not check that payment",
  body: "This checkout could not be confirmed. Try again from the store.",
  href: "/",
  cta: "Back to web-app-scaffold",
  role: "alert",
};
