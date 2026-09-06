import type { QueryResolvers } from "./../../../types.generated";

// Provisional: answers from the Worker itself, because there is nothing behind it yet.
// What it proves is still real — that a request reached this Worker, through the
// service binding, and came back typed. The slice that adds a database rewrites this
// body to query one, and that rewrite is the whole of its integration proof.
export const health: NonNullable<QueryResolvers["health"]> = () => "ok";
