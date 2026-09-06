/** Read a var off the Worker's bindings, or fail here with the key's name.
 *
 *  The parameter is `object` and not `Record<string, unknown>` because the only caller
 *  passes `WorkerEnv`, and TypeScript gives an *interface* no implicit index signature
 *  — a generated interface is not assignable to a Record, however plain its fields.
 *  Widening to `object` keeps the call sites cast-free and still accepts the plain
 *  literals the test uses; the read below is the one narrowing, in one place. */
export function requireEnv(env: object, key: string): string {
  const value = (env as Record<string, unknown>)[key];
  if (typeof value !== "string" || value === "") {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}
