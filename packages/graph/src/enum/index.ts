// Mirrors graph/structs: per-package enum type registrations (registerEnumType calls) live in
// sibling files here (common.ts, crypto.ts, github.ts, ...), each imported directly by the node
// file(s) that use it — same side-effect-registration pattern graph/structs uses, so there's no
// central barrel that needs updating when a new enum type is added.
export {};
