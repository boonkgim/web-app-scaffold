import { expect, test } from "vitest";
import { formatPrice } from "./formatPrice";

test("renders cents as a currency string", () => {
  expect(formatPrice(1999)).toBe("$19.99");
});

test("keeps trailing zeros", () => {
  expect(formatPrice(500)).toBe("$5.00");
});

test("honours a non-default currency", () => {
  expect(formatPrice(1999, "EUR")).toBe("€19.99");
});
