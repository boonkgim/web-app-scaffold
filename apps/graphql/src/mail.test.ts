import { expect, test } from "vitest";
import { isAllowedRecipient } from "./mail";
import type { Env } from "./context";

const envWith = (list?: string) =>
  ({ MAIL_TEST_RECIPIENTS: list }) as unknown as Env;

test("an address on the list is allowed, case and spacing insensitive", () => {
  const env = envWith(" A@example.test , b@example.test ");

  expect(isAllowedRecipient(env, "a@EXAMPLE.test")).toBe(true);
  expect(isAllowedRecipient(env, "b@example.test")).toBe(true);
});

test("an address off the list is refused", () => {
  expect(isAllowedRecipient(envWith("a@example.test"), "c@example.test")).toBe(
    false,
  );
});

// The trap: an empty list must mean "nobody", not "no restriction".
test("an unset list refuses everything", () => {
  expect(isAllowedRecipient(envWith(undefined), "a@example.test")).toBe(false);
  expect(isAllowedRecipient(envWith(""), "a@example.test")).toBe(false);
});
