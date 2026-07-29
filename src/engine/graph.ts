import type {
  CodeScriptDef,
  CommentBox,
  Connection,
  FunctionDef,
  NodeInstance,
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
}
