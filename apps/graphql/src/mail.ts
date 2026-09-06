import type { Env } from "./context";

/** Who sendTestEmail may write to.
 *
 *  Fail closed on an unset or empty list, the same shape as cors.ts: this mutation has no
 *  session layer to gate it against yet, and a send-to-anyone mutation on a public endpoint
 *  is an open relay. An empty list refusing everything is the safe reading of a var someone
 *  forgot.
 */
export function isAllowedRecipient(env: Env, to: string): boolean {
  const allowed = (env.MAIL_TEST_RECIPIENTS ?? "")
    .split(",")
    .map((address) => address.trim().toLowerCase())
    .filter(Boolean);

  return allowed.includes(to.trim().toLowerCase());
}
