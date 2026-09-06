import type { QueryResolvers } from "./../../../types.generated";

// The resolver the unit project drives. Stays free of any I/O even after a database
// arrives, so that suite never needs Docker or a stub connection string.
export const version: NonNullable<QueryResolvers["version"]> = () => "1";
