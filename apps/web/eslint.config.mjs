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

// Tailwind's palette utilities, the ones a semantic token is supposed to replace:
// `bg-zinc-50`, `text-red-600`, `border-white`. Matched inside className only, and
// only as a whole utility -- the `(?:^| |:)` prefix is what lets `dark:bg-black` match
// while leaving `bg-background` and a token named after a colour alone.
const PALETTE_UTILITY =
  "(?:^| |:)(?:bg|text|border|ring|fill|stroke|outline|decoration|divide|shadow|caret|accent|placeholder|from|via|to)-(?:black|white|(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|100|200|300|400|500|600|700|800|900|950))(?:$| )";
const PALETTE_MESSAGE =
  "Raw palette colour in className. Use a semantic token (bg-background, text-muted-foreground, ...) so src/styles/theme.css stays the only place the look is decided.";

const eslintConfig = defineConfig([
  // The workspace base first, then Next's configs on top: eslint-config-next
  // carries the React/hooks/core-web-vitals rules the base cannot know about,
  // and later blocks win on any rule both set.
  ...base,
  ...nextVitals,
  ...nextTs,
  { settings: { react: { version: reactVersion } } },
  {
    // The theme contract, as a lint rule. Two selectors because a className is
    // written two ways: a plain string (or one inside a cn() call, which is still a
    // descendant of the attribute) and a template literal, whose text lives on
    // TemplateElement rather than Literal.
    files: ["src/**/*.tsx"],
    // src/components/ui is a vendored checkout of the shadcn registry, not code we
    // write. It does reach for a literal colour occasionally (`text-white` in the
    // destructive button variant), and re-running `shadcn add` must not turn into a
    // lint fight over the vendor's choices.
    ignores: ["src/components/ui/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: `JSXAttribute[name.name='className'] Literal[value=/${PALETTE_UTILITY}/]`,
          message: PALETTE_MESSAGE,
        },
        {
          selector: `JSXAttribute[name.name='className'] TemplateElement[value.raw=/${PALETTE_UTILITY}/]`,
          message: PALETTE_MESSAGE,
        },
      ],
    },
  },
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
