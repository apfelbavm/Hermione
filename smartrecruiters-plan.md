# SmartRecruiters connector — master phased plan

Source of truth for this multi-session task. Each phase is meant to be done in its
own fresh chat. Before starting work: read this file fully, check which phases are
marked DONE, and resume at the first NOT-STARTED phase. Mark a phase DONE (with date)
here immediately after finishing + verifying it (tsc clean, prettier run).

## Scope decisions (confirmed with user, do not re-litigate)
- Exhaustive coverage of the SmartRecruiters REST API is the goal (150+ endpoints),
  built incrementally across many sessions — NOT the lighter "core + escape hatch"
  option that was also offered.
- Both auth methods supported: API Key (`X-SmartToken` header) and OAuth2 Client
  Credentials grant (Bearer token). Two credential types exist:
  `smartRecruitersApiKey` and `smartRecruitersOAuth2ClientCredentials`.
- Partner-only endpoints are explicitly EXCLUDED (askForConsent, setupIntegration,
  enableIntegration/deleteIntegration, partner assessment package/order endpoints,
  job-board partner API). These require SmartRecruiters Marketplace partner approval
  and don't apply to a company automating its own account. Don't add these.
- Config/body payloads use JSON-string pins (queryJson/bodyJson), not per-resource
  structs — SmartRecruiters resources are large, deeply nested, and
  per-company-configurable; rigid structs for 150+ endpoints is impractical and
  against the connector-batch-pattern convention for arbitrary-shape records.

