import { createAuth } from "./../../../../auth";
import type { QueryResolvers } from "./../../../types.generated";

// The session comes from the request cookie and nowhere else. Never from an argument:
// a client-supplied user id is a claim, not a fact.
export const viewer: NonNullable<QueryResolvers["viewer"]> = async (
  _parent,
  _arg,
  ctx,
) => {
  const session = await createAuth(ctx).api.getSession({
    headers: ctx.request.headers,
  });
  if (!session) return null;

  return { id: session.user.id, email: session.user.email };
};
