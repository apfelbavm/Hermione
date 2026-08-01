import { allNodeDefs, topLevelGroup } from "../graph/engine/registry";
import type { NodeDef } from "../graph/engine/types";
import { allEnumTypeDefs } from "../graph/engine/enumRegistry";
import { allStructTypeDefs } from "../graph/engine/structRegistry";
import { registerBuiltins } from "../graph/nodes";

/** Why a node's pins aren't documented pin-by-pin like an ordinary node, keyed to which
 * NodeInstance field(s) actually drive its shape — see nodeInstance.ts for all of these fields. */
function dynamicPinsNote(def: NodeDef): string | undefined {
  if (def.derivePins || def.deriveFunctionPins || def.deriveScriptPins) {
    return "_This node's pins depend on a bound `variableId`/`functionId`/`scriptId` (see \"Node object shape\" below) pointing at a Variable/FunctionDef/CodeScriptDef that only exists inside a specific project — skip this node type unless the user's request explicitly names one that exists in their project._";
  }
  if (def.editableOutputs || def.editableInputs) {
    return '_This node\'s pins are a user-mapped signature (`outputEntries`/`inputEntries`) bound to a deployed Flow via `targetProjectId`/`targetFlowId` (see "Node object shape" below) — skip this node type unless the user gives you a real target Flow to bind it to._';
  }
  if (def.configurableSubType?.kind === "struct") {
    return '_This node\'s pins are the fields of whichever struct type its `subType` field names (see "Node object shape" below and the struct type reference at the end of this document) — pick a `subType` id from that reference rather than guessing._';
  }
  if (def.configurableElementType) {
    const key = def.configurableElementType.includeKeyType ? " and `mapKeyType`" : "";
    return `_This node's pins all share one element type, chosen via its \`elementType\`${key} field (default \`"number"\`${def.configurableElementType.includeKeyType ? ' / `"string"` for the key' : ""} if omitted — see "Node object shape" below). The table below shows its pins for the default element type._`;
  }
  if (def.deriveInstancePins) {
    return "_This is a visual-only pass-through node (e.g. a reroute knot) — skip it entirely and wire directly between the real nodes instead; the graph behaves identically without it._";
  }
  return undefined;
}

function describeNode(def: NodeDef): string {
  const lines: string[] = [`#### \`${def.type}\` — ${def.label}`, def.description];
  if (def.eventTrigger) lines.push(`_Graph entry point (event trigger kind: "${def.eventTrigger.kind}"). Every graph needs at least one of these to run._`);

  const dynamicNote = dynamicPinsNote(def);
  if (dynamicNote) lines.push(dynamicNote);
  // configurableElementType nodes still get a real pin table (for their default element type) since
  // it's a concrete, valid example — every other dynamic-pins case varies too much (or depends on
  // project-specific ids) to usefully tabulate.
  if ((!dynamicNote || def.configurableElementType) && def.pins.length > 0) {
    lines.push("", "| pin | direction | type | notes |", "| --- | --- | --- | --- |");
    for (const pin of def.pins) {
      const notes: string[] = [];
      if (pin.container && pin.container !== "single") notes.push(`container=${pin.container}`);
      if (pin.container === "map" && pin.keyType) notes.push(`keyType=${pin.keyType}`);
      if (pin.options) notes.push(`options=[${pin.options.join(", ")}]`);
      if ((pin.type === "enum" || pin.type === "struct") && pin.subType) notes.push(`subType=${pin.subType}`);
      if (pin.type !== "exec" && pin.direction === "input") notes.push(`default=${JSON.stringify(pin.defaultValue)}`);
      lines.push(`| \`${pin.id}\` | ${pin.direction} | ${pin.type} | ${notes.join("; ") || "—"} |`);
    }
  }
  return lines.join("\n");
}

