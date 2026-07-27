import { registerNode } from "../engine/registry";

registerNode({
  type: "event.start",
  label: "On Start",
  category: "Events",
  pins: [{ id: "exec-out", label: "", type: "exec", direction: "output" }],
  execute: () => ({ nextExec: "exec-out" }),
});
