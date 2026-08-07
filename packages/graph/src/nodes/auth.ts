import { NodeColorCategory } from "@hermione/graph/engine/types";
import { registerNode } from "@hermione/graph/engine/registry";
import { i18n } from "@i18n";

export function basicAuthHeaderValue(username: string, password: string): string {
  return `Basic ${btoa(`${username}:${password}`)}`;
}

registerNode({
  type: "auth.basic",
  label: i18n.nodes.auth.basic.label,
  description: i18n.nodes.auth.basic.description,
  group: "Request.Auth",
  colorCategory: NodeColorCategory.Integration,
  pins: [
    { id: "username", label: i18n.nodes.auth.basic.pin_username, type: "string", direction: "input", defaultValue: "" },
    { id: "password", label: i18n.nodes.auth.basic.pin_password, type: "string", direction: "input", defaultValue: "" },
    { id: "auth", label: i18n.nodes.__shared.pin_auth, type: "object", direction: "output" },
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
