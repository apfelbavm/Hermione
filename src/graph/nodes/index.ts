import "./event";
import "./debug";
import "./flow";
import "./math";
import "./date";
import "./boolean";
import "./variable";
import "./function";
import "./string";
import "./http";
import "./odata";
import "./sftp";
import "./auth";
import "./oauth2Saml";
import "./oauth2ClientCredentials";
import "./dropbox";
import "./facebook";
import "./azureStorage";
import "./struct";
import "./github";
import "./microsoft365";
import "./array";
import "./set";
import "./map";
import "./reroute";
import "./xml";
import "./csv";
import "./code";
import "./crypto";

let registered = false;

export function registerBuiltins(): void {
  if (registered) return;
  registered = true;
}
