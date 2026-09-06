import { createRequire } from "node:module";
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import base from "../../packages/config/eslint.base.mjs";

// eslint-plugin-react (a transitive dep of eslint-config-next) defaults to
// `version: "detect"`, and its detection path calls `context.getFilename()` —
// removed in ESLint 10, so every rule it owns throws before linting a line.
// Naming the version explicitly skips detection entirely. Read from the
// installed React rather than hardcoded, so it cannot drift from package.json.
// Remove once eslint-plugin-react supports ESLint 10; 7.37.5 is the latest
// published and still peers `eslint: "... || ^9.7"`.
const reactVersion = createRequire(import.meta.url)(
  "react/package.json",
).version;

const eslintConfig = defineConfig([
  // The workspace base first, then Next's configs on top: eslint-config-next
  // carries the React/hooks/core-web-vitals rules the base cannot know about,
  // and later blocks win on any rule both set.
  ...base,
  ...nextVitals,
  ...nextTs,
  { settings: { react: { version: reactVersion } } },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
