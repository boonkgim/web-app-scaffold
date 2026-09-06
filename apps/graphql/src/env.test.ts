import { expect, test } from "vitest";
import { requireEnv } from "./env";

test("returns a present value", () => {
  expect(requireEnv({ APP_ENV: "local" }, "APP_ENV")).toBe("local");
});

test("throws, naming the key, when missing or empty", () => {
  expect(() => requireEnv({}, "APP_ENV")).toThrow("APP_ENV");
  expect(() => requireEnv({ APP_ENV: "" }, "APP_ENV")).toThrow("APP_ENV");
});
