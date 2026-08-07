/** Browser-bundle stand-in for facebook-nodejs-business-sdk (see next.config.mjs's
 * turbopack.resolveAlias) — its real crash-reporter module unconditionally requires Node's
 * 'fs'/'path', which don't exist in the browser. FacebookManager only ever actually runs
 * server-side (real node execution happens in the API route, not the browser "simulate" preview —
 * see src/lib/facebookManager.ts), so this only has to satisfy the import, not actually work. */
export class FacebookAdsApi {
  constructor() {
    throw new Error("facebook-nodejs-business-sdk cannot run in the browser — FacebookManager must only be used server-side.");
  }
}
