/* eslint-disable */
/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
import { DocumentTypeDecoration } from '@graphql-typed-document-node/core';
/**
 * Stripe's three terminal session states, narrowed to an enum so the web layer gets an
 * exhaustive union rather than a string it has to guess the domain of.
 */
export type CheckoutStatus =
  | 'COMPLETE'
  | 'EXPIRED'
  | 'OPEN';

export type CreateTestCheckoutSessionMutationVariables = Exact<{ [key: string]: never; }>;


export type CreateTestCheckoutSessionMutation = { createTestCheckoutSession: string };

export type CheckoutStatusQueryVariables = Exact<{
  id: string | number;
}>;


export type CheckoutStatusQuery = { checkoutSessionStatus: CheckoutStatus };

export type HomeQueryVariables = Exact<{ [key: string]: never; }>;


export type HomeQuery = { version: string, health: string, appEnv: string, viewer: { email: string } | null, stripeEvents: Array<{ type: string, receivedAt: string }> };

export class TypedDocumentString<TResult, TVariables>
  extends String
  implements DocumentTypeDecoration<TResult, TVariables>
{
  __apiType?: NonNullable<DocumentTypeDecoration<TResult, TVariables>['__apiType']>;
  private value: string;
  public __meta__?: Record<string, any> | undefined;

  constructor(value: string, __meta__?: Record<string, any> | undefined) {
    super(value);
    this.value = value;
    this.__meta__ = __meta__;
  }

  override toString(): string & DocumentTypeDecoration<TResult, TVariables> {
    return this.value;
  }
}

export const CreateTestCheckoutSessionDocument = new TypedDocumentString(`
    mutation CreateTestCheckoutSession {
  createTestCheckoutSession
}
    `) as unknown as TypedDocumentString<CreateTestCheckoutSessionMutation, CreateTestCheckoutSessionMutationVariables>;
export const CheckoutStatusDocument = new TypedDocumentString(`
    query CheckoutStatus($id: ID!) {
  checkoutSessionStatus(id: $id)
}
    `) as unknown as TypedDocumentString<CheckoutStatusQuery, CheckoutStatusQueryVariables>;
export const HomeDocument = new TypedDocumentString(`
    query Home {
  version
  health
  appEnv
  viewer {
    email
  }
  stripeEvents(limit: 1) {
    type
    receivedAt
  }
}
    `) as unknown as TypedDocumentString<HomeQuery, HomeQueryVariables>;