import type { Metadata } from "next";
import "../style.css";
import { THEME_BOOTSTRAP_SCRIPT } from "../client/theme";

export const metadata: Metadata = {
  title: "Hermione",
  icons: { icon: "/favicon.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: the bootstrap script below sets data-theme on this element before
    // React ever hydrates, which would otherwise be flagged as a server/client mismatch — same
    // reasoning ThemeToggle's own "mounted" guard exists for.
    <html lang="en" suppressHydrationWarning>
      <body>
        {/* Runs synchronously, before anything else paints — picks light/dark from localStorage
            (see client/theme.ts) or, on a first-ever visit, the OS/browser's own prefers-color-scheme,
            so there's no flash of the wrong theme while React hydrates. Deliberately a literal inline
            script (not a module import) since it must run standalone before any bundle loads. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
        {children}
      </body>
    </html>
  );
}
