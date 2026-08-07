# Integrations / connectors

Every 3rd-party provider follows the same 4-layer pattern. Take Jira as the example:

| Layer                 | File                                                                    | Responsibility                                                                                                                                                                                                         |
| --------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provider client       | `packages/core/src/lib/jiraManager.ts`                                  | Thin wrapper around the provider's own SDK (`jira.js`, `googleapis`, `dropbox`, `@octokit/*`, `@azure/storage-blob`, `facebook-nodejs-business-sdk`, `@microsoft/microsoft-graph-client`, `ssh2-sftp-client`, `soap`). |
| Runtime logic         | `packages/core/src/server/functionLibraryJira.ts`                       | Actual node execution logic; calls into the manager. Shared by both the interpreter and compiled/deployed scripts (see [architecture.md](./architecture.md)).                                                          |
| Node definition       | `packages/graph/src/nodes/jira.ts`                                      | Editor-only: pins, labels, tooltips, compileExecute. No `@hermione/core` import — embeddable, Node-SDK-free.                                                                                                           |
| Node runtime binding  | `src/graph/nodeRuntimes/jira.ts`                                        | The node type's actual `execute()` (interpreter path) — the only place that imports the provider client, registered separately via `registerNodeExecute` so the definition above stays Node-SDK-free.                  |
| Struct/enum pin types | `packages/graph/src/structs/jira.ts`, `packages/graph/src/enum/jira.ts` | Typed pin shapes surfaced in the editor for this provider's data.                                                                                                                                                      |

Current providers: Dropbox, GitHub, Google (Admin/Calendar/Docs/Drive/Gmail/Sheets/Auth), Jira, Facebook, Azure Storage, Microsoft 365, AWS DynamoDB, MongoDB, Slack, Stripe, Salesforce, Workday, Twilio, SMTP, SAP (OData/Gateway only), LinkedIn (`linkedin-api-client`), SendGrid (`@sendgrid/mail` + `@sendgrid/client`). Plus generic protocol nodes not tied to one vendor: `http.ts`, `soap.ts`, `sftp.ts`, `odata.ts`, `xml.ts`, `csv.ts`.

## Adding a new integration

1. Add the credential type (fields it needs) to `packages/shared/src/registry.ts` + a `CredentialTypeId` variant and data shape in `packages/shared/src/types.ts`.
2. Add `packages/core/src/lib/<provider>Manager.ts` wrapping the provider's SDK.
3. Add `packages/core/src/server/functionLibrary<Provider>.ts` with the actual node execution functions, reading credentials via `credentialEnv.ts` conventions for the deployed-script path (see [auth.md](./auth.md)).
4. Add `packages/graph/src/nodes/<provider>.ts` with editor-only node/pin definitions (no `@hermione/core` import), and `src/graph/nodeRuntimes/<provider>.ts` with the matching `registerNodeExecute` calls that import the provider client. Register both in `src/graph/nodes/index.ts` (`import "@hermione/graph/nodes/<provider>";` + `import "../nodeRuntimes/<provider>";`).
5. Add struct/enum files under `packages/graph/src/structs/` / `packages/graph/src/enum/` only if the provider needs custom typed pin shapes.

## Browser-side SDK stubs

Some provider SDKs (`googleapis`, `facebook-nodejs-business-sdk`, `mongodb`) are Node-only and would break the browser bundle if imported by editor code. `packages/core/src/lib/googleapisBrowserStub.ts`, `packages/core/src/lib/facebookSdkBrowserStub.ts`, and `packages/core/src/lib/mongoBrowserStub.ts` exist to satisfy imports client-side (aliased in `next.config.mjs`'s `turbopack.resolveAlias`) — never import the real SDK from anything that also runs in the browser (editor nodes, components).
