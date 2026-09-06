import { defineDrizzleConfig } from "./drizzle.shared";

// Local Docker. `pnpm migrate`.
export default defineDrizzleConfig(".env.development");
