/** @type {import('next').NextConfig} */
const nextConfig = {
  // The canvas/interaction/overlay wiring (ported near-verbatim from the old main.ts into a single
  // mount effect — see src/components/AppShell.tsx) is not yet safe against React 18's dev-mode
  // double-invoke of effects (it attaches native event listeners, a ResizeObserver, etc., all
  // non-idempotently). Re-enable once that wiring is broken up into proper per-concern components
  // with cleanup functions (tracked as the overlay -> React component sweep).
  reactStrictMode: false,
  // better-sqlite3 (see src/server/db.ts) ships a native binary — let Node `require` it directly at
  // runtime instead of Next trying to bundle it into the server build.
  serverExternalPackages: ["better-sqlite3"],
  // There's no standalone Home page anymore (see components/Sidebar.tsx for its replacement, the
  // persistent nav rail on every plain page) — "/" just lands on Projects instead of 404ing.
  async redirects() {
    return [{ source: "/", destination: "/projects", permanent: false }];
  },
};

export default nextConfig;
