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
