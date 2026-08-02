/** facebook-nodejs-business-sdk ships no type declarations — this covers only the one surface
 * FacebookManager (src/lib/facebookManager.ts) actually uses: the low-level FacebookAdsApi.call(),
 * the same primitive the SDK's own hundreds of generated object classes (Page, AdAccount, ...) call
 * internally, so a full type surface for those isn't needed. */
declare module "facebook-nodejs-business-sdk" {
  export class FacebookAdsApi {
    constructor(accessToken: string, locale?: string, crashLog?: boolean);
    static init(accessToken: string, locale?: string, crashLog?: boolean): FacebookAdsApi;
    static get VERSION(): string;
    call(method: string, path: string[] | string, params?: Record<string, unknown>, files?: Record<string, unknown>, useMultipartFormData?: boolean): Promise<Record<string, unknown>>;
  }
}
