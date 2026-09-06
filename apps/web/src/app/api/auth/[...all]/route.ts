import { apiFetch } from "@/lib/api";

// Catch-all, so every Better Auth endpoint is covered without maintaining a list. The
// logic stays in lib/api.ts where the environment branch already lives and where vitest
// can reach it. The segment name must match authOptions.basePath in apps/graphql — a
// route segment is a directory, so it cannot be built from a value.
export { apiFetch as GET, apiFetch as POST };
