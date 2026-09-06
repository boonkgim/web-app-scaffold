import { defineDrizzleConfig } from "./drizzle.shared";

// Neon, direct/unpooled endpoint. `pnpm migrate:production`.
// Migrations never run from a Worker — always from your machine, against this file.
export default defineDrizzleConfig(".env.production");
