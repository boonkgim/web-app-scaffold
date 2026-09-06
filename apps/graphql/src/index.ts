import { createSchema, createYoga } from "graphql-yoga";
import { resolvers } from "./schema/resolvers.generated";
import { typeDefs } from "./schema/typeDefs.generated";
import { corsFor } from "./cors";
import { createAuth, isAuthPath } from "./auth";
import { handleStripeWebhook, isStripeWebhookPath } from "./stripe-webhook";
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

// Better Auth owns everything under its basePath, Stripe's webhook owns one path, and
// Yoga owns the rest. Both are sets of HTTP endpoints rather than GraphQL concerns:
// auth behind a mutation would mean re-implementing its cookie handling in a resolver,
// and a webhook behind one would mean verifying a signature over a body Yoga had
// already parsed and re-serialised.
//
// The webhook branch also sits ahead of Yoga's CORS: corsFor names browser origins, and
// Stripe sends no Origin at all.
//
// ctx is optional because the unit tests call this with two arguments — and spread
// rather than passed, because Yoga's rest parameter is `Partial<Env>[]` and takes no
// `undefined`. It is forwarded and not dropped: `export default { fetch: yoga.fetch }`
// handed the runtime's third argument straight through, so not passing it here would
// quietly take `waitUntil` away from Yoga.
export default {
  fetch(
    request: Request,
    env: Env,
    ctx?: ExecutionContext,
  ): Response | Promise<Response> {
    if (isAuthPath(request.url)) return createAuth(env).handler(request);
    if (isStripeWebhookPath(request.url))
      return handleStripeWebhook(request, env);
    return yoga.fetch(request, env, ...(ctx ? [ctx] : []));
  },
};
