import { NodeColorCategory } from "../engine/types";
import { registerNode } from "../engine/registry";
import { i18n } from "@i18n";

registerNode({
  type: "boolean.not",
  label: i18n.nodes.boolean.not.label,
  description: i18n.nodes.boolean.not.description,
  group: "Boolean",
  colorCategory: NodeColorCategory.Boolean,
  pins: [
    {
      id: "value",
      label: i18n.nodes.__shared.pin_value,
      type: "boolean",
      direction: "input",
      defaultValue: false,
    },
    {
      id: "result",
      label: i18n.nodes.__shared.pin_result,
      type: "boolean",
      direction: "output",
    },
  ],
  evaluate: ({ inputs }) => ({ result: !inputs.value }),
  compileEvaluate: ({ inputs }) => ({
    result: `!(${inputs.value})`,
  }),
});
