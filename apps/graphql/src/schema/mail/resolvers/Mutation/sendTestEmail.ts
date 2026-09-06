import { createMailer, renderSignInEmail } from "@cc4-test/email";
import { GraphQLError } from "graphql";
import { isAllowedRecipient } from "./../../../../mail";
import type { MutationResolvers } from "./../../../types.generated";

export const sendTestEmail: NonNullable<
  MutationResolvers["sendTestEmail"]
> = async (_parent, { to }, ctx) => {
  if (!isAllowedRecipient(ctx, to)) {
    throw new GraphQLError("Recipient is not in MAIL_TEST_RECIPIENTS");
  }

  // Still a placeholder, and now deliberately so rather than incidentally. This
  // mutation is unauthenticated; minting a real magic-link token here would turn it
  // into an endpoint that mails working credentials for any address in
  // MAIL_TEST_RECIPIENTS. The allowlist is the only thing in front of it.
  const message = await renderSignInEmail(
    "https://cc4-test.example/api/auth/magic-link/verify?token=placeholder",
  );
  await createMailer(ctx).send({ to, ...message });

  return true;
};
