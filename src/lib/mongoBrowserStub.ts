/** Browser-bundle stand-in for the official `mongodb` driver (see next.config.mjs's
 * turbopack.resolveAlias) — its entry point unconditionally requires Node built-ins ('net', 'tls',
 * 'timers/promises', 'fs/promises'), none of which exist in the browser. MongoManager only ever
 * actually runs server-side (real node execution happens via api/simulate and api/emulate/run, not
 * the browser "simulate" preview — see src/lib/mongoManager.ts), so this only has to satisfy the
 * import, not actually work — mirrors facebookSdkBrowserStub.ts/googleapisBrowserStub.ts. */
function unavailable(): never {
  throw new Error("mongodb cannot run in the browser — MongoManager must only be used server-side.");
}

export class MongoClient {
  constructor() {
    unavailable();
  }
}

export class ObjectId {
  constructor() {
    unavailable();
  }
  static isValid(): boolean {
    return false;
  }
  toHexString(): string {
    return unavailable();
  }
}
