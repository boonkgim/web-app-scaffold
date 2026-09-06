import { expect, test } from "vitest";
import { renderVerifyEmail } from "./render";

const URL = "https://cc4-test.example/api/auth/verify-email?token=abc123";

test("the html carries the verification link", async () => {
  const { html } = await renderVerifyEmail(URL);

  expect(html).toContain(URL);
  expect(html).toContain("<html");
});

// A recipient with HTML disabled must still be able to finish, so the link has to
// survive the text conversion — a button alone would not.
test("the text alternative carries it too", async () => {
  const { text } = await renderVerifyEmail(URL);

  expect(text).toContain(URL);
  expect(text).not.toContain("<html");
});

test("the subject is set and is not the URL", async () => {
  const { subject } = await renderVerifyEmail(URL);

  expect(subject).toBeTruthy();
  expect(subject).not.toContain("http");
});
