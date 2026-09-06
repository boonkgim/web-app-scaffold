import { GraphQLResolveInfo } from "graphql";
import { Env } from "../context";
export type Maybe<T> = T | null | undefined;
export type InputMaybe<T> = T | null | undefined;
export type EnumResolverSignature<T, AllowedValues = any> = {
  [key in keyof T]?: AllowedValues;
};
export type RequireFields<T, K extends keyof T> = Omit<T, K> & {
  [P in K]-?: NonNullable<T[P]>;
};
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string | number };
  String: { input: string; output: string };
  Boolean: { input: boolean; output: boolean };
  Int: { input: number; output: number };
  Float: { input: number; output: number };
};

/**
 * Stripe's three terminal session states, narrowed to an enum so the web layer gets an
 * exhaustive union rather than a string it has to guess the domain of.
 */
export type CheckoutStatus = "COMPLETE" | "EXPIRED" | "OPEN";

export type Mutation = {
  __typename?: "Mutation";
  /**
   * Creates an embedded Stripe Checkout Session for one fixed test item and returns its
   * client secret, which mounts the form in the browser. Exists to prove the payment
   * pipeline in production; not part of any feature.
   */
  createTestCheckoutSession: Scalars["String"]["output"];
  /**
   * Sends the verification template to an address on MAIL_TEST_RECIPIENTS.
   * Exists to prove the mail pipeline in production; not part of any feature.
   */
  sendTestEmail: Scalars["Boolean"]["output"];
};

export type MutationsendTestEmailArgs = {
  to: Scalars["String"]["input"];
};

export type Query = {
  __typename?: "Query";
  appEnv: Scalars["String"]["output"];
  /**
   * The status of a Checkout Session, read back from Stripe by id. The id comes off the
   * return URL, so it is a claim until this field checks it — never a fact the browser
   * is allowed to assert.
   */
  checkoutSessionStatus: CheckoutStatus;
  health: Scalars["String"]["output"];
  /**
   * Stripe events this API has accepted, newest first. The webhook is the only writer, so
   * an empty list means nothing has been delivered — not that nothing has been paid.
   */
  stripeEvents: Array<StripeEvent>;
  version: Scalars["String"]["output"];
  viewer?: Maybe<Viewer>;
};

export type QuerycheckoutSessionStatusArgs = {
  id: Scalars["ID"]["input"];
};

export type QuerystripeEventsArgs = {
  limit?: Scalars["Int"]["input"];
};

export type StripeEvent = {
  __typename?: "StripeEvent";
  id: Scalars["ID"]["output"];
  /**
   * ISO 8601, in UTC. A String rather than a scalar, because this schema has no custom
   * scalars and one added for a single field is a contract to maintain for a timestamp.
   */
  receivedAt: Scalars["String"]["output"];
  type: Scalars["String"]["output"];
};

export type Viewer = {
  __typename?: "Viewer";
  email: Scalars["String"]["output"];
  id: Scalars["ID"]["output"];
};

export type ResolverTypeWrapper<T> = Promise<T> | T;

export type ResolverWithResolve<TResult, TParent, TContext, TArgs> = {
  resolve: ResolverFn<TResult, TParent, TContext, TArgs>;
};
export type Resolver<
  TResult,
  TParent = Record<PropertyKey, never>,
  TContext = Record<PropertyKey, never>,
  TArgs = Record<PropertyKey, never>,
> =
  | ResolverFn<TResult, TParent, TContext, TArgs>
  | ResolverWithResolve<TResult, TParent, TContext, TArgs>;

export type ResolverFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo,
) => Promise<TResult> | TResult;

export type SubscriptionSubscribeFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo,
) => AsyncIterable<TResult> | Promise<AsyncIterable<TResult>>;

export type SubscriptionResolveFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo,
) => TResult | Promise<TResult>;

export interface SubscriptionSubscriberObject<
  TResult,
  TKey extends string,
  TParent,
  TContext,
  TArgs,
> {
  subscribe: SubscriptionSubscribeFn<
    { [key in TKey]: TResult },
    TParent,
    TContext,
    TArgs
  >;
  resolve?: SubscriptionResolveFn<
    TResult,
    { [key in TKey]: TResult },
    TContext,
    TArgs
  >;
}

export interface SubscriptionResolverObject<TResult, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<any, TParent, TContext, TArgs>;
  resolve: SubscriptionResolveFn<TResult, any, TContext, TArgs>;
}

export type SubscriptionObject<
  TResult,
  TKey extends string,
  TParent,
  TContext,
  TArgs,
> =
  | SubscriptionSubscriberObject<TResult, TKey, TParent, TContext, TArgs>
  | SubscriptionResolverObject<TResult, TParent, TContext, TArgs>;

export type SubscriptionResolver<
  TResult,
  TKey extends string,
  TParent = Record<PropertyKey, never>,
  TContext = Record<PropertyKey, never>,
  TArgs = Record<PropertyKey, never>,
