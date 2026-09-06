import type { BetterAuthOptions } from "better-auth";
import { magicLink } from "better-auth/plugins";

/** What actually delivers the link.
 *
 *  Declared structurally rather than imported from the plugin: it is the one thing the
 *  two callers cannot share, so it has to be nameable on its own. createAuth(env) mails
 *  it; auth.config.ts passes a no-op.
 */
export type SendMagicLink = (data: {
  email: string;
  url: string;
  token: string;
}) => Promise<void>;

/** The route prefix, as a value.
 *
 *  A constant as well as an option, because isAuthPath needs the string and building the
 *  whole options object to read it would mean inventing a sender. Also hard-coded as a
 *  directory name in apps/web's proxy route: a Next.js route segment cannot be built
 *  from a value.
 */
export const AUTH_BASE_PATH = "/api/auth";

/** Auth configuration that does not depend on a binding.
 *
 *  Shared by createAuth(env) and by auth.config.ts, which the schema generator reads.
 *  Anything affecting table shape belongs here, or the two describe different schemas —
 *  and the plugin list is exactly that, which is why this is a factory rather than a
 *  constant. Leaving magicLink out of the generator's config to avoid supplying a sender
 *  would be the silent version of the bug: a migration that applies cleanly against a
 *  schema the running server does not use.
 */
export function authOptions(sendMagicLink: SendMagicLink) {
  return {
    appName: "cc4-test",
    basePath: AUTH_BASE_PATH,
    plugins: [
      magicLink({
        sendMagicLink,
        // The default is 300. Ten minutes because a link that expires while someone
        // walks to their phone reads as a broken app, and the cost is bounded: the
        // token is single-use and was delivered to a mailbox the account already owns.
        expiresIn: 600,
        // Stated rather than inherited. The plugin defaults to exactly this, so writing
        // it down changes no behaviour — it makes the number reviewable, on the one
        // endpoint here that is both unauthenticated and able to send mail. Read
        // `Leaves behind` before trusting it: the counter lives in memory, and a Worker
        // isolate is neither shared nor long-lived, so this binds per-isolate.
        rateLimit: { window: 60, max: 5 },
      }),
    ],
    telemetry: { enabled: false },
  } satisfies BetterAuthOptions;
}
