import { expect, test } from "vitest";
import { isAuthPath } from "./auth";

test("claims the base path and everything under it", () => {
  expect(isAuthPath("http://localhost/api/auth")).toBe(true);
  expect(isAuthPath("http://localhost/api/auth/sign-in/magic-link")).toBe(true);
  expect(isAuthPath("http://localhost/api/auth/get-session?x=1")).toBe(true);
  // The plugin's routes are under the same prefix and must be claimed too — this is
  // the one the browser is redirected to, so missing it hands the link to Yoga.
  expect(
    isAuthPath("http://localhost/api/auth/magic-link/verify?token=t"),
  ).toBe(true);
});

test("leaves the GraphQL endpoint alone", () => {
  expect(isAuthPath("http://localhost/graphql")).toBe(false);
  expect(isAuthPath("http://localhost/")).toBe(false);
});

// Why this is a comparison and not a bare startsWith.
test("does not claim a path that merely shares the prefix", () => {
  expect(isAuthPath("http://localhost/api/authorize")).toBe(false);
});
