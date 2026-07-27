import { registerNode } from "../engine/registry";
import { DELAY_HELPER_SOURCE, indent } from "../engine/compileUtils";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

registerNode({
  type: "flow.delay",
  label: "Delay",
  category: "Flow Control",
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    { id: "duration", label: "Duration (ms)", type: "number", direction: "input", defaultValue: 500 },
    { id: "exec-out", label: "", type: "exec", direction: "output" },
  ],
  execute: async ({ inputs }) => {
    await wait(Number(inputs.duration ?? 0));
    return { nextExec: "exec-out" };
  },
  compileHelpers: { delay: DELAY_HELPER_SOURCE },
  compileExecute: ({ inputs, compileFrom }) => [
    `await delay(Number(${inputs.duration}));`,
    ...compileFrom("exec-out"),
  ],
});

registerNode({
  type: "flow.branch",
  label: "Branch",
  category: "Flow Control",
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    { id: "condition", label: "Condition", type: "boolean", direction: "input", defaultValue: false },
    { id: "true", label: "True", type: "exec", direction: "output" },
    { id: "false", label: "False", type: "exec", direction: "output" },
  ],
  execute: ({ inputs }) => ({ nextExec: inputs.condition ? "true" : "false" }),
  compileExecute: ({ inputs, compileFrom }) => [
    `if (${inputs.condition}) {`,
    ...indent(compileFrom("true")),
    `} else {`,
    ...indent(compileFrom("false")),
    `}`,
  ],
});
