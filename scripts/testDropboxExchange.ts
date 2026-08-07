import { DropboxManager } from "@hermione/core/lib/dropboxManager";

/** Wraps the real fetch to print the exact outgoing request (secret/code redacted to a length +
 * first/last few chars, not fully hidden, so truncation/whitespace/extra-character corruption is
 * still visible) and the raw response body, before handing off to the real network call. This is
 * the only way to see what actually left the machine vs. what was typed/pasted on the command line. */
function redact(value: string): string {
  if (value.length <= 8) return `<len=${value.length}>`;
  return `${value.slice(0, 4)}...${value.slice(-4)} <len=${value.length}>`;
}

function installFetchLogger(): void {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const loggedParams = new URLSearchParams(url.search);
    for (const key of ["code", "client_secret", "refresh_token"]) {
      if (loggedParams.has(key)) loggedParams.set(key, redact(loggedParams.get(key)!));
    }
    console.error(`--> ${init?.method ?? "GET"} ${url.origin}${url.pathname}?${loggedParams.toString()}`);

    const res = await realFetch(input, init);
    const cloned = res.clone();
    const bodyText = await cloned.text();
    console.error(`<-- ${res.status} ${bodyText}`);
    return res;
  }) as typeof fetch;
}

function main(): void {
  const [appKey, appSecret, authCode] = process.argv.slice(2);
  if (!appKey || !appSecret || !authCode) {
    console.error("Usage: npx tsx scripts/testDropboxExchange.ts <appKey> <appSecret> <authCode>");
    process.exit(1);
  }
  console.error(`appKey=${redact(appKey)} appSecret=${redact(appSecret)} authCode=${redact(authCode)}`);

  installFetchLogger();

  DropboxManager.exchangeAuthCode(authCode, appKey, appSecret)
    .then((result) => {
      console.log(JSON.stringify({ ...result, accessToken: result.accessToken ? "<redacted>" : "", refreshToken: result.refreshToken ? "<redacted>" : "" }, null, 2));
    })
    .catch((err) => {
      console.error("Unexpected throw (should never happen — exchangeAuthCode always resolves):", err);
      process.exit(1);
    });
}

main();
