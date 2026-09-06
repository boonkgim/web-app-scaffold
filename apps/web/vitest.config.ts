import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// tsconfig's `@/*` alias, restated: Vitest resolves imports itself and does not read
// tsconfig paths. Nothing caught this before because the only `@/` imports were
// type-only and erased before they reached the runtime. Declared per project rather
// than once at the root -- inline project entries are separate Vite configs and do not
// inherit the root's `resolve`.
//
// `import.meta.dirname`, not `__dirname`: this package is ESM, and Vite's
// `configLoader: 'native'` -- planned to become its default -- cannot supply the
// CommonJS global. It warns today and breaks later.
const alias = { "@": resolve(import.meta.dirname, "src") };

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          exclude: ["**/*.int.test.ts"],
          // src/lib/stripe.ts calls loadStripe at module scope behind the same guard
          // it exports, so importing it to test that guard runs it. Vitest reads no
          // env file, and next build's inlining is not in play here -- without a
          // value the module throws before a single test is collected.
          //
          // A literal pk_test_ key and not the real one: nothing here reaches Stripe,
          // and a test that needs a credential is a test a fresh clone cannot run.
          env: {
            NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:
              "pk_test_unit_tests_never_call_stripe",
          },
        },
      },
      {
        resolve: { alias },
        test: {
          name: "integration",
          include: ["src/**/*.int.test.ts"],
        },
      },
    ],
  },
});
