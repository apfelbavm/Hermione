/** Browser-bundle stand-in for the googleapis SDK (see next.config.mjs's turbopack.resolveAlias)
 * — its real entry point unconditionally requires Node built-ins ('fs', 'net', 'tls', 'http2',
 * 'child_process') across google-auth-library/gaxios/node-fetch, none of which exist in the
 * browser. Every Google*Manager only ever actually runs server-side (see lib/google*Manager.ts),
 * so this only has to satisfy the import, not actually work — mirrors facebookSdkBrowserStub.ts. */
function unavailable(): never {
  throw new Error("googleapis cannot run in the browser — Google*Manager classes must only be used server-side.");
}

export const google = {
  auth: {
    JWT: class {
      constructor() {
        unavailable();
      }
    },
    OAuth2: class {
      constructor() {
        unavailable();
      }
    },
  },
  drive: unavailable,
  sheets: unavailable,
  docs: unavailable,
  gmail: unavailable,
  calendar: unavailable,
  admin: unavailable,
};
