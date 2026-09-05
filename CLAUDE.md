# cc4-test

pnpm workspace. What is in it:

- `packages/config` — shared tsconfig and ESLint base, extended by every package.
- `packages/mock` — throwaway harness smoke test, not part of the stack. Delete it
  once a real package or app exists.
