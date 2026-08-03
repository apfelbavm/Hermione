# Auth & credentials

## Credential Vault
- `src/credentials/types.ts` — shared, client-safe types (`CredentialTypeId`, per-type data shapes like `Oauth2SamlBearerCredentialData`). No Node/DB dependency — importable from the browser (Credential Vault UI, an interpreter-path node) and the server alike.
- `src/credentials/registry.ts` — `CredentialTypeDef` registry: each type's `id`, `label`, and `CredentialFieldDef[]` (with `secret`/`help` flags) driving the Credential Vault dialog's form.
- Stored credentials live in the DB via `DatabaseManager` (`listCredentials`/`getCredential`), never in graph/node definitions.

## Getting credentials into a running Flow
Two different runtimes need the same credential, by two different mechanisms:
1. **Interpreter** (Emulate/Simulate): reads straight from the DB via `DatabaseManager` at execution time.
2. **Compiled/deployed script**: has no DB access. `src/server/credentialEnv.ts`'s `applyCredentialEnvVars(db)` copies every stored credential's fields into `process.env` under `HERMIONE_CRED_<SANITIZED_NAME>_<FIELD>` (plus a `..._CREDENTIAL_TYPE` key for credentials with multiple shapes, e.g. Jira Cloud/PAT/Basic). The compiled node's own generated reader (e.g. `oauth2Saml.ts`'s `credentialFromEnv`, `functionLibraryJira.ts`'s `jiraCredentialFromEnv`) looks up those exact env var names. This is called once before importing/running the deployed script (see `api/emulate/run/route.ts`, `executeDeployedFlow.ts`).

**Rule: never hardcode or embed credential values in a node definition or compiled output** — they're always looked up at runtime, by name, through one of the two mechanisms above.

## OAuth / auth node types
- `graph/nodes/auth.ts` — generic username/password credential node.
- `graph/nodes/oauth2Saml.ts` — SAML Bearer OAuth2 flow (used by Google/Microsoft-style service auth).
- `graph/nodes/oauth2ClientCredentials.ts` — OAuth2 client-credentials flow (Microsoft Graph app-only auth).
- Dropbox uses a one-time `dropbox.authorize` node to exchange an auth code for a refresh token, stored back into the credential (see `dropboxOAuth2` fields in `credentials/registry.ts`).

## Provider-specific auth quirks
See [/memories/repo/environment.md](/memories/repo/environment.md) for known library-version breaking changes (e.g. jira.js 5.x auth shape changes) discovered during upgrades.