> =
  | ((
      ...args: any[]
    ) => SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>)
  | SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>;

export type TypeResolveFn<
  TTypes,
  TParent = Record<PropertyKey, never>,
  TContext = Record<PropertyKey, never>,
> = (
  parent: TParent,
  context: TContext,
  info: GraphQLResolveInfo,
) => Maybe<TTypes> | Promise<Maybe<TTypes>>;

export type IsTypeOfResolverFn<
  T = Record<PropertyKey, never>,
  TContext = Record<PropertyKey, never>,
> = (
  obj: T,
  context: TContext,
  info: GraphQLResolveInfo,
) => boolean | Promise<boolean>;

export type NextResolverFn<T> = () => Promise<T>;

export type DirectiveResolverFn<
  TResult = Record<PropertyKey, never>,
  TParent = Record<PropertyKey, never>,
  TContext = Record<PropertyKey, never>,
  TArgs = Record<PropertyKey, never>,
> = (
  next: NextResolverFn<TResult>,
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo,
) => TResult | Promise<TResult>;

/** Mapping between all available schema types and the resolvers types */
export type ResolversTypes = {
  CheckoutStatus: ResolverTypeWrapper<"OPEN" | "COMPLETE" | "EXPIRED">;
  Mutation: ResolverTypeWrapper<Record<PropertyKey, never>>;
  String: ResolverTypeWrapper<Scalars["String"]["output"]>;
  Boolean: ResolverTypeWrapper<Scalars["Boolean"]["output"]>;
  Query: ResolverTypeWrapper<Record<PropertyKey, never>>;
  ID: ResolverTypeWrapper<Scalars["ID"]["output"]>;
  Int: ResolverTypeWrapper<Scalars["Int"]["output"]>;
  StripeEvent: ResolverTypeWrapper<StripeEvent>;
  Viewer: ResolverTypeWrapper<Viewer>;
};

/** Mapping between all available schema types and the resolvers parents */
export type ResolversParentTypes = {
  Mutation: Record<PropertyKey, never>;
  String: Scalars["String"]["output"];
  Boolean: Scalars["Boolean"]["output"];
  Query: Record<PropertyKey, never>;
  ID: Scalars["ID"]["output"];
  Int: Scalars["Int"]["output"];
  StripeEvent: StripeEvent;
  Viewer: Viewer;
};

export type CheckoutStatusResolvers = EnumResolverSignature<
  { COMPLETE?: any; EXPIRED?: any; OPEN?: any },
  ResolversTypes["CheckoutStatus"]
>;

export type MutationResolvers<
  ContextType = Env,
  ParentType extends ResolversParentTypes["Mutation"] =
    ResolversParentTypes["Mutation"],
> = {
  createTestCheckoutSession?: Resolver<
    ResolversTypes["String"],
    ParentType,
    ContextType
  >;
  sendTestEmail?: Resolver<
    ResolversTypes["Boolean"],
    ParentType,
    ContextType,
    RequireFields<MutationsendTestEmailArgs, "to">
  >;
};

export type QueryResolvers<
  ContextType = Env,
  ParentType extends ResolversParentTypes["Query"] =
    ResolversParentTypes["Query"],
> = {
  appEnv?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  checkoutSessionStatus?: Resolver<
    ResolversTypes["CheckoutStatus"],
    ParentType,
    ContextType,
    RequireFields<QuerycheckoutSessionStatusArgs, "id">
  >;
  health?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  stripeEvents?: Resolver<
    Array<ResolversTypes["StripeEvent"]>,
    ParentType,
    ContextType,
    RequireFields<QuerystripeEventsArgs, "limit">
  >;
  version?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  viewer?: Resolver<Maybe<ResolversTypes["Viewer"]>, ParentType, ContextType>;
};

export type StripeEventResolvers<
  ContextType = Env,
  ParentType extends ResolversParentTypes["StripeEvent"] =
    ResolversParentTypes["StripeEvent"],
> = {
  id?: Resolver<ResolversTypes["ID"], ParentType, ContextType>;
  receivedAt?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  type?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
};

export type ViewerResolvers<
  ContextType = Env,
  ParentType extends ResolversParentTypes["Viewer"] =
    ResolversParentTypes["Viewer"],
> = {
  email?: Resolver<ResolversTypes["String"], ParentType, ContextType>;
  id?: Resolver<ResolversTypes["ID"], ParentType, ContextType>;
};

export type Resolvers<ContextType = Env> = {
  CheckoutStatus?: CheckoutStatusResolvers;
  Mutation?: MutationResolvers<ContextType>;
  Query?: QueryResolvers<ContextType>;
  StripeEvent?: StripeEventResolvers<ContextType>;
  Viewer?: ViewerResolvers<ContextType>;
};
