import type { Metadata } from "next";
import "../style.css";
import { SessionProvider } from "next-auth/react";
import { THEME_BOOTSTRAP_SCRIPT } from "@hermione/shared/theme";
import { SIDEBAR_BOOTSTRAP_SCRIPT } from "../client/sidebar";
import { TAB_FETCH_BOOTSTRAP_SCRIPT } from "../client/tabFetchPatch";
import { AuthGate } from "../components/AuthGate";

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
        {/* Same reasoning as the theme bootstrap script above, for the plain-page Sidebar's
            collapse state (see client/sidebar.ts) — avoids a layout-shift flash from expanded to
            collapsed width while React hydrates. */}
        <script dangerouslySetInnerHTML={{ __html: SIDEBAR_BOOTSTRAP_SCRIPT }} />
        {/* Patches window.fetch to attach the "per tab" session token (see client/tabFetchPatch.ts)
            before Next.js's own router/data-fetching code runs any fetches of its own. */}
        <script dangerouslySetInnerHTML={{ __html: TAB_FETCH_BOOTSTRAP_SCRIPT }} />
        <SessionProvider>
          <AuthGate>{children}</AuthGate>
        </SessionProvider>
      </body>
    </html>
  );
}
