import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

// The theme is deliberately two files -- values here, the Tailwind mapping in
// app/globals.css -- so they can disagree, and every way they disagree is invisible in
// review: a token with no dark value silently renders its light one, a token misspelled
// under `.dark` silently does nothing at all. This is that seam's contract.
const read = (p: string) => readFileSync(join(import.meta.dirname, p), "utf8");
const theme = read("theme.css");
const globals = read("../app/globals.css");

/** The declarations inside a top-level `<selector> { ... }` block. */
function block(css: string, selector: string): string {
  const found = new RegExp(`${selector}\\s*\\{([^}]*)\\}`).exec(css);
  if (!found) throw new Error(`no \`${selector}\` block found`);
  return found[1];
}

/** Custom-property names declared in a chunk of CSS, without the leading `--`. */
const declared = (css: string) =>
  new Set([...css.matchAll(/--([a-z0-9-]+)\s*:/g)].map((m) => m[1]));

const light = declared(block(theme, ":root"));
const dark = declared(block(theme, "\\.dark"));

// Supplied by next/font in layout.tsx, so the theme is right not to define them.
const EXTERNAL = new Set(["font-sans-src", "font-mono-src"]);
// Not a colour: one corner radius serves both schemes.
const SCHEME_INDEPENDENT = new Set(["radius"]);

test("every token the Tailwind mapping references is defined in the theme", () => {
  const referenced = [
    ...block(globals, "@theme inline").matchAll(/var\(--([a-z0-9-]+)\)/g),
  ].map((m) => m[1]);
  expect(referenced.length).toBeGreaterThan(0);
  expect(referenced.filter((t) => !light.has(t) && !EXTERNAL.has(t))).toEqual(
    [],
  );
});

test("every colour token has a dark value", () => {
  expect(
    [...light].filter((t) => !dark.has(t) && !SCHEME_INDEPENDENT.has(t)),
  ).toEqual([]);
});

test("the dark block overrides nothing the light block never declared", () => {
  expect([...dark].filter((t) => !light.has(t))).toEqual([]);
});