## Architecture (established in Phase 0, reused by every later phase)
- `packages/core/src/lib/smartRecruitersManager.ts` — `SmartRecruitersManager` class.
  Auth union `SmartRecruitersAuth = {kind:"apiKey", apiKey} | {kind:"oauth2", clientId,
  clientSecret, tokenUrl}`. `static forAuth(auth)` caches instances per auth (mirrors
  GithubManager). Private `request<T>(method, path, {query?, body?})` is the ONE place
  that builds the URL, injects the auth header (minting/caching an OAuth2 bearer token
  as needed), and normalizes errors — every new resource method should call this, not
  duplicate fetch/try-catch. Add new public methods here per phase, typed per-resource
  (mirrors WorkdayManager's per-method style), e.g. `async listJobs(...)`,
  `async createJob(...)`. Generic `apiCall(method, path, query, body)` is the escape
  hatch already built in Phase 0.
- `packages/core/src/server/functionLibrarySmartRecruiters.ts` — compiled/deployed-flow
  counterpart. `smartRecruitersCredentialFromEnv(name)` reads env vars (no vault access
  at runtime). One exported async wrapper function per manager method, e.g.
  `smartRecruitersListJobs(credentialName, ...)` — mirrors functionLibraryGithub.ts.
- `packages/graph/src/nodes/smartRecruiters.ts` — one file, `GROUP_NAME =
  "Request.SmartRecruiters"`. `resolveSmartRecruitersCredential(ctx, name)` shared
  helper already exists (Phase 0) — reuse it. Every node needs both `execute` (calls
  `SmartRecruitersManager.forAuth(...)`) AND `compileExecute` (calls
  `functionLibrarySmartRecruiters.smartRecruiters*`) — this is a hard repo rule, never
  add one without the other.
- `packages/graph/src/enum/smartRecruiters.ts` — enums only for genuinely fixed,
  documented value sets (e.g. job status). `SMARTRECRUITERS_HTTP_METHOD_ENUM_TYPE`
  already exists (Phase 0).
- `packages/graph/src/structs/smartRecruiters.ts` — NOT YET CREATED. Only add a struct
  if a phase needs one true fixed-shape small object (e.g. a create-result with
  id+url); default to JSON-string pins otherwise.
- Credential types live in `packages/shared/src/types.ts` (interfaces +
  `CredentialTypeId`/`CredentialData` unions) and `packages/shared/src/registry.ts`
  (`registerCredentialType` UI metadata) — both already updated in Phase 0, no further
  changes needed for later phases unless a 3rd auth method is ever added.
- `packages/core/src/server/credentialEnv.ts` needs ZERO changes ever — it's fully
  generic, derives `HERMIONE_CRED_<NAME>_CREDENTIAL_TYPE` /
  `HERMIONE_CRED_<NAME>_<FIELD>` env vars automatically from any credential type/data.
- Register the node file once in `src/graph/nodes/index.ts` (already done in Phase 0):
  `import "@hermione/graph/nodes/smartRecruiters";`
- i18n: `language/en_US/translations.json` → `nodes.smartRecruiters` section
  (`__shared` for pins reused across nodes, one sub-object per node `type` suffix for
  label/description/pin_* overrides). Already has `__shared` + `apiCall` from Phase 0 —
  add one block per new node type per phase.
- After each phase: `node_modules\.bin\tsc.cmd --noEmit -p tsconfig.json` (trust this
  over `npx tsc` per tool-gotchas.md), then `npx prettier --write` on touched files.

## Phase status

- [x] **Phase 0 — Foundation** (done): credential types (API key + OAuth2 client
  credentials), `SmartRecruitersManager` skeleton with generic `request`/`apiCall`,
  HTTP method enum, `smartRecruiters.apiCall` escape-hatch node (usable against ANY
  documented endpoint today), functionLibrarySmartRecruiters.ts, index.ts
  registration, i18n section. Verified: tsc clean, prettier clean.
- [x] **Phase 1 — Jobs core** (done 2026-08-07): searchJobs (`/jobs`, paginated),
  createJob, getJob, patchJob (JSON merge patch), updateJobStatus,
  getJobStatusHistory, getLatestApprovalRequest (job-scoped), updateHeadcount,
  getJobNote, updateJobNote. Manager/functionLibrary methods already existed from a
  prior session; this pass added the 10 dedicated graph nodes (execute +
  compileExecute) in `packages/graph/src/nodes/smartRecruiters.ts`, plus their i18n
  blocks. Verified: tsc clean, prettier clean.
- [x] **Phase 2 — Job Ads, Postings, Positions, Hiring Team** (done 2026-08-07):
  listJobAds, createJobAd, getJobAd, updateJobAd (job ad body stays a JSON pin —
  large/nested like Job); publishJobAdPosting/unpublishJobAdPosting/listJobAdPostings
  (used the job-ad-scoped `/jobs/{jobId}/jobads/{jobAdId}/postings` family, not the
  job-level `/jobs/{jobId}/publication` alternate — the phase title says "Postings"
  and that's the literally-named `postings` resource; the job-level `publication`
  endpoints were left uncovered, add them later via apiCall or a dedicated node if
  needed); listPositions/createPosition/getPosition/updatePosition/deletePosition
  (position body uses discrete pins, not JSON — small fixed shape per SmartRecruiters
  docs, unlike Job/JobAd); getHiringTeam/addHiringTeamMember/removeHiringTeamMember.
  Added 3 enums: hiring team role, position type, job ad posting visibility.
  Endpoint shapes verified against developers.smartrecruiters.com reference docs
  (fetched live, not from training-data memory). Verified: tsc clean, prettier clean.
- [x] **Phase 3 — Candidates core** (done 2026-08-07): searchCandidates
  (`/candidates`, `nextPageId`-based pagination — NOT offset like Jobs), addCandidate
  (talent pool), addCandidateToJob, parseResume/parseResumeForJob (multipart
  `POST .../candidates/cv`, file passed as base64+filename+contentType pins and
  converted to a `Blob`/`FormData` in the manager — no existing repo precedent for
  multipart uploads via raw fetch, added a `buildFileFormData` helper + a `formData`
  option on `request()`), getCandidate, deleteCandidate, updateCandidate (JSON merge
  patch), tags (get/add/replace/delete — delete clears all, no selective API),
  updateCandidateJobStatus + getCandidateJobStatusHistory (job-scoped, confirmed via
  live docs at `/candidates/{id}/jobs/{jobId}/status...`), updateCandidateSource
  (job-scoped only, no talent-pool-level variant exists), consent
  (requestCandidateConsent batch + getCandidateConsentStatus +
  getCandidateConsentDecisions), candidate properties (both the deprecated
  non-job-scoped `getCandidateProperties`/`updateCandidateProperty` and the current
  job-scoped `getCandidateJobProperties`/`updateCandidateJobProperties` batch
  endpoint — kept both per the "job + non-job variants" scope), attachments
  (listCandidateAttachments/addCandidateAttachment/getCandidateAttachment — **no
  delete-attachment endpoint exists** in the API and **no job-scoped attachment
  variant exists** either, verified against live docs, so neither was added),
  onboarding status (both deprecated global and current job-scoped
  get/update), getCandidateScreeningAnswers (job-scoped only).
  **EEO was dropped from scope**: verified against live SmartRecruiters reference
  docs that no standalone EEO endpoint exists — `eeo` is just one of several
  screening-question `type` values returned by getCandidateScreeningAnswers, not a
  separate resource. Endpoint shapes verified against developers.smartrecruiters.com
  live docs via a research subagent (not from training-data memory), including a
  second verification pass on job-scoped properties/status-history/onboarding paths
  that were only named in deprecation-notice text on other pages. Added 3 enums
  (attachment type, property context, onboarding status). Verified: tsc clean,
  prettier clean.
- [ ] **Phase 4 — Job Applications**: get by id, delete by id, consent
  request/decision.
- [ ] **Phase 5 — Users & Access**: list/create/get/update users, me, password
  reset, activation email/activate/deactivate, avatar update, system roles list,
  access groups (list/create/get/update/delete, assign/remove users).
- [ ] **Phase 6 — Interviews & Events**: interviews CRUD, interview types CRUD,
  events (create/get/update/delete, sessions, interviewers add/remove, applicants
  move/add, get events for job/candidate/application), self-scheduling
  (create/update/get/cancel/search, slots), timeslots CRUD + statuses, schedule
  preferences.
- [ ] **Phase 7 — Interview Templates**: templates CRUD (new + deprecated), job-level
  templates, job managed steps, search by job/application ids.
- [ ] **Phase 8 — Offers & Approvals**: candidate offers (list/get/search/latest
  approvals), generic approval requests (get by id, comments get/add, get pending,
  create, approve, reject), documents list/get.
- [ ] **Phase 9 — Configuration API**: departments, functions, industries, levels,
  typesOfEmployment, job properties (CRUD + values CRUD + translations +
  dependents), candidate properties (CRUD + values), sources (types + values),
  rejection/withdrawal reasons, career sites, custom data scopes, predefined
  locations, access-groups config variant, company info.
- [ ] **Phase 10 — Messages, Templates, Reviews**: Hireloop messages share/delete/
  fetch, message templates CRUD (both endpoint families), reviews CRUD, scorecard
  criteria.
- [ ] **Phase 11 — Reporting & Audit**: reports list/get, report files
  list/get/download/most-recent, ad-hoc report generation, audit events list.
- [ ] **Phase 12 — Webhooks & Misc**: webhook subscriptions CRUD + activate + secret
  key + callback log search, employee/global notification preferences, notification
  types, shorten URL, vendor configs (get/add/update), onboarding/new-hire/web-form/
  pdf-form assignment read endpoints.
- [ ] **Phase 13 — Final pass**: fill any remaining translations.json gaps, fix
  `docs/integrations.md` (currently stale — describes an old split-file
  execute/nodeRuntimes pattern this repo no longer uses; rewrite to describe the
  current single-file `packages/graph/src/nodes/<name>.ts` pattern for ALL
  providers, not just SmartRecruiters), update ROADMAP.md, add a smoke test
  (`tests/graph/nodes/smartRecruiters.test.ts`, optional — not every provider has
  one, e.g. sendgrid/sap/slack don't), full repo tsc + prettier pass.

## Notes for future sessions
- Reference patterns already read and confirmed useful: `githubManager.ts` (auth
  union + forAuth cache pattern), `workdayManager.ts` (plain-fetch, no-official-SDK,
  per-method typed results — closest analog since SmartRecruiters has no npm SDK
  either), `github.ts`/`linkedin.ts` node files (execute+compileExecute pairing,
  JSON-string pin convention).
- Webhooks (Phase 12) need HMAC-SHA256 signature verification
  (`smartrecruiters-signature`/`smartrecruiters-timestamp` headers) and a handshake
  step (`X-Hook-Secret`) — this is materially different from a simple REST call, plan
  extra time/design for it, possibly a dedicated `smartRecruiters.verifyWebhook` pure
  node (evaluate, not execute) alongside the CRUD ones.
- OAuth2 token endpoint URL used as the credential default:
  `https://api.smartrecruiters.com/identity/oauth/token` — NOT hardcoded anywhere in
  code (user provides it per-credential via the `tokenUrl` field), just used as the
  registry field's `help` text example. Verify against SmartRecruiters' own docs if a
  real integration test ever fails auth.
