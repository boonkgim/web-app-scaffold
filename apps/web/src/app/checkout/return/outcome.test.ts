import { describe, expect, it } from "vitest";
import { OUTCOMES, UNREADABLE } from "./outcome";

// The Record's key type already makes this exhaustive at compile time. What a test can
// still hold is the meaning of the strings, which is the part an edit can get wrong
// while everything still compiles.
describe("checkout return copy", () => {
  it("thanks the visitor for COMPLETE and for nothing else", () => {
    expect(OUTCOMES.COMPLETE.title).toMatch(/thank/i);
    // A declined card lands on this page too, with the session still OPEN. Thanking
    // there is the failure this whole page exists to avoid.
    for (const outcome of [OUTCOMES.OPEN, OUTCOMES.EXPIRED, UNREADABLE]) {
      expect(`${outcome.title} ${outcome.body}`).not.toMatch(/thank/i);
    }
  });

  it("says plainly that a failed attempt cost nothing", () => {
    expect(OUTCOMES.OPEN.body).toMatch(/did not go through/i);
    expect(OUTCOMES.OPEN.title).toMatch(/nothing was charged/i);
    expect(OUTCOMES.EXPIRED.title).toMatch(/nothing was charged/i);
    // Not the unreadable case: this app does not know either way there, and a
    // reassurance it cannot support is worse than none.
    expect(UNREADABLE.title).not.toMatch(/nothing was charged/i);
  });

  it("sends a failed attempt back to the form and a paid one home", () => {
    expect(OUTCOMES.OPEN.href).toBe("/checkout");
    expect(OUTCOMES.EXPIRED.href).toBe("/checkout");
    expect(OUTCOMES.COMPLETE.href).toBe("/");
  });

  it("interrupts a screen reader only when the checkout could not be read", () => {
    expect(UNREADABLE.role).toBe("alert");
    for (const outcome of Object.values(OUTCOMES)) {
      expect(outcome.role).toBe("status");
    }
  });
});
