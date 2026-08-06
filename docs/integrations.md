# Integrations / connectors

Every 3rd-party provider follows the same 4-layer pattern. Take Jira as the example:

| Layer                 | File                                                  | Responsibility                                                                                                                                                                                                         |
| --------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provider client       | `src/lib/jiraManager.ts`                              | Thin wrapper around the provider's own SDK (`jira.js`, `googleapis`, `dropbox`, `@octokit/*`, `@azure/storage-blob`, `facebook-nodejs-business-sdk`, `@microsoft/microsoft-graph-client`, `ssh2-sftp-client`, `soap`). |
| Runtime logic         | `src/server/functionLibraryJira.ts`                   | Actual node execution logic; calls into the manager. Shared by both the interpreter and compiled/deployed scripts (see [architecture.md](./architecture.md)).                                                          |
| Node definitions      | `src/graph/nodes/jira.ts`                             | Editor-only: pins, labels, tooltips. No real API/HTTP calls here.                                                                                                                                                      |
| Struct/enum pin types | `src/graph/structs/jira.ts`, `src/graph/enum/jira.ts` | Typed pin shapes surfaced in the editor for this provider's data.                                                                                                                                                      |

Current providers: Dropbox, GitHub, Google (Admin/Calendar/Docs/Drive/Gmail/Sheets/Auth), Jira, Facebook, Azure Storage, Microsoft 365, AWS DynamoDB, MongoDB, Slack, Stripe, Salesforce, Workday, Twilio, SMTP, SAP (OData/Gateway only), LinkedIn (`linkedin-api-client`). Plus generic protocol nodes not tied to one vendor: `http.ts`, `soap.ts`, `sftp.ts`, `odata.ts`, `xml.ts`, `csv.ts`.

## Adding a new integration

1. Add the credential type (fields it needs) to `src/credentials/registry.ts` + a `CredentialTypeId` variant and data shape in `src/credentials/types.ts`.
2. Add `src/lib/<provider>Manager.ts` wrapping the provider's SDK.
3. Add `src/server/functionLibrary<Provider>.ts` with the actual node execution functions, reading credentials via `credentialEnv.ts` conventions for the deployed-script path (see [auth.md](./auth.md)).
4. Add `src/graph/nodes/<provider>.ts` with editor-only node/pin definitions, and register it in `src/graph/nodes/index.ts`.
5. Add struct/enum files under `src/graph/structs/` / `src/graph/enum/` only if the provider needs custom typed pin shapes.

## Browser-side SDK stubs

Some provider SDKs (`googleapis`, `facebook-nodejs-business-sdk`, `mongodb`) are Node-only and would break the browser bundle if imported by editor code. `src/lib/googleapisBrowserStub.ts`, `src/lib/facebookSdkBrowserStub.ts`, and `src/lib/mongoBrowserStub.ts` exist to satisfy imports client-side (aliased in `next.config.mjs`'s `turbopack.resolveAlias`) — never import the real SDK from anything that also runs in the browser (editor nodes, components).
