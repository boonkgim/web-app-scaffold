"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

// next-themes serialises its pre-hydration function to a string and inlines it, so the
// browser evaluates whatever the *server* bundler emitted. That bundler runs esbuild
// with `keepNames`, which wraps nested declarations as `__name(fn, "fn")` -- a helper
// that exists in the bundle but not in the inline script. The script throws
// `ReferenceError: __name is not defined` before it can set the class, so <html> reaches
// the browser unthemed and the page paints light before React corrects it: the flash
// next-themes exists to prevent. Open upstream bug, no fix in 0.4.6:
// https://github.com/pacocoursey/next-themes/issues/370
//
// Invisible in `next dev`, which never runs the production bundler -- the production
// gate is what found it. A no-op shim is enough: `__name` only tags a function name for
// stack traces, so returning the function unchanged restores the exact behaviour.
// Declared before NextThemesProvider so it is in the document ahead of the script that
// needs it, and `??=` so a real helper, if one ever lands, wins.
const NAME_SHIM = "globalThis.__name??=(f)=>f;";

// The app's first client component. next-themes reads localStorage and sets the class
// on <html>, which is browser work by definition -- and the reason layout.tsx needs
// suppressHydrationWarning. Re-exported rather than used directly so the "use client"
// boundary is one file we own, not a vendored module's default.
export function ThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemesProvider>) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: NAME_SHIM }} />
      <NextThemesProvider {...props}>{children}</NextThemesProvider>
    </>
  );
}
