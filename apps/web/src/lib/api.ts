import { connection } from "next/server";
import { headers } from "next/headers";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { TypedDocumentString } from "@/generated/graphql";

export type GraphQLResult<T> = { data?: T; errors?: { message: string }[] };

/** Where the API is, from here — the one place the two environments differ. In
 *  production env.API is the service binding and the request never leaves Cloudflare's
 *  network; in next dev there is no binding and the local Worker is on 8787. */
function apiOrigin(): { fetch: typeof fetch; base: string } {
  const { env } = getCloudflareContext();
  return env.API
    ? { fetch: env.API.fetch.bind(env.API), base: "https://api" }
    : { fetch, base: "http://localhost:8787" };
}

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
  // This runs in the web Worker, not the browser, so the inbound request is the only
  // thing that knows about the session. Without forwarding it, `viewer` is always null.
  const cookie = (await headers()).get("cookie");
  const init = {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body,
  };
  const api = apiOrigin();
  const res = await api.fetch(`${api.base}/graphql`, init);
  // The wire is untyped by definition; TResult is a claim about what the schema
  // promises, which the server is separately typed to honour.
  return res.json() as Promise<GraphQLResult<TResult>>;
}

/** Forward an auth request to the API Worker, unchanged.
 *
 *  All of apps/web's involvement in authentication. No auth logic here, ever:
 *  Set-Cookie comes back untouched and belongs to this origin because this origin is
 *  what the browser asked. */
export async function apiFetch(request: Request): Promise<Response> {
  await connection();
  const { pathname, search } = new URL(request.url);
  const api = apiOrigin();
  // Buffered, not streamed: a service binding will not take a streaming body without
  // half-duplex support, and auth payloads are a few hundred bytes.
  const body =
    request.method === "GET" || request.method === "HEAD"
      ? undefined
      : await request.arrayBuffer();

  const upstream = await api.fetch(`${api.base}${pathname}${search}`, {
    method: request.method,
    headers: request.headers,
    body,
    // The redirect is the browser's to follow, not ours. Better Auth ends
    // /magic-link/verify with a 302 to callbackURL on *this* origin; under the
    // default "follow" the proxy resolves it against the API Worker instead, lands
    // on its root, and hands back GraphQL Yoga's landing page with the address bar
    // still on the token URL. Nothing errors — the visitor is signed in and shown a
    // 404, having spent the only link they had.
    redirect: "manual",
  });

  // Rebuilt, not returned. Next checks a route handler's return value against its own
  // `Response`, and in `next dev` the dev branch above is Node's global fetch, whose
  // undici `Response` is a different class — every auth call 500s with "received
  // '_Response'". Under workerd the classes match, so returning `upstream` directly
  // passes `pnpm preview` and production and fails only where the app is developed.
  // Copying the headers keeps multiple Set-Cookie values separate; joining them into
  // one would be the silent version of this bug.
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: upstream.headers,
  });
}
