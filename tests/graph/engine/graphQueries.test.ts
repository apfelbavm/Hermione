import { describe, expect, it } from "vitest";
import { connectionsFrom, connectionsTouchingPin, connectionTo } from "../../../src/graph/engine/graphQueries";
import { type Connection } from "../../../src/graph/engine/types";
import { Graph } from "../../../src/graph/engine/graph";

function conn(id: string, fromNode: string, fromPin: string, toNode: string, toPin: string): Connection {
  return { id, fromNode, fromPin, toNode, toPin };
}

describe("connectionsTouchingPin", () => {
  it("finds a connection whether the pin is the source or destination end", () => {
    const graph = new Graph("g", "root");
    graph.connections.push(conn("c1", "a", "out", "b", "in"));

    expect(connectionsTouchingPin(graph, "a", "out").map((c) => c.id)).toEqual(["c1"]);
    expect(connectionsTouchingPin(graph, "b", "in").map((c) => c.id)).toEqual(["c1"]);
    expect(connectionsTouchingPin(graph, "a", "in")).toEqual([]); // wrong pin on the right node
  });

  it("returns every incoming branch on an exec input that fans in from several sources — unlike connectionTo, which only ever returns one", () => {
    const graph = new Graph("g", "root");
    graph.connections.push(conn("c1", "branch1", "exec-out", "target", "exec-in"), conn("c2", "branch2", "exec-out", "target", "exec-in"), conn("c3", "branch3", "exec-out", "target", "exec-in"));

    expect(
      connectionsTouchingPin(graph, "target", "exec-in")
        .map((c) => c.id)
        .sort(),
    ).toEqual(["c1", "c2", "c3"]);
    expect(connectionTo(graph, "target", "exec-in")?.id).toBeDefined(); // only finds one of the three
  });

  it("returns every fan-out branch on a data output feeding several inputs", () => {
    const graph = new Graph("g", "root");
    graph.connections.push(conn("c1", "source", "value", "consumer1", "in"), conn("c2", "source", "value", "consumer2", "in"));

    expect(
      connectionsTouchingPin(graph, "source", "value")
        .map((c) => c.id)
        .sort(),
    ).toEqual(["c1", "c2"]);
    expect(connectionsFrom(graph, "source", "value")).toHaveLength(2);
  });

  it("returns an empty array for a pin with no connections", () => {
    const graph = new Graph("g", "root");
    expect(connectionsTouchingPin(graph, "lonely", "pin")).toEqual([]);
  });
});
