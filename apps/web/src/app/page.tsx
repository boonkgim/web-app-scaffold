import { graphqlFetch } from "@/lib/api";
import { graphql } from "@/generated";

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
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-50 font-sans dark:bg-black">
      <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
        cc4-test
      </h1>
      {res.errors ? (
        <p className="font-mono text-sm text-red-600">
          {res.errors.map((e) => e.message).join(", ")}
        </p>
      ) : (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-sm text-zinc-600 dark:text-zinc-400">
          <dt>api version</dt>
          <dd className="text-black dark:text-zinc-50">{res.data?.version}</dd>
          <dt>api health</dt>
          <dd className="text-black dark:text-zinc-50">{res.data?.health}</dd>
          <dt>api env</dt>
          <dd className="text-black dark:text-zinc-50">{res.data?.appEnv}</dd>
          {/* The build-time half of the same value: written as a literal member
              expression because that is the only form next build inlines --
              process.env[name] and destructuring are left untouched and arrive
              undefined in the browser. */}
          <dt>web env</dt>
          <dd className="text-black dark:text-zinc-50">
            {process.env.NEXT_PUBLIC_APP_ENV}
          </dd>
        </dl>
      )}
    </main>
  );
}
