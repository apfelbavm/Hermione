/** @type {import('next').NextConfig} */
const nextConfig = {
  // The canvas/interaction/overlay wiring (ported near-verbatim from the old main.ts into a single
  // mount effect — see src/components/AppShell.tsx) is not yet safe against React 18's dev-mode
  // double-invoke of effects (it attaches native event listeners, a ResizeObserver, etc., all
  // non-idempotently). Re-enable once that wiring is broken up into proper per-concern components
  // with cleanup functions (tracked as the overlay -> React component sweep).
  reactStrictMode: false,
};

export default nextConfig;
