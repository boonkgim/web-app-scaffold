import { connection } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { TypedDocumentString } from "@/generated/graphql";

export type GraphQLResult<T> = { data?: T; errors?: { message: string }[] };

export async function graphqlFetch<TResult, TVariables>(
  query: TypedDocumentString<TResult, TVariables>,
  // Spread rather than `variables?:` so the argument is required exactly when the
  // operation declares variables. An optional parameter would let a query with
  // required variables be called with none and still compile.
  ...[variables]: TVariables extends Record<string, never> ? [] : [TVariables]
): Promise<GraphQLResult<TResult>> {
  // Stops prerendering here. Reading the Worker's bindings needs a real request, and
  // `getCloudflareContext()` throws if it runs while a route is being prerendered at
  // build time -- which is what silently broke `next build` before this line existed.
  // Next 16 removed `export const dynamic`; connection() replaces it, and it belongs
  // in this helper rather than in a page: every caller needs request-time context, so
  // putting it at the boundary that actually requires it means a new page cannot
  // forget to opt out.
  await connection();
  // The document is a String subclass, not a primitive -- toString() is what puts the
  // query text in the payload rather than leaning on how JSON.stringify happens to
  // treat boxed strings.
  const body = JSON.stringify({ query: query.toString(), variables });
  const init = {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  };
  const { env } = getCloudflareContext();
  const res = env.API
    ? await env.API.fetch("https://api/graphql", init)
    : await fetch("http://localhost:8787/graphql", init);
  // The wire is untyped by definition; TResult is a claim about what the schema
  // promises, which the server is separately typed to honour.
  return res.json() as Promise<GraphQLResult<TResult>>;
}