const INTRO = `# Hermione graph generation reference

This document is everything an AI needs to generate a Hermione visual-scripting graph that a user
can paste directly into the graph editor (Ctrl+V on the canvas).

## Output format

Produce a single JSON object with this exact shape and nothing else (no markdown fences, no
commentary before/after it — the user copies it verbatim):

\`\`\`json
{
  "source": "hermione-graph-editor",
  "kind": "nodes",
  "version": 1,
  "nodes": [ /* NodeInstance objects, see below */ ],
  "connections": [ /* Connection objects, see below */ ]
}
\`\`\`

Pasting only works if \`source\`, \`kind\`, and \`version\` are exactly as shown above — the editor
rejects anything else as not-ours.

## Node object shape

\`\`\`json
{
  "id": "node-1",
  "type": "math.add",
  "position": { "x": 100, "y": 100 },
  "pins": {
    "a": { "value": 2 },
    "b": { "connectionId": "conn-1" },
    "result": {}
  },
  "disabled": false,
  "breakpoint": false
}
\`\`\`

- \`id\`: any string unique **within this payload** (ids are rewritten on paste, so they never need
  to be globally unique — they only need to be internally consistent so \`connections\` can
  reference them).
- \`type\`: one of the node type strings documented below (e.g. \`"math.add"\`).
- \`position\`: canvas coordinates in pixels. Space nodes out left-to-right along their exec/data
  flow (roughly 260-320px apart horizontally, 120-160px apart vertically for parallel branches) so
  the pasted graph doesn't land as a pile of overlapping boxes.
- \`pins\`: one entry per pin **id** declared on that node type (see the per-node pin tables below).
  - An **input** pin holding a literal value: \`{ "value": <the value> }\`.
  - A pin that is wired to/from a connection (either direction): \`{ "connectionId": "<connection id>" }\`
    — only needed on the pin that's the *target* side isn't strictly required by the parser, but
    setting it on both ends matches what the editor itself produces, so do it on both.
  - An **output** pin, or an input left at its default: \`{}\`.
  - Every pin id the node type declares should have an entry, even if it's just \`{}\`.
- \`disabled\` / \`breakpoint\`: optional, default \`false\` — omit unless the user specifically asks
  for a disabled node or a breakpoint.

A handful of node types need extra top-level fields beyond the shape above, because their pins
depend on something that can't be expressed as a pin value. Only set the field(s) that node type
actually calls for (each is called out on the node's own entry in the reference below):

- \`variableId\`: binds a \`variable.get\`/\`variable.set\` node to a Variable. Project-specific — you
  can't know a real variable's id, so only use these node types if the user's request names an
  existing variable and gives you (or lets you infer) its id.
- \`functionId\`: binds a \`function.call\`/\`function.entry\`/\`function.return\` node to a FunctionDef.
  Same caveat as \`variableId\` — project-specific.
- \`scriptId\`: binds a \`code.run\` node to a CodeScriptDef. Same caveat — project-specific.
- \`targetProjectId\` / \`targetFlowId\`: binds a \`flow.executeFlow\` node to another **deployed** Flow.
  Project-specific — skip this node type unless the user gives you a real target.
- \`outputEntries\` / \`inputEntries\`: the user-mapped output/input signature for a \`flow.executeFlow\`/
  \`flow.return\` node, each an array of \`{ "id", "name", "type", "container"?, "keyType"?, "subType"?,
  "defaultValue" }\` entries — only meaningful alongside a real \`targetFlowId\`.
- \`elementType\` (and \`mapKeyType\` where applicable): the single element type (and map key type) a
  generic collection node (e.g. \`array.length\`, \`set.add\`, \`map.get\`) operates on — one of the
  ordinary data types (\`"number"\`/\`"boolean"\`/\`"string"\`/\`"object"\`/\`"date"\`/\`"enum"\`/\`"struct"\`).
  Defaults to \`"number"\` (map keys default to \`"string"\`) if omitted.
- \`subType\`: which registered struct type a \`struct.make\`/\`struct.break\` node operates on — an id
  from the struct type reference at the end of this document.
- \`description\`: an optional free-text note shown on the canvas above this one node instance —
  cosmetic only, never required.

## Connection object shape

\`\`\`json
{ "id": "conn-1", "fromNode": "node-1", "fromPin": "exec-out", "toNode": "node-2", "toPin": "exec-in" }
\`\`\`

- \`id\`: any string unique within the payload.
- \`fromNode\`/\`toNode\`: node ids from the \`nodes\` array above.
- \`fromPin\`/\`toPin\`: pin ids on those respective nodes. \`fromPin\` must be an **output** pin
  (or an exec-out), \`toPin\` must be an **input** pin (or an exec-in).

## Wiring rules (a connection is only valid if all of these hold)

1. **Exec pins only connect to exec pins**, and only one wire may run out of a given exec-out pin
   (an exec-in pin CAN receive from only one exec-out at a time too, in practice: don't wire two
   different exec-out pins into the same exec-in).
2. **Data pins must match exactly**: same \`type\` (\`number\`/\`boolean\`/\`string\`/\`object\`/\`date\`/\`struct\`)
   and same container (\`single\` is the default when a pin has no \`container\`; \`array\`/\`set\`/\`map\`
   never silently connect to a different container or to \`single\`). For a \`map\` pin, \`keyType\` must
   also match. For a \`struct\` pin, \`subType\` (which registered struct class it is, shown in the pin
   table's notes column) must also match.
3. **\`enum\` pins are never wireable**, in either direction — they're config-only (rendered as a
   dropdown), never plug into anything, including another enum pin.
4. Every graph needs at least one **event/entry node** (an node with an \`eventTrigger\`, e.g.
   \`event.run\`, \`event.start\`, \`event.interval\`, \`event.deploy\`, \`event.execute\`) so there's an
   exec chain to start from, unless the user explicitly only wants a disconnected fragment.
5. Give every **input** data pin either a literal \`value\` or a \`connectionId\` from a compatible
   output — never leave a required input pin with neither, unless its default value (shown in the
   pin tables below) is already what's wanted.

## Worked example

A tiny "Run → print 2+3" graph:

\`\`\`json
{
  "source": "hermione-graph-editor",
  "kind": "nodes",
  "version": 1,
  "nodes": [
    { "id": "start", "type": "event.run", "position": { "x": 80, "y": 80 }, "pins": { "exec-out": {} } },
    { "id": "add", "type": "math.add", "position": { "x": 380, "y": 80 }, "pins": { "a": { "value": 2 }, "b": { "value": 3 }, "result": { "connectionId": "conn-2" } } },
    { "id": "print", "type": "debug.print", "position": { "x": 680, "y": 80 }, "pins": { "exec-in": { "connectionId": "conn-1" }, "message": { "connectionId": "conn-2" }, "exec-out": {} } }
  ],
  "connections": [
    { "id": "conn-1", "fromNode": "start", "fromPin": "exec-out", "toNode": "print", "toPin": "exec-in" },
    { "id": "conn-2", "fromNode": "add", "fromPin": "result", "toNode": "print", "toPin": "message" }
  ]
}
\`\`\`

Note \`add\` has no exec pins at all — it's a pure data node, evaluated on demand whenever something
downstream reads its \`result\`, so it needs no exec wiring of its own.

## Node reference

Every node type available in this project, grouped the same way they're grouped in the editor's own
"add node" menu. \`type\` is the exact string to use in a node's \`"type"\` field.
`;

