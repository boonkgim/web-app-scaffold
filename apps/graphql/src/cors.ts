import type { CORSOptions } from "graphql-yoga";
import type { Env } from "./context";

/** Who may call this API from a browser.
 *
 *  Yoga ships with CORS *on* and permissive: with no `cors` option it reflects whatever
 *  Origin the request carries back as `Access-Control-Allow-Origin`, and — because the
 *  reflected value is not `*` — pairs it with `Access-Control-Allow-Credentials: true`.
 *  Any page on any origin could query this Worker from a visitor's browser. That is the
 *  default because Yoga cannot know our origins. This module is where we name them.
 *
 *  Server-to-server traffic is untouched. apps/web reaches us over the `API` service
 *  binding, and `env.API.fetch()` sends no Origin header; the plugin emits no CORS
 *  headers at all when Origin is absent. Tightening this cannot break SSR — CORS is a
 *  rule browsers enforce on themselves, and nothing else consults it.
 */
export function corsFor(env: Env): CORSOptions {
  const origins = (env.CORS_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  // Fail closed on a missing or empty var. Returning `{ origin: [] }` would do the
  // opposite: the plugin treats an empty list identically to `*` and goes back to
  // reflecting the caller, so a deploy that forgot the var would be *wider* open than
  // the default we are replacing. `false` disables the plugin outright — no headers,
  // so browsers block the response — while leaving the binding path working.
  if (origins.length === 0) return false;

  return {
    origin: origins,
    // The client posts JSON; nothing else is in use. A future GET-based caller fails
    // its preflight loudly rather than quietly inheriting an allowance no one asked
    // for. Yoga answers OPTIONS itself, so it needs no entry here.
    methods: ["POST"],
    allowedHeaders: ["content-type"],
    // No cross-origin cookies. This has to be said out loud: left undefined, the plugin
    // sets `Allow-Credentials: true` for any origin that isn't `*` — which is exactly
    // how the permissive default came to be credentialed. When browser-side auth
    // arrives, turning this on is a deliberate edit, not an inherited default.
    credentials: false,
    // Cache preflights for a day (browsers clamp this to their own ceiling). A page
    // that queries on interaction otherwise pays an extra round trip before each one.
    maxAge: 86400,
  };
}
