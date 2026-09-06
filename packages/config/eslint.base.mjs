import js from "@eslint/js";
import tseslint from "typescript-eslint";

// The workspace's one ESLint answer. Every package's eslint.config.mjs starts
// from this array and appends only what is specific to it (apps/web adds the
// Next.js configs). Kept type-UNaware on purpose: `projectService` would need
// every file ESLint sees to belong to a tsconfig `include`, and each package's
// tsconfig deliberately includes only `src` — so vitest.config.ts, codegen.ts,
// and drizzle.config.ts would all error out. Upgrade to
// `tseslint.configs.recommendedTypeChecked` when a rule needing types
// (no-floating-promises is the one that will drive it) is worth that wiring.
export default tseslint.config(
  {
    // A lone `ignores` key makes these global — they apply to every later block.
    // Build output and generated code: never authored, never linted.
    ignores: [
      "**/.next/**",
      "**/.open-next/**",
      "**/.turbo/**",
      "**/.wrangler/**",
      // The react-email CLI's build directory — a generated Next.js app, see Slice 5.
      "**/.react-email/**",
      "**/dist/**",
      // Two shapes, because the two codegen configs disagree on naming: apps/web's
      // client preset writes a src/generated/ directory, while apps/graphql's server
      // preset interleaves *.generated.ts among the hand-written resolvers it seeds,
      // so there is no directory to exclude. Both are machine-owned and full of the
      // `any`s that typescript-resolvers emits for unconstrained context types.
      "**/src/generated/**",
      "**/*.generated.ts",
      "**/*.d.ts",
    ],
  },
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx,mts,cts}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    rules: {
      // Underscore-prefixed args are the repo's "deliberately unused" marker —
      // GraphQL resolvers take (_parent, _args, env) and would otherwise all flag.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
);
