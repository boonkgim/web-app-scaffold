import type { CodegenConfig } from "@graphql-codegen/cli";

// The client half of the types, mirroring apps/graphql's server half. That config turns
// the SDL modules into a resolver map; this one scans the operations *this* app writes
// and types their results.
//
// The pointer is apps/graphql's *published artifact*, not its module sources: the SDL is
// split across src/schema/<module>/schema.graphql, and globbing into those would couple
// this config to another app's internal layout. schema.generated.graphqls is the merged
// contract, at a path that stays put however the modules are reorganised. It is
// committed, so reading it needs no build ordering between the two apps.
const config: CodegenConfig = {
  schema: "../graphql/src/schema/schema.generated.graphqls",
  documents: ["src/**/*.{ts,tsx}", "!src/generated/**"],
  generates: {
    "src/generated/": {
      preset: "client",
      // documentMode 'string' emits each operation as a String subclass carrying its
      // result type as a phantom, instead of a parsed DocumentNode. That is what lets
      // lib/api.ts keep posting the query verbatim -- no print(), and no graphql
      // runtime pulled into the Worker bundle just to send a request.
      // enumsAsTypes mirrors apps/graphql's setting. The two configs are independent, so
      // this is a decision made twice rather than one inherited; setting it on only one
      // side gives a resolver returning "COMPLETE" and a page comparing an enum member.
      config: { documentMode: "string", enumsAsTypes: true },
      // Fragment masking hides fragment fields from the parent unless unmasked at the
      // use site. Useful in a large component tree; here it is ceremony over one query.
      presetConfig: { fragmentMasking: false },
    },
  },
};

export default config;
