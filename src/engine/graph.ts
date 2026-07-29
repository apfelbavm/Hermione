import { NodeInstance } from "./nodeInstance";
import { getNodeDef } from "./registry";
import type {
  CodeScriptDef,
  CommentBox,
  Connection,
  FunctionDef,
  Variable,
} from "./types";

export class Graph {
  id: string;
  name: string;
  nodes: NodeInstance[];
  connections: Connection[];
  variables: Variable[];
  commentBoxes: CommentBox[];
  functions: FunctionDef[];
  scripts: CodeScriptDef[];

  constructor(id: string, name: string) {
    this.id = id;
    this.name = name;
    this.nodes = [];
    this.connections = [];
    this.variables = [];
    this.commentBoxes = [];
    this.functions = [];
    this.scripts = [];
  }

  addNode(node: NodeInstance): void {
    this.nodes.push(node);
  }

  /** All variables visible from `currentGraph`: just the root's if editing the root itself, or
   * root (global) + currentGraph's own (local) if currentGraph is a function's body. Functions
   * themselves are never merged this way — they're always looked up straight from rootGraph.functions,
   * since a function's own body.functions field is unused (functions are never nested). */
  getVisibleVariables(currentGraph: Graph): Variable[] {
    if (currentGraph === this) return this.variables;
    return [...this.variables, ...currentGraph.variables];
  }

  /** True if a node of this type is allowed to be placed into `graph` right now — trivially true for
   * any non-event node type. An event node (see NodeDef.eventTrigger — On Start/On Interval/On Run)
   * may only live in the root graph, never inside a function body, and at most one instance of each
   * event TYPE may exist per graph, mirroring how Unreal only allows one BeginPlay/EventTick per
   * Blueprint. Used to filter both the node-creation menu and paste. */
  canPlaceNodeType(type: string, isFunctionBody: boolean): boolean {
    const def = getNodeDef(type);
    if (!def.eventTrigger) return true;
    if (isFunctionBody) return false;
    return !this.nodes.some((n) => n.type === type);
  }
}
