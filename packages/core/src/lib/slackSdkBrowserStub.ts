/** Browser-bundle stand-in for the official `@slack/web-api` SDK (see next.config.mjs's
 * turbopack.resolveAlias) — it unconditionally pulls in a Node-only transitive dependency that
 * requires 'node:fs', which doesn't exist in the browser. SlackManager only ever actually runs
 * server-side (real node execution happens via api/simulate and api/emulate/run, not the browser
 * "simulate" preview — see src/lib/slackManager.ts), so this only has to satisfy the import, not
 * actually work — mirrors facebookSdkBrowserStub.ts/googleapisBrowserStub.ts/mongoBrowserStub.ts. */
export class WebClient {
  constructor() {
    throw new Error("@slack/web-api cannot run in the browser — SlackManager must only be used server-side.");
  }
}
