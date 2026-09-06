import type { DocumentNode } from "graphql";
export const typeDefs = {
  kind: "Document",
  definitions: [
    {
      name: { kind: "Name", value: "Query" },
      kind: "ObjectTypeDefinition",
      fields: [
        {
          kind: "FieldDefinition",
          name: { kind: "Name", value: "viewer" },
          type: { kind: "NamedType", name: { kind: "Name", value: "Viewer" } },
        },
        {
          kind: "FieldDefinition",
          description: {
            kind: "StringValue",
            value:
              "The status of a Checkout Session, read back from Stripe by id. The id comes off the\nreturn URL, so it is a claim until this field checks it — never a fact the browser\nis allowed to assert.",
            block: true,
          },
          name: { kind: "Name", value: "checkoutSessionStatus" },
          arguments: [
            {
              kind: "InputValueDefinition",
              name: { kind: "Name", value: "id" },
              type: {
                kind: "NonNullType",
                type: {
                  kind: "NamedType",
                  name: { kind: "Name", value: "ID" },
                },
              },
            },
          ],
          type: {
            kind: "NonNullType",
            type: {
              kind: "NamedType",
              name: { kind: "Name", value: "CheckoutStatus" },
            },
          },
        },
        {
          kind: "FieldDefinition",
          description: {
            kind: "StringValue",
            value:
              "Stripe events this API has accepted, newest first. The webhook is the only writer, so\nan empty list means nothing has been delivered — not that nothing has been paid.",
            block: true,
          },
          name: { kind: "Name", value: "stripeEvents" },
          arguments: [
            {
              kind: "InputValueDefinition",
              name: { kind: "Name", value: "limit" },
              type: {
                kind: "NonNullType",
                type: {
                  kind: "NamedType",
                  name: { kind: "Name", value: "Int" },
                },
              },
              defaultValue: { kind: "IntValue", value: "5" },
            },
          ],
          type: {
            kind: "NonNullType",
            type: {
              kind: "ListType",
              type: {
                kind: "NonNullType",
                type: {
                  kind: "NamedType",
                  name: { kind: "Name", value: "StripeEvent" },
                },
              },
            },
          },
        },
        {
          kind: "FieldDefinition",
          name: { kind: "Name", value: "version" },
          type: {
            kind: "NonNullType",
            type: {
              kind: "NamedType",
              name: { kind: "Name", value: "String" },
            },
          },
        },
        {
          kind: "FieldDefinition",
          name: { kind: "Name", value: "health" },
          type: {
            kind: "NonNullType",
            type: {
              kind: "NamedType",
              name: { kind: "Name", value: "String" },
            },
          },
        },
        {
          kind: "FieldDefinition",
          name: { kind: "Name", value: "appEnv" },
          type: {
            kind: "NonNullType",
            type: {
              kind: "NamedType",
              name: { kind: "Name", value: "String" },
            },
          },
        },
      ],
      directives: [],
      interfaces: [],
    },
    {
      kind: "ObjectTypeDefinition",
      name: { kind: "Name", value: "Viewer" },
      fields: [
        {
          kind: "FieldDefinition",
          name: { kind: "Name", value: "id" },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "FieldDefinition",
          name: { kind: "Name", value: "email" },
          type: {
            kind: "NonNullType",
            type: {
              kind: "NamedType",
              name: { kind: "Name", value: "String" },
            },
          },
        },
      ],
    },
    {
      name: { kind: "Name", value: "Mutation" },
      kind: "ObjectTypeDefinition",
      fields: [
        {
          kind: "FieldDefinition",
          description: {
            kind: "StringValue",
            value:
              "Sends the verification template to an address on MAIL_TEST_RECIPIENTS.\nExists to prove the mail pipeline in production; not part of any feature.",
            block: true,
          },
          name: { kind: "Name", value: "sendTestEmail" },
          arguments: [
            {
              kind: "InputValueDefinition",
              name: { kind: "Name", value: "to" },
              type: {
                kind: "NonNullType",
                type: {
                  kind: "NamedType",
                  name: { kind: "Name", value: "String" },
                },
              },
            },
          ],
          type: {
            kind: "NonNullType",
            type: {
              kind: "NamedType",
              name: { kind: "Name", value: "Boolean" },
            },
          },
        },
        {
          kind: "FieldDefinition",
          description: {
            kind: "StringValue",
            value:
              "Creates an embedded Stripe Checkout Session for one fixed test item and returns its\nclient secret, which mounts the form in the browser. Exists to prove the payment\npipeline in production; not part of any feature.",
            block: true,
          },
          name: { kind: "Name", value: "createTestCheckoutSession" },
          type: {
            kind: "NonNullType",
            type: {
              kind: "NamedType",
              name: { kind: "Name", value: "String" },
            },
          },
        },
      ],
      directives: [],
      interfaces: [],
    },
    {
      kind: "EnumTypeDefinition",
      description: {
        kind: "StringValue",
        value:
          "Stripe's three terminal session states, narrowed to an enum so the web layer gets an\nexhaustive union rather than a string it has to guess the domain of.",
        block: true,
      },
      name: { kind: "Name", value: "CheckoutStatus" },
      values: [
        { kind: "EnumValueDefinition", name: { kind: "Name", value: "OPEN" } },
        {
          kind: "EnumValueDefinition",
          name: { kind: "Name", value: "COMPLETE" },
        },
        {
          kind: "EnumValueDefinition",
          name: { kind: "Name", value: "EXPIRED" },
        },
      ],
    },
    {
      kind: "ObjectTypeDefinition",
      name: { kind: "Name", value: "StripeEvent" },
      fields: [
        {
          kind: "FieldDefinition",
          name: { kind: "Name", value: "id" },
          type: {
            kind: "NonNullType",
            type: { kind: "NamedType", name: { kind: "Name", value: "ID" } },
          },
        },
        {
          kind: "FieldDefinition",
          name: { kind: "Name", value: "type" },
          type: {
            kind: "NonNullType",
            type: {
              kind: "NamedType",
              name: { kind: "Name", value: "String" },
            },
          },
        },
        {
          kind: "FieldDefinition",
          description: {
            kind: "StringValue",
            value:
              "ISO 8601, in UTC. A String rather than a scalar, because this schema has no custom\nscalars and one added for a single field is a contract to maintain for a timestamp.",
            block: true,
          },
          name: { kind: "Name", value: "receivedAt" },
          type: {
            kind: "NonNullType",
            type: {
              kind: "NamedType",
              name: { kind: "Name", value: "String" },
            },
          },
        },
      ],
    },
    {
      kind: "SchemaDefinition",
      operationTypes: [
        {
          kind: "OperationTypeDefinition",
          type: { kind: "NamedType", name: { kind: "Name", value: "Query" } },
          operation: "query",
        },
        {
          kind: "OperationTypeDefinition",
          type: {
            kind: "NamedType",
            name: { kind: "Name", value: "Mutation" },
          },
          operation: "mutation",
        },
      ],
    },
  ],
} as unknown as DocumentNode;
