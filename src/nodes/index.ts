import "./event";
import "./debug";
import "./flow";
import "./math";
import "./variable";
import "./actionsMock";
import "./function";
import "./string";

let registered = false;

export function registerBuiltins(): void {
  if (registered) return;
  registered = true;
}
