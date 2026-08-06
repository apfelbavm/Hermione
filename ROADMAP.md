# Hermione — Feature Summary & Roadmap to Enterprise iPaaS

Goal: not just match Microsoft Power Automate and SAP SuccessFactors Integration Suite (CPI-style), but exceed them. This doc is a working checklist — features get checked off as they're implemented, one at a time, in the order directed.

## Current state

Hermione is a visual node-graph automation/integration platform:

- **Flow editor** ([src/graph](src/graph)): canvas node-graph editor with two mandatory, always-in-sync execution paths:
  - **Interpreter** — walks the live graph node-by-node (Emulate/Simulate pages).
  - **Compiler** ([src/graph/compiler/codegen.ts](src/graph/compiler/codegen.ts)) — compiles a flow to a standalone `.mjs` script in [data/deployed-scripts](data/deployed-scripts), run via webhook (`api/hooks/[projectId]/[flowId]`) or `flow.executeFlow`.
- **Connector library** ([src/graph/nodes](src/graph/nodes), [src/server](src/server), [src/lib](src/lib)), 4-layer pattern per provider (SDK wrapper → runtime function → editor node → typed structs/enums). Current connectors: Dropbox, GitHub, Google (Admin/Calendar/Docs/Drive/Gmail/Sheets), Jira, Facebook, Azure Blob Storage, Microsoft 365 (Graph), AWS DynamoDB + Kinesis, MongoDB, plus generic HTTP/SOAP/SFTP/OData/XML/CSV nodes.
- **Credential Vault** ([docs/auth.md](docs/auth.md)): typed credential registry, DB-backed, OAuth2 (SAML-bearer, client-credentials), env-var injection (`HERMIONE_CRED_*`) for deployed scripts — no secrets ever embedded in compiled output.
- **Project/Flow app** ([src/app](src/app)): Projects → Flows, run logs, version history/restore, Credential Vault UI, Emulate/Simulate sandboxes.
- **AI copilot** ([src/graph/ai](src/graph/ai), [src/components/ai/AiChatPanel.tsx](src/components/ai/AiChatPanel.tsx)): tool-calling chat agent that inspects/builds/wires/validates flows via natural language (local Ollama or hosted LLM).
- **Persistence**: SQLite via `better-sqlite3`, single-file/single-process.

The 4-layer connector pattern already scales to "many more nodes" without rework — that part is solid. Everything below is what's missing *around* the node library.

## Gaps vs. Power Automate / SAP Integration Suite

### Triggers & scheduling
- [ ] Time-based trigger (cron/recurrence) — only `manual`/`simulate`/`deploy`/webhook exist today ([src/graph/nodes/event.ts](src/graph/nodes/event.ts))
- [ ] Polling triggers (e.g. "new row", "new file in folder")
- [ ] Idempotency/dedup handling for webhook & polling triggers

### Reliability & error handling
- [ ] Retry policy per node/action
- [ ] Dead-letter / failure queue
- [ ] Per-node try/catch branch ("configure run after" equivalent)
- [ ] Durable/long-running execution (pause-and-resume, wait states)

### Scale & runtime architecture
- [ ] Move off single-file SQLite + in-process execution for horizontal scaling
- [ ] Queue/worker pool, backpressure for high-volume/bulk workloads (e.g. SuccessFactors bulk employee sync)

### Enterprise governance
- [ ] Environments & promotion (dev → test → prod)
- [ ] Git-backed flow source control + CI/CD deploy hook
- [ ] RBAC / per-project / per-flow permissions
- [ ] Audit trail (who changed what, when)
- [ ] Multi-tenancy (if this becomes a SaaS product)

### Observability
- [ ] Metrics/alerting, SLA dashboards
- [ ] Export run logs to external observability (Datadog/ELK/Splunk)

### Human-in-the-loop
- [ ] Approval node / adaptive-card-style form
- [ ] Notification-and-wait pattern

### Data transformation
- [ ] Visual schema/field mapper (SuccessFactors Integration Center-style)
- [ ] Batch/paging/bulk-record helpers beyond basic per-call functions

### Secrets & compliance
- [ ] Enterprise secret store integration (Azure Key Vault, HashiCorp Vault)
- [ ] Credential rotation
- [ ] Field-level encryption-at-rest
- [ ] Compliance posture (SOC2/GDPR/data residency)

### Enterprise connectors still missing
- [ ] SAP (IDoc, BAPI/RFC, OData v2/v4 for SuccessFactors/Employee Central)
- [ ] Salesforce
- [ ] ServiceNow
- [ ] Workday
- [ ] Slack / Microsoft Teams messaging
- [ ] SQL databases (Postgres/SQL Server/MySQL)
- [ ] Excel / SharePoint / OneDrive
- [ ] Generic SMTP / Twilio
- [ ] Stripe

### Collaboration & distribution
- [ ] Multi-user real-time co-editing
- [ ] Flow templates/gallery/marketplace
- [ ] Publish flow as reusable subflow/API beyond current `flow.executeFlow`

### AI differentiation (beyond parity)
- [ ] Natural-language flow monitoring ("why did last night's run fail?")
- [ ] AI-suggested error-handling/retry wiring
- [ ] AI-assisted field mapping

## Working process

We'll go through this list top-down or in whatever order is directed, one feature at a time. Check items off as they land.
