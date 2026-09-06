"use client";

import { useCallback, useState } from "react";
import {
  EmbeddedCheckout,
  EmbeddedCheckoutProvider,
} from "@stripe/react-stripe-js";
import { stripePromise } from "@/lib/stripe";
import { fetchCheckoutClientSecret } from "../actions";

/** Stripe's form, in an iframe, on our origin.
 *
 *  The iframe is Stripe's page: it does not inherit this app's theme tokens and will not
 *  follow the mode toggle, because embedded Checkout is styled from the account's
 *  branding settings in the dashboard rather than from anything sent per session.
 */
export function CheckoutForm() {
  const [failed, setFailed] = useState(false);

  // useCallback because this component has state: a new function identity on the
  // re-render would be a second option object, and the provider takes fetchClientSecret
  // once and ignores later ones.
  const fetchClientSecret = useCallback(
    () =>
      fetchCheckoutClientSecret().catch((cause: unknown) => {
        // Stripe renders nothing useful for a rejected fetch, so the page has to say
        // it. Rethrown anyway: the provider still needs to know it failed.
        console.error(cause);
        setFailed(true);
        throw cause;
      }),
    [],
  );

  if (failed) {
    return (
      <p role="alert" className="text-destructive text-sm">
        Could not start checkout. Reload the page to try again.
      </p>
    );
  }

  return (
    <EmbeddedCheckoutProvider
      stripe={stripePromise}
      options={{ fetchClientSecret }}
    >
      <EmbeddedCheckout />
    </EmbeddedCheckoutProvider>
  );
}
