import { expect, test } from "vitest";
import { assertPublishableKey } from "./stripe";

test("a publishable key passes, test and live alike", () => {
  expect(assertPublishableKey("pk_test_abc")).toBe("pk_test_abc");
  expect(assertPublishableKey("pk_live_abc")).toBe("pk_live_abc");
});

// The one that matters. A secret key here would be served to every visitor.
test("a secret key in the public var is refused", () => {
  expect(() => assertPublishableKey("sk_test_abc")).toThrow(
    "never a secret key",
  );
  expect(() => assertPublishableKey("rk_live_abc")).toThrow(
    "never a secret key",
  );
});

// What an un-inlined NEXT_PUBLIC_ var actually looks like in the browser.
test("an unset key names the variable rather than failing at mount", () => {
  expect(() => assertPublishableKey(undefined)).toThrow(
    "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  );
  expect(() => assertPublishableKey("")).toThrow(
    "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  );
});
