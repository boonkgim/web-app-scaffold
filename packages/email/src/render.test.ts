import { expect, test } from "vitest";
import { renderSignInEmail } from "./render";

const URL = "https://cc4-test.example/api/auth/magic-link/verify?token=a";

test("the html carries the sign-in link", async () => {
  const { html } = await renderSignInEmail(URL);

  expect(html).toContain(URL);
  expect(html).toContain("<html");
});

// A recipient with HTML disabled must still be able to finish, so the link has to
// survive the text conversion — a button alone would not.
test("the text alternative carries it too", async () => {
  const { text } = await renderSignInEmail(URL);

  expect(text).toContain(URL);
  expect(text).not.toContain("<html");
});

test("the subject is set and is not the URL", async () => {
  const { subject } = await renderSignInEmail(URL);

  expect(subject).toBeTruthy();
  expect(subject).not.toContain("http");
});
