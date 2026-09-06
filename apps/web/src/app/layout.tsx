import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

// The font seam. next/font owns these values -- it self-hosts the file at build time
// and emits the variable onto <html> -- so unlike a colour they cannot live in
// theme.css. Both names are family-neutral on purpose: changing the site's font is
// swapping the two calls here, and nothing downstream says "geist".
const sans = Geist({
  variable: "--font-sans-src",
  subsets: ["latin"],
});

const mono = Geist_Mono({
  variable: "--font-mono-src",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "cc4-test",
  description: "A small store, built in thin slices.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning is required here, not cosmetic: next-themes sets the
    // class on this element from an inline script that runs before hydration, so the
    // server's markup and the client's first read of it legitimately differ. Scoped to
    // <html>, it does not silence mismatches anywhere else.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${sans.variable} ${mono.variable} h-full antialiased`}
    >
      {/* No colours here: `@layer base` in globals.css paints body from the tokens. */}
      <body className="flex min-h-full flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
