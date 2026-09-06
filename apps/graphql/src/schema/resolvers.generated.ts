/* This file was automatically generated. DO NOT UPDATE MANUALLY. */
import type { Resolvers } from "./types.generated";
import { appEnv as Query_appEnv } from "./system/resolvers/Query/appEnv";
import { checkoutSessionStatus as Query_checkoutSessionStatus } from "./payments/resolvers/Query/checkoutSessionStatus";
import { health as Query_health } from "./system/resolvers/Query/health";
import { stripeEvents as Query_stripeEvents } from "./payments/resolvers/Query/stripeEvents";
import { version as Query_version } from "./system/resolvers/Query/version";
import { viewer as Query_viewer } from "./auth/resolvers/Query/viewer";
import { createTestCheckoutSession as Mutation_createTestCheckoutSession } from "./payments/resolvers/Mutation/createTestCheckoutSession";
import { sendTestEmail as Mutation_sendTestEmail } from "./mail/resolvers/Mutation/sendTestEmail";
export const resolvers: Resolvers = {
  Query: {
    appEnv: Query_appEnv,
    checkoutSessionStatus: Query_checkoutSessionStatus,
    health: Query_health,
    stripeEvents: Query_stripeEvents,
    version: Query_version,
    viewer: Query_viewer,
  },
  Mutation: {
    createTestCheckoutSession: Mutation_createTestCheckoutSession,
    sendTestEmail: Mutation_sendTestEmail,
  },
};
