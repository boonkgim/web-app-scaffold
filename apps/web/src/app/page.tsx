import Link from "next/link";
import { graphqlFetch } from "@/lib/api";
import { graphql } from "@/generated";
import { formatUtc } from "@/lib/formatUtc";
import { ModeToggle } from "@/components/mode-toggle";
import { AuthPanel } from "@/components/auth-panel";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// Codegen scans for these calls and types the document by its result shape, so the
// destructuring below is checked against the SDL. Rename a field there and this stops
// compiling -- where the old hand-written result type would have kept compiling and
// rendered `undefined`.
const HomeQuery = graphql(`
  query Home {
    version
    health
    appEnv
    viewer {
      email
    }
    stripeEvents(limit: 1) {
      type
      receivedAt
    }
  }
`);

// Server component: this runs in the Worker, so the query goes over the service
// binding in production and to the local Worker in dev. Nothing reaches the browser.
export default async function Home() {
  const res = await graphqlFetch(HomeQuery);
  // Lifted out of the JSX because it is read three times below, and an optional chain
  // repeated three times does not narrow — this does.
  const lastEvent = res.data?.stripeEvents[0];

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-md">
        {/* CardHeader is a grid, not a flex row: it switches to
            `grid-cols-[1fr_auto]` when it contains a CardAction, which is the
            slot a header-level control belongs in. Laying the toggle out with
            flex utilities here would be fighting the component. */}
        <CardHeader>
          <CardTitle>cc4-test</CardTitle>
          <CardAction>
            <ModeToggle />
          </CardAction>
        </CardHeader>
        <CardContent>
          {res.errors ? (
            <p className="text-destructive font-mono text-sm">
              {res.errors.map((e) => e.message).join(", ")}
            </p>
          ) : (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-sm">
              <dt className="text-muted-foreground">api version</dt>
              <dd>{res.data?.version}</dd>
              <dt className="text-muted-foreground">db health</dt>
              <dd>{res.data?.health}</dd>
              <dt className="text-muted-foreground">api env</dt>
              <dd>{res.data?.appEnv}</dd>
              {/* The build-time half of the same value: written as a literal member
                  expression because that is the only form next build inlines --
                  process.env[name] and destructuring are left untouched and arrive
                  undefined in the browser. */}
              <dt className="text-muted-foreground">web env</dt>
              <dd>{process.env.NEXT_PUBLIC_APP_ENV}</dd>
              {/* Read by the server from the forwarded cookie. The panel below reads
                  the same session in the browser; the two agreeing is the proof. */}
              <dt className="text-muted-foreground">viewer</dt>
              <dd>{res.data?.viewer?.email ?? "signed out"}</dd>
              {/* Written by the webhook and by nothing else, so "none yet" means no
                  signed delivery has arrived — not that no one has paid. */}
              <dt className="text-muted-foreground">last stripe event</dt>
              {/* wrap-anywhere because this is the one value in the panel that is
                  wider than its column: `checkout.session.completed` measures 218px in
                  a 179px grid track, so without it the type overruns the card's right
                  padding. `anywhere` and not `break-all` — it breaks only the value
                  that has to break, and leaves the short ones intact if they grow. */}
              <dd className="wrap-anywhere">
                {lastEvent ? (
                  <>
                    {lastEvent.type}
                    {/* The time the webhook wrote the row, not the time Stripe made the
                        event — this panel reports what this stack did. UTC, because the
                        visitor's offset only exists after mount and this is a server
                        component. */}
                    <span className="text-muted-foreground block">
                      {formatUtc(lastEvent.receivedAt)}
                    </span>
                  </>
                ) : (
                  "none yet"
                )}
              </dd>
            </dl>
          )}
        </CardContent>
        {/* No padding or border added here: CardFooter already carries both
            (`border-t p-(--card-spacing)`). The wrapper stretches its children to the
            footer's width, since CardFooter is a flex row, and stacks them. */}
        <CardFooter>
          <div className="grid w-full gap-3">
            <AuthPanel />
            {/* A link, not a form: the payment form lives on /checkout, and getting
                there is navigation. `render` rather than asChild — this Button is Base
                UI, whose composition prop is render. `nativeButton={false}` because what
                render produces here is an <a>: left at its default the primitive applies
                native button semantics to an element that is not one, and says so. No
                notice slot here either, since the return page owns everything there is
                to say about an attempt. */}
            <Button
              render={<Link href="/checkout" />}
              nativeButton={false}
              variant="secondary"
            >
              Buy the test item
            </Button>
          </div>
        </CardFooter>
      </Card>
    </main>
  );
}
