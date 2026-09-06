import { graphqlFetch } from "@/lib/api";
import { graphql } from "@/generated";
import { ModeToggle } from "@/components/mode-toggle";
import {
  Card,
  CardAction,
  CardContent,
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
  }
`);

// Server component: this runs in the Worker, so the query goes over the service
// binding in production and to the local Worker in dev. Nothing reaches the browser.
export default async function Home() {
  const res = await graphqlFetch(HomeQuery);

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
            </dl>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
