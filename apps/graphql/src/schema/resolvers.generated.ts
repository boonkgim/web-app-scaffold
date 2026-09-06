/* This file was automatically generated. DO NOT UPDATE MANUALLY. */
import type { Resolvers } from "./types.generated";
import { appEnv as Query_appEnv } from "./system/resolvers/Query/appEnv";
import { health as Query_health } from "./system/resolvers/Query/health";
import { version as Query_version } from "./system/resolvers/Query/version";
export const resolvers: Resolvers = {
  Query: { appEnv: Query_appEnv, health: Query_health, version: Query_version },
};
