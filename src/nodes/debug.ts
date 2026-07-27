import { registerNode } from "../engine/registry";

registerNode({
  type: "debug.print",
  label: "Print",
  category: "Debug",
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    { id: "message", label: "Message", type: "string", direction: "input", defaultValue: "" },
    { id: "exec-out", label: "", type: "exec", direction: "output" },
  ],
  execute: ({ inputs, ctx }) => {
    ctx.log(String(inputs.message ?? ""));
    return { nextExec: "exec-out" };
  },
  compileExecute: ({ inputs, compileFrom }) => [
    `rt.log(String(${inputs.message}));`,
    ...compileFrom("exec-out"),
  ],
});
