import { registerNode } from "../engine/registry";
import { NodeColorCategory } from "../engine/types";
import type { LogFormat } from "../engine/types";
import { FUNCTION_LIBRARY_IMPORT } from "../engine/compileUtils";
import { enumOptionIds } from "../engine/enumRegistry";
import { DEBUG_LOG_FORMAT_ENUM_TYPE } from "../enum/debug";
import { formatForLog } from "../../server/functionLibrary";
import { i18n } from "@i18n";

registerNode({
  type: "debug.print",
  label: i18n.nodes.debug.print.label,
  description: i18n.nodes.debug.print.description,
  group: "Debug",
  colorCategory: NodeColorCategory.Debug,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    { id: "message", label: i18n.nodes.debug.print.pin_message, type: "string", direction: "input", defaultValue: "" },
    { id: "exec-out", label: "", type: "exec", direction: "output" },
  ],
  execute: ({ inputs, ctx }) => {
    ctx.log(String(inputs.message ?? ""));
    return { nextExec: "exec-out" };
  },
  compileExecute: ({ inputs, compileFrom }) => [`this.log(String(${inputs.message}));`, ...compileFrom("exec-out")],
});

const FORMATS = enumOptionIds(DEBUG_LOG_FORMAT_ENUM_TYPE);

registerNode({
  type: "debug.printFormatted",
  label: i18n.nodes.debug.printFormatted.label,
  description: i18n.nodes.debug.printFormatted.description,
  group: "Debug",
  colorCategory: NodeColorCategory.Debug,
  pins: [
    { id: "exec-in", label: "", type: "exec", direction: "input" },
    { id: "message", label: i18n.nodes.debug.printFormatted.pin_message, type: "string", direction: "input", defaultValue: "" },
    { id: "format", label: i18n.nodes.debug.printFormatted.pin_format, type: "enum", subType: DEBUG_LOG_FORMAT_ENUM_TYPE, direction: "input", defaultValue: FORMATS[0], options: FORMATS },
    { id: "exec-out", label: "", type: "exec", direction: "output" },
  ],
  execute: ({ inputs, ctx }) => {
    const format = String(inputs.format ?? FORMATS[0]) as LogFormat;
    ctx.log(formatForLog(String(inputs.message ?? ""), format), format);
    return { nextExec: "exec-out" };
  },
  compileExecute: ({ inputs, compileFrom }) => [`this.log(functionLibrary.formatForLog(String(${inputs.message}), String(${inputs.format})));`, ...compileFrom("exec-out")],
  compileImports: [FUNCTION_LIBRARY_IMPORT],
});
