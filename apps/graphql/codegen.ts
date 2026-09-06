import type { CodegenConfig } from "@graphql-codegen/cli";

// The Server Preset, not the bare typescript-resolvers plugin. The difference is what
// closes the drift gap: typescript-resolvers only emits a `Resolvers` *type*, whose
// fields are all optional, so adding a field to the SDL and forgetting to write its
// resolver still compiles. The preset instead generates a resolver *file* per root
// field and wires every one of them into `resolvers.generated.ts`, so a field can
// never be silently unresolved. It also re-attaches each file's type annotation on
// every run via ts-morph, which is what stops a hand-edited resolver from drifting
// away from the signature the SDL implies.
//
// `resolverGeneration: "minimal"` limits that to root fields. Object fields like
// `Item.title` are left to GraphQL's default resolvers, which is correct — generating
// a file per field of every type would be noise, not safety.
const config: CodegenConfig = {
  schema: "src/schema/**/*.graphql",
  generates: {
    "src/schema": {
      preset: "@eddeee888/gcg-typescript-resolver-files",
      presetConfig: {
        resolverGeneration: "minimal",
        // Resolvers receive the Worker's bindings as context. Without this every
        // generated signature types its third parameter as `any`. Note the nesting:
        // options for the underlying typescript-resolvers plugin go here, not in the
        // output's own `config` — put them there and they are silently ignored.
        typesPluginsConfig: {
          contextType: "../context#Env",
          // Enums as string-literal unions, not TS enums. A TS enum is a value, so
          // every `=== CheckoutStatus.Complete` needs an import of a generated module;
          // the union form compares against "COMPLETE" and erases at build.
          enumsAsTypes: true,
        },
      },
    },
  },
};

export default config;
