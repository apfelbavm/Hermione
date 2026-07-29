import { registerNode } from "../engine/registry";

// Every "connection" node that needs to authenticate (HTTP Request today, others later) takes the
// SAME shape of value on its "Auth" input pin: a plain { header, value } object — the exact header
// name/value pair to merge into whatever it sends. This keeps each auth SCHEME (Basic here, an
// OAuth2/SAML bearer-assertion exchange later) in its own small, reusable node instead of being
// duplicated per connection node — wiring the same auth node's output into a second request node
// (or a future non-HTTP connection node) is the entire "reuse" story, no special plumbing needed.
//
// Nothing here assumes the credentials themselves are typed in literally, either: `username`/
// `password` are ordinary wireable string pins, so a later "Key Vault" node (secret looked up by a
// technical name) can feed them just as well. And since the output is a plain object value like
// any other, it can be written into an object-typed Variable via Set Variable once and read back
// via Get Variable into as many request nodes' Auth pins as needed, instead of re-deriving it
// (and re-entering credentials) at every call site.

/** Basic Auth is defined over Latin1 (RFC 7617 permits UTF-8 too, but this keeps parity with the
 * plain `btoa` this uses both here and in the compiled/codegen output below) — fine for the
 * overwhelmingly common case of ASCII usernames/passwords. Exported since oauth2AuthCode.ts's
 * "client_secret_basic" sendAs option needs the exact same client_id:client_secret encoding. */
export function basicAuthHeaderValue(username: string, password: string): string {
  return `Basic ${btoa(`${username}:${password}`)}`;
}

registerNode({
  type: "auth.basic",
  label: "Basic Auth",
  description: "Builds an HTTP Basic Auth header value from a username and password.",
  group: "Auth",
  pins: [
    { id: "username", label: "Username", type: "string", direction: "input", defaultValue: "" },
    { id: "password", label: "Password", type: "string", direction: "input", defaultValue: "" },
    { id: "auth", label: "Auth", type: "object", direction: "output" },
  ],
  evaluate: ({ inputs }) => ({
    auth: {
      header: "Authorization",
      value: basicAuthHeaderValue(String(inputs.username ?? ""), String(inputs.password ?? "")),
    },
  }),
  compileEvaluate: ({ inputs }) => ({
    auth: `{ header: "Authorization", value: "Basic " + btoa(String(${inputs.username}) + ":" + String(${inputs.password})) }`,
  }),
});
