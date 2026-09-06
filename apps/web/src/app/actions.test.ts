import { expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  result: {} as {
    data?: { createTestCheckoutSession: string };
    errors?: unknown[];
  },
}));
vi.mock("@/lib/api", () => ({
  graphqlFetch: () => Promise.resolve(mocks.result),
}));

const { fetchCheckoutClientSecret } = await import("./actions");

test("returns the client secret the API minted", async () => {
  mocks.result = { data: { createTestCheckoutSession: "cs_test_secret" } };

  await expect(fetchCheckoutClientSecret()).resolves.toBe("cs_test_secret");
});

// Stripe.js only reacts to a rejection, and the API's own message must not be the one
// that travels — it is written for us, not for whoever is holding a card.
test("a failed session rejects without surfacing the API's message", async () => {
  mocks.result = { errors: [{ message: "Stripe refused the request" }] };

  await expect(fetchCheckoutClientSecret()).rejects.toThrow(
    "Could not start checkout",
  );
});
