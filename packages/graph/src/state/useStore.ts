"use client";

import { useSyncExternalStore } from "react";
import type { Store } from "./store";

/** Subscribes a component to `store`'s revision counter so it re-renders on every coalesced
 * notify() pass — without needing store.state itself to change identity (it's one mutable object,
 * mutated in place everywhere in this app, old imperative overlay code and new React components
 * alike). The returned number isn't meaningful on its own; call this for its re-render side effect
 * and read whatever fields you need off store.state directly in the component body afterward. */
export function useStoreRevision(store: Store): number {
  return useSyncExternalStore(store.subscribe, store.getRevision, store.getRevision);
}
