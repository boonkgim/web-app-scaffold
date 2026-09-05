import { describe, expect, it } from "vitest";

describe("harness smoke test", () => {
  it("runs one real assertion through vitest, eslint, tsc, and prettier", () => {
    expect(1 + 1).toBe(2);
  });
});
