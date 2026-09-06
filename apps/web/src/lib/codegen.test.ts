import { readFileSync } from "node:fs";
import { generate } from "@graphql-codegen/cli";
import { expect, test } from "vitest";
import config from "../../codegen";

// The same guard apps/graphql keeps over its schema outputs, for the same reason: the
// generated files are committed, so nothing else would notice a query edited without a
// re-run. Reuses the real codegen.ts rather than restating it, and `generate(config,
// false)` returns the output in memory so the test never writes to the tree.
test("every committed codegen output is up to date", async () => {
  const outputs = await generate({ ...config, silent: true }, false);
  expect(outputs.length).toBeGreaterThan(0);
  for (const out of outputs) {
    expect(readFileSync(out.filename, "utf8"), out.filename).toBe(out.content);
  }
});
