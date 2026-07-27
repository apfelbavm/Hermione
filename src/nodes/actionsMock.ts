import { registerNode } from "../engine/registry";
import { DELAY_HELPER_SOURCE } from "../engine/compileUtils";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

registerNode({
  type: "action.sendEmailMock",
  label: "Send Email (mock)",
  category: "Actions",
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    { id: "to", label: "To", type: "string", direction: "input", defaultValue: "" },
    { id: "subject", label: "Subject", type: "string", direction: "input", defaultValue: "" },
    { id: "body", label: "Body", type: "string", direction: "input", defaultValue: "" },
    { id: "exec-out", label: "", type: "exec", direction: "output" },
  ],
  execute: async ({ inputs, ctx }) => {
    await wait(400); // stands in for a real network call to an email API
    ctx.log(`📧 Sent to ${inputs.to}: "${inputs.subject}"`);
    return { nextExec: "exec-out" };
  },
  compileHelpers: { delay: DELAY_HELPER_SOURCE },
  compileExecute: ({ inputs, compileFrom }) => [
    `await delay(400);`,
    `rt.log(\`📧 Sent to \${${inputs.to}}: "\${${inputs.subject}}"\`);`,
    ...compileFrom("exec-out"),
  ],
});
