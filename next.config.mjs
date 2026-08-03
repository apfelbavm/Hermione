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
  async redirects() {
    return [{ source: "/", destination: "/projects", permanent: false }];
  },
  turbopack: {
    resolveAlias: {
      // src/graph/nodes/index.ts (which registers every node type, including facebook.ts) is
      // reachable from client components for the node menu/labels, even though the actual API
      // calls only ever run server-side. Unlike this project's other integration SDKs (all
      // fetch-based), facebook-nodejs-business-sdk's crash reporter unconditionally requires
      // Node's 'fs'/'path' for on-disk crash logs, which don't exist in the browser — swap it for
      // a stub in browser bundles instead of failing to resolve them.
      "facebook-nodejs-business-sdk": {
        browser: "./src/lib/facebookSdkBrowserStub.ts",
      },
      // googleapis's entry point unconditionally requires Node built-ins ('fs', 'net', 'tls',
      // 'http2', 'child_process') across google-auth-library/gaxios/node-fetch — same problem as
      // facebook-nodejs-business-sdk above, same fix.
      googleapis: {
        browser: "./src/lib/googleapisBrowserStub.ts",
      },
      // The official mongodb driver's entry point unconditionally requires Node built-ins ('net',
      // 'tls', 'timers/promises', 'fs/promises') for its TCP wire protocol — same problem as
      // facebook-nodejs-business-sdk/googleapis above, same fix.
      mongodb: {
        browser: "./src/lib/mongoBrowserStub.ts",
      },
    },
  },
};

export default nextConfig;
