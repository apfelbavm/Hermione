import "./event";
import "./debug";
import "./flow";
import "./math";
import "./date";
import "./variable";
import "./actionsMock";
import "./function";
import "./string";
import "./http";
import "./auth";
import "./oauth2Saml";
import "./oauth2ClientCredentials";
import "./array";
import "./set";
import "./map";
import "./reroute";
import "./xml";
import "./csv";
import "./code";

let registered = false;

export function registerBuiltins(): void {
  if (registered) return;
  registered = true;
}
