import { createSchema, createYoga } from "graphql-yoga";
import { resolvers } from "./schema/resolvers.generated";
import { typeDefs } from "./schema/typeDefs.generated";
import { corsFor } from "./cors";
import type { Env } from "./context";

export type { Env };

// Both halves are generated from the SDL modules under src/schema, so neither can
// disagree with it. `typeDefs` arrives as a pre-parsed DocumentNode rather than a
// string — a Worker has no filesystem to read schema.graphql from, and shipping the
// AST skips a parse on every cold start.
const yoga = createYoga<Env>({
  schema: createSchema({ typeDefs, resolvers }),
  // A factory rather than a literal, because the allowlist lives in a Worker var and
  // vars only exist per-request, on `env`. Yoga hands the server context to this
  // callback as its second argument; for a Worker that context is `env` merged with
  // `ctx`, which is where CORS_ORIGINS shows up.
  //
  // The cast is not decoration: Yoga types this option as `Parameters<typeof useCORS>[0]`
  // without instantiating the generic, so the context arrives as `unknown` however
  // precisely `createYoga<Env>` was parameterised. Deleting it does not compile.
  cors: (_request, env) => corsFor(env as Env),
});

export default { fetch: yoga.fetch };
