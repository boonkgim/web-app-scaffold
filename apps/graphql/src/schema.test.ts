import { globSync, readFileSync } from "node:fs";
import { buildSchema } from "graphql";
import { expect, test } from "vitest";

const merged = () =>
  readFileSync("src/schema/schema.generated.graphqls", "utf8");

test("the merged SDL parses and exposes both system fields", () => {
  const query = buildSchema(merged()).getQueryType()?.getFields();
  expect(query?.health).toBeDefined();
  expect(query?.version).toBeDefined();
});

// The gap this closes: codegen scaffolds a resolver file for every root field, and an
// unimplemented stub returns `Promise<void>`. For a non-nullable field that is a type
// error, so `tsc` already catches it — but for a *nullable* field `void` is assignable
// to `T | null | undefined`, so the stub typechecks clean and the field silently
// returns null forever. Nothing in the type system sees it.
//
// The stub body is a fixed template in the preset — `/* Implement X resolver logic
// here */`, emitted from handleGraphQLRootObjectTypeField.js — so scanning for it
// catches every unimplemented resolver regardless of nullability. That template is why
// the preset is pinned to an exact version in package.json rather than a caret range:
// if it ever changed wording this scan would find nothing and pass falsely, so the
// bump has to be a deliberate step that re-checks this assumption.
test("no generated resolver stub has been left unimplemented", () => {
  const unimplemented = globSync("src/schema/**/resolvers/**/*.ts").filter(
    (f) => readFileSync(f, "utf8").includes("resolver logic here"),
  );
  expect(unimplemented).toEqual([]);
});
