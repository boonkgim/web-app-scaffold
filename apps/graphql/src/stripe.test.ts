import { expect, test } from "vitest";
import { assertKeyMatchesMode } from "./stripe";

test("a key matching its mode passes, in both issued forms", () => {
  expect(() => assertKeyMatchesMode("test", "sk_test_abc")).not.toThrow();
  expect(() => assertKeyMatchesMode("test", "rk_test_abc")).not.toThrow();
  expect(() => assertKeyMatchesMode("live", "sk_live_abc")).not.toThrow();
});

// The reason the mode is a var at all. Both directions matter: a live key under test
// charges real cards, and a test key under live silently takes no money at all.
test("a key from the other mode is refused, in both directions", () => {
  expect(() => assertKeyMatchesMode("test", "sk_live_abc")).toThrow(
    "STRIPE_MODE",
  );
  expect(() => assertKeyMatchesMode("live", "sk_test_abc")).toThrow(
    "STRIPE_MODE",
  );
});

test("an unset or unknown mode throws rather than guessing", () => {
  expect(() => assertKeyMatchesMode("", "sk_test_abc")).toThrow("STRIPE_MODE");
  expect(() => assertKeyMatchesMode("sandbox", "sk_test_abc")).toThrow(
    "sandbox",
  );
});
