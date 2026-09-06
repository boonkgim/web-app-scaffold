import type { QueryResolvers } from "./../../../types.generated";
import { requireEnv } from "../../../../env";

export const appEnv: NonNullable<QueryResolvers["appEnv"]> = (
  _parent,
  _arg,
  ctx,
) => requireEnv(ctx, "APP_ENV");