function describeStructType(id: string, label: string, fields: { id: string; label: string; type: string }[]): string {
  const rows = fields.map((f) => `| \`${f.id}\` | ${f.label} | ${f.type} |`).join("\n");
  return [`#### \`${id}\` — ${label}`, "", "| field | label | type |", "| --- | --- | --- |", rows].join("\n");
}

function describeEnumType(id: string, label: string, values: { id: string; label: string }[]): string {
  return `#### \`${id}\` — ${label}\n\nValues: ${values.map((v) => `\`${v.id}\` (${v.label})`).join(", ")}`;
}

/** Appendix listing every registered struct/enum type, so an AI can pick a real \`subType\`/enum
 * \`options\` value instead of guessing one — built live from the same struct/enum registries the
 * node reference's \`subType\`/\`options\` notes point at. */
function buildTypeRegistryAppendix(): string {
  const structs = allStructTypeDefs()
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((s) => describeStructType(s.id, s.label, s.fields))
    .join("\n\n");
  const enums = allEnumTypeDefs()
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((e) => describeEnumType(e.id, e.label, e.values))
    .join("\n\n");

  return [
    "## Registered struct types",
    "",
    "Valid `subType` ids for a `struct` pin (or a `struct.make`/`struct.break` node's own `subType` field), each with its fields (a `struct.make` node takes these as input pins plus one `value` output pin; `struct.break` takes `value` as input and yields these as output pins).",
    "",
    structs,
    "",
    "## Registered enum types",
    "",
    "Valid `subType` ids for an `enum` pin, each with its valid `options` values.",
    "",
    enums,
  ].join("\n");
}

/** Builds the full AI-facing reference doc (intro + one section per node group + one subsection
 * per node type + a struct/enum type appendix) straight from the live node/struct/enum registries,
 * so it can never drift out of sync with the actual nodes shipped in this repo. */
export function buildAiDocsMarkdown(): string {
  registerBuiltins();

  const defs = allNodeDefs();
  const byGroup = new Map<string, NodeDef[]>();
  for (const def of defs) {
    const top = topLevelGroup(def.group);
    const list = byGroup.get(top);
    if (list) list.push(def);
    else byGroup.set(top, [def]);
  }

  const groupNames = [...byGroup.keys()].sort((a, b) => a.localeCompare(b));
  const sections = groupNames.map((group) => {
    const nodeDocs = byGroup
      .get(group)!
      .sort((a, b) => a.label.localeCompare(b.label))
      .map(describeNode)
      .join("\n\n");
    return `### ${group}\n\n${nodeDocs}`;
  });

  return [INTRO, ...sections, buildTypeRegistryAppendix()].join("\n\n");
}
