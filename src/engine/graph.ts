import { NodeInstance } from "./nodeInstance";
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
}
