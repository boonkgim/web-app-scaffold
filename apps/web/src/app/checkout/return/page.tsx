import Link from "next/link";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { LoaderCircle } from "lucide-react";
import { graphql } from "@/generated";
import { graphqlFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OUTCOMES, UNREADABLE, type Outcome } from "./outcome";

const CheckoutStatusQuery = graphql(`
  query CheckoutStatus($id: ID!) {
    checkoutSessionStatus(id: $id)
  }
`);

/** Where Stripe sends the browser once the attempt is over — successful or not.
 *
 *  The session id arrives in the query string, so it is a claim. The status comes from
 *  asking Stripe, never from a parameter: a page that believed `?paid=true` would be a
 *  page anyone could talk into saying "paid".
 *
 *  Nothing in this component awaits, and that is the point. Stripe's iframe hands the
 *  browser a top-level navigation, and until this Worker sends a byte the visitor is
 *  still looking at the payment form they have already finished with — a Stripe API
 *  round trip spent staring at the thing they just completed. Keeping the shell
 *  synchronous means the card paints in the first chunk and only the sentence inside it
 *  waits.
 */
export default function CheckoutReturn({
  searchParams,
}: PageProps<"/checkout/return">) {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-md">
        {/* searchParams is a promise and is passed on unread. Awaiting it here would
            pull the dynamic access above the boundary and there would be no shell left
            to stream. */}
        <Suspense fallback={<Confirming />}>
          <Confirmed searchParams={searchParams} />
        </Suspense>
      </Card>
    </main>
  );
}

/** The card's contents, in one place, so the pending state and the four outcomes are
 *  the same shape and — because the button's box is always occupied — the same height.
 *  A centred card that grows when the status lands would move under a cursor already on
 *  its way to the button. */
function Message({
  title,
  action,
  children,
}: {
  title: string;
  action: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      {/* No text-sm: Card already sets it on the root and every child inherits. */}
      <CardContent className="grid gap-4">
        {children}
        {action}
      </CardContent>
    </>
  );
}

/** What the visitor sees while the status is still in flight — which is the only thing
 *  on this page they should ever have to wait for. */
function Confirming() {
  return (
    <Message
      title="Confirming your payment"
      // The button's box, held empty. `Button`'s default size is h-8, so the card is
      // the same height before and after the status arrives.
      action={<div className="h-8" />}
    >
      <p
        role="status"
        className="text-muted-foreground flex items-center gap-2"
      >
        {/* aria-hidden because the sentence beside it already says this to a screen
            reader, and a spinning icon has nothing to add to that. */}
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
        Checking with Stripe — a moment.
      </p>
    </Message>
  );
}

/** The half of the page that suspends: one read-back from Stripe, turned into copy.
 *
 *  A COMPLETE here is a statement about Stripe's session, not about this stack: the
 *  event row on the home page is written by the webhook, and that is what proves the
 *  payment was recorded rather than merely taken.
 */
async function Confirmed({
  searchParams,
}: {
  searchParams: PageProps<"/checkout/return">["searchParams"];
}) {
  const id = (await searchParams).session_id;
  const res =
    typeof id === "string"
      ? await graphqlFetch(CheckoutStatusQuery, { id })
      : undefined;

  const status = res?.data?.checkoutSessionStatus;
  const outcome: Outcome = status ? OUTCOMES[status] : UNREADABLE;

  return (
    <Message
      title={outcome.title}
      action={
        // nativeButton={false} for the reason the home page's link-button carries it:
        // render produces an <a>, and the primitive defaults to native button
        // semantics.
        <Button
          render={<Link href={outcome.href} />}
          nativeButton={false}
          variant="secondary"
        >
          {outcome.cta}
        </Button>
      }
    >
      <p
        role={outcome.role}
        className={outcome.role === "alert" ? "text-destructive" : undefined}
      >
        {outcome.body}
      </p>
    </Message>
  );
}
