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
- Unlike most other providers, SmartRecruiters has no `functionLibrarySmartRecruiters.ts`
  of its own — `SmartRecruitersManager` resolves its own credentials straight from the
  database (see its `findCredential`), so both the interpreter and the compiled/deployed
  script call the exact same manager methods directly instead of going through a
  separate env-var-reading layer (mirrors `TWILIO_MANAGER_IMPORT`/`WORKDAY_MANAGER_IMPORT`
  in `packages/graph/src/engine/compileUtils.ts`, which exports
  `SMARTRECRUITERS_MANAGER_IMPORT` for this).
- `packages/graph/src/nodes/smartRecruiters.ts` — one file, `GROUP_NAME =
"Request.SmartRecruiters"`. Every node needs both `execute` (calls
  `SmartRecruitersManager.forAuth(...)` via the client-safe `loadSmartRecruitersManager()`
  dynamic import) AND `compileExecute` (emits a call to the exact same
  `SmartRecruitersManager` method, using `SMARTRECRUITERS_MANAGER_IMPORT`) — this is a
  hard repo rule, never add one without the other.
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
      documented endpoint today), `SMARTRECRUITERS_MANAGER_IMPORT` in compileUtils.ts
      (no functionLibrarySmartRecruiters.ts layer — see Architecture above), index.ts
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
- [x] **Phase 4 — Job Applications** (done 2026-08-07): getJobApplication, deleteJobApplication.
      Job Applications live under a _separately-versioned sub-API_ on the same host —
      `https://api.smartrecruiters.com/job-applications-api/v202112/job-applications/{id}` — not
      the unversioned `/jobs`/`/candidates` paths the rest of this connector uses; confirmed
      against the live OpenAPI `servers` entry via a research subagent, not assumed from the other
      resources' shape. **"consent request/decision" was dropped from this phase's scope**: verified
      against live reference docs (`job-applicationsgetbyid-1`, `job-applicationsdeletebyid`,
      `candidatesconsentrequestbatch-1`, `candidatesconsentstatus-1`, `candidatesconsentdecisions-1`)
      that SmartRecruiters has no job-application-scoped consent resource at all — consent-request/
      status/decisions only exist at the _candidate_ level (`/candidates/consent-requests`,
      `/candidates/{id}/consent`, `/candidates/{id}/consents`), which Phase 3 already covered in
      full (requestCandidateConsent, getCandidateConsentStatus, getCandidateConsentDecisions). Same
      kind of scope correction as the Phase 3 EEO drop — this phase title assumed a resource the API
      doesn't actually expose. If a job-application-scoped consent flow is ever needed, it has to go
      through the candidate id (available via a job application's `profileId` field), not a
      dedicated endpoint. Verified: tsc clean, prettier clean.
- [x] **Phase 5 — Users & Access** (done 2026-08-07): searchUsers (`user-api/v201804/users`,
      `nextPageId`-based pagination like Candidates), createUser, getUser, updateUser (RFC 6902
      JSON Patch array via `application/json-patch+json` — NOT a merge-patch object like
      patchJob/updateCandidate), resetUserPassword (only triggers a reset email, no
      set-password-directly endpoint exists), sendUserActivationEmail, activateUser,
      deactivateUser (the older `DELETE /users/{id}` is a documented deprecated alias for this,
      not added separately), updateUserAvatar (multipart file upload, reused the Phase 3
      `buildFileFormData` helper), listSystemRoles, and access groups: listAccessGroups/
      createAccessGroup/getAccessGroup/updateAccessGroup/deleteAccessGroup (all via the newer
      `configuration/access-groups` sub-API, chosen over the legacy `user-api/v201804/access-groups`
      list-only endpoint so the CRUD set is one consistent resource), assignUsersToAccessGroup/
      removeUserFromAccessGroup (these membership operations only exist under the legacy
      `user-api/v201804/access-groups/{id}/users` path, not under `configuration` — confirmed via
      two live-docs research passes since the two access-group resource families overlap).
      **"me" was dropped from scope**: two research passes against live developers.smartrecruiters.com
      reference docs found no documented get-current-user endpoint — same kind of scope
      correction as the Phase 3 EEO drop and Phase 4 consent drop. User/systemRole bodies stay
      JSON-string pins (not enums/structs): `systemRole` is a company-defined `{id, name}`
      reference, not a fixed enum — confirmed live docs explicitly state companies can define
      custom system roles, so no enum was added for it; call listSystemRoles() to discover the
      real ids instead. No new enums this phase. Endpoint shapes verified via two research
      subagent passes against live docs (a first pass found conflicting path prefixes across
      reference pages; a second pass resolved it — the docs render endpoint paths relative to a
      selectable server base, not an inconsistency). Verified: tsc clean, prettier clean.
- [x] **Phase 6 — Interviews & Events** (done 2026-08-07): searchInterviews/createInterview/
      getInterview/updateInterview/deleteInterview (`interviews-api/v201904/interviews` — update/
      delete are documented as supported only for interviews created via the Public API);
      listInterviewTypes/addInterviewTypes/deleteInterviewType (`interview-types` is a flat list of
      strings, not objects with ids — addInterviewTypes is additive/PATCH, no full-replace endpoint
      exists, and delete uses the name itself as the path segment); timeslots nested under an
      interview — createInterviewTimeslot/getInterviewTimeslot/updateInterviewTimeslot/
      deleteInterviewTimeslot/setInterviewTimeslotNoShow (no standalone timeslot search — always
      interview-scoped; delete 409s on an interview's last timeslot); status sub-resources —
      updateInterviewCandidateStatus (deprecated, interview-scoped, Public-API-only, kept for
      exhaustive coverage same as prior phases' deprecated variants), updateTimeslotCandidateStatus,
      updateTimeslotInterviewerStatus; getSchedulePreferences (`interview-templates/schedule/
      preferences/users/{userId}` — a third, separately-named sub-API). Events implemented as a full
      second family under `event-management-api`: createEvent/getEvent/updateEvent/deleteEvent,
      listJobEvents/getEventsForCandidate/getEventsForApplication, getEventSession/
      deleteEventSession (sessions have no standalone create/update — only via the parent event's
      `sessions` array), addSessionInterviewers/removeSessionInterviewers, getAllEventApplicants/
      getEventPoolApplicants/addApplicantsToEvent/addApplicantsToSession/moveApplicantsToSession.
      Self-Scheduling implemented as a third family under `self-scheduling`: searchSelfSchedules/
      getSelfSchedule/cancelSelfSchedule/getApplicationSelfSchedule/getSelfScheduleSlots/
      createSelfScheduleInterview/updateSelfScheduleInterview/getSelfScheduledInterview, plus the
      automated-self-schedule sub-family (createAutomatedSelfSchedule/
      updateAutomatedSelfScheduleInvite/requestAutomatedSelfReschedule/
      getAutomatedScheduleAvailableSlotsCount). **Interviews-api vs. event-management-api resolved
      as two genuinely separate, still-documented resource families** (not a Phase-5-style
      duplicate) — confirmed via two independent live-docs research passes: interviews-api is the
      older, narrower, timeslot/interviewer-status-centric family explicitly restricted to
      Public-API-created interviews for update/delete; event-management-api is the actively
      developed family (sessions, applicant pools, richer invitations/reminders) with its own
      changelog. Both were implemented in full rather than picking one. **Schedule preferences has
      no update endpoint** — only a documented GET exists, so it's read-only here, same kind of
      scope correction as the Phase 3 EEO drop / Phase 4 consent drop / Phase 5 "me" drop. Interview
      Templates CRUD (get/update/delete by id under `interview-templates`) was intentionally left
      out of this phase's scope — that's Phase 7's explicit subject ("Interview Templates"), so it
      wasn't duplicated here even though schedule preferences shares the same sub-API host. Added 3
      enums: attendee status (accepted/declined/pending/tentative, used by the interview/timeslot
      status endpoints), event state (PAST/ACTIVE, used by the events-list endpoints), self
      schedule type (INDIVIDUAL/GROUP, used by the automated-schedule slots-count endpoint).
      Interview/timeslot/event bodies stayed JSON-string pins (large/nested, mirrors Job/JobAd);
      id-array bodies (interview types, session interviewers, event/session applicants) used
      JSON-array pins mirroring Phase 3's candidate-tags pattern; small fixed-shape bodies (status
      updates, self-schedule interview time range, no-show flag) got discrete pins. Endpoint shapes
      verified against developers.smartrecruiters.com live reference docs via direct WebFetch of the
      `llms.txt` endpoint index plus ~35 individual `/reference/*.md` pages (not from training-data
      memory), cross-checked against an independent research subagent pass that reached the same
      endpoint list and the same interviews-api/event-management-api "two real families" conclusion.
      Verified: tsc clean, prettier clean.
- [x] **Phase 7 — Interview Templates** (done 2026-08-07): company-level template CRUD has a
      genuine "new" (`/templates`) and "deprecated" (`/interview/templates`) family — unlike the
      false EEO/consent/"me" assumptions in Phases 3-5, both are still live and documented, with
      the deprecated endpoints carrying literal "use GET/PUT/DELETE /public-api/templates/{id}
      instead" migration notices — so both were implemented: searchInterviewTemplates/
      createInterviewTemplate/getInterviewTemplate/updateInterviewTemplate/
      deleteInterviewTemplate (new) and searchInterviewTemplatesDeprecated/
      getInterviewTemplateDeprecated/updateInterviewTemplateDeprecated/
      deleteInterviewTemplateDeprecated (deprecated; response shape differs materially —
      durationInMinutes/format/location instead of slotSetup/templateType — and the list field is
      `content` singular vs. the new endpoint's `contents`). Job managed steps
      (getJobManagedSteps/updateJobManagedSteps, `managed-steps/jobs/{jobId}`) control whether a
      hiring stage/step requires a template assignment. Job-level templates mirror the same
      new/deprecated split: updateJobInterviewTemplateDeprecated/
      updateJobInterviewTemplateInterviewersDeprecated/getJobInterviewTemplatesDeprecated/
      getJobApplicationInterviewTemplateDeprecated (deprecated, `interview/templates/job...`) vs.
      updateJobTemplate/updateJobTemplateInterviewers/findJobTemplateByHiringStage/
      upsertJobTemplate/findJobTemplatesByJobId/findJobTemplateByApplicationId (new,
      `job-templates/...`). **"Search by job ids" (plural, batched) does not exist** — verified via
      live docs, same kind of scope correction as Phases 3-5's dropped assumptions; the only batch
      endpoint in this area is searchJobTemplatesByApplicationIds
      (`POST job-templates/jobs/{jobId}/search`), which is scoped to a single job (path param) and
      batches by *application* ids (body), not job ids. Template/managed-step bodies stayed
      JSON-string pins (nested slotSetup/invitations/reminders, mirrors Job/Interview); hiring
      stage got a dedicated enum (NEW/IN_PROGRESS/INTERVIEW/OFFER) since it's a small fixed set
      distinct from the job-status enum; template type (INDIVIDUAL/GROUP) got its own enum despite
      sharing values with Phase 6's self-schedule-type enum, since it's conceptually a different
      resource's field. Added 2 enums. Endpoint shapes verified against
      developers.smartrecruiters.com live reference docs via a research subagent (WebFetch of the
      endpoint index plus individual `/reference/*.md` pages), not from training-data memory.
      Verified: tsc clean, prettier clean.
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
