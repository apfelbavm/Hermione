import "./event";
import "./debug";
import "./flow";
import "./math";
import "./variable";
import "./actionsMock";
import "./function";
import "./string";
import "./http";
import "./auth";
import "./array";
import "./set";
import "./map";
import "./reroute";

let registered = false;

export function registerBuiltins(): void {
  if (registered) return;
  registered = true;
}
