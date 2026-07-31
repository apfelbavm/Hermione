import { allNodeDefs, topLevelGroup } from "../engine/registry";
import type { NodeDef } from "../engine/types";
import { registerBuiltins } from "../nodes";

/** Nodes whose pin list isn't fixed on the NodeDef (derivePins/deriveFunctionPins/deriveScriptPins/
 * deriveInstancePins) — their real shape depends on a bound Variable/FunctionDef/CodeScriptDef/
 * per-instance data the AI has no way to look up, so they're called out separately instead of
 * documented pin-by-pin like every other node. */
function isDynamicPinsNode(def: NodeDef): boolean {
  return Boolean(def.derivePins || def.deriveFunctionPins || def.deriveScriptPins || def.deriveInstancePins);
}

function describeNode(def: NodeDef): string {
  const lines: string[] = [`#### \`${def.type}\` — ${def.label}`, def.description];
  if (def.eventTrigger) lines.push(`_Graph entry point (event trigger kind: "${def.eventTrigger.kind}"). Every graph needs at least one of these to run._`);
  if (isDynamicPinsNode(def)) {
    lines.push("_This node's pins depend on a bound variable/function/script that only exists inside a specific project — skip it unless the user's request explicitly needs it._");
  } else if (def.pins.length > 0) {
    lines.push("", "| pin | direction | type | notes |", "| --- | --- | --- | --- |");
    for (const pin of def.pins) {
      const notes: string[] = [];
      if (pin.container && pin.container !== "single") notes.push(`container=${pin.container}`);
      if (pin.container === "map" && pin.keyType) notes.push(`keyType=${pin.keyType}`);
      if (pin.options) notes.push(`options=[${pin.options.join(", ")}]`);
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
2. **Data pins must match exactly**: same \`type\` (\`number\`/\`boolean\`/\`string\`/\`object\`/\`date\`)
   and same container (\`single\` is the default when a pin has no \`container\`; \`array\`/\`set\`/\`map\`
   never silently connect to a different container or to \`single\`). For a \`map\` pin, \`keyType\` must
   also match.
3. **\`enum\` pins are never wireable**, in either direction — they're config-only (rendered as a
   dropdown), never plug into anything, including another enum pin.
4. Every graph needs at least one **event/entry node** (an node with an \`eventTrigger\`, e.g.
   \`event.run\`, \`event.start\`, \`event.interval\`) so there's an exec chain to start from, unless the
   user explicitly only wants a disconnected fragment.
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

/** Builds the full AI-facing reference doc (intro + one section per node group + one subsection
 * per node type) straight from the live node registry, so it can never drift out of sync with the
 * actual nodes shipped in this repo. */
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

  return [INTRO, ...sections].join("\n\n");
}
