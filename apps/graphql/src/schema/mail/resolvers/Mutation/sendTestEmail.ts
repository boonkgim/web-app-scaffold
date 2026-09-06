import { createMailer, renderVerifyEmail } from "@cc4-test/email";
import { GraphQLError } from "graphql";
import { isAllowedRecipient } from "./../../../../mail";
import type { MutationResolvers } from "./../../../types.generated";

export const sendTestEmail: NonNullable<
  MutationResolvers["sendTestEmail"]
> = async (_parent, { to }, ctx) => {
  if (!isAllowedRecipient(ctx, to)) {
    throw new GraphQLError("Recipient is not in MAIL_TEST_RECIPIENTS");
  }

  // A placeholder link, because nothing in this slice issues real tokens. What is
  // being proven is the pipeline, not the URL.
  const message = await renderVerifyEmail(
    "https://cc4-test.example/api/auth/verify-email?token=slice-7",
  );
  await createMailer(ctx).send({ to, ...message });

  return true;
};
