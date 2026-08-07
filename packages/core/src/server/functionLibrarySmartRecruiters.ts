import { SmartRecruitersManager, type SmartRecruitersAuth } from "../lib/smartRecruitersManager.ts";

/** Compile-time-only counterpart of nodes/smartRecruiters.ts's execute() vault lookup
 * (resolveSmartRecruitersCredential) — the compiled/deployed script has no access to the
 * Credential Vault database, only the interpreter does, so it reads the same credential's fields
 * from environment variables instead, keyed by the `_CREDENTIAL_TYPE` suffix credentialEnv.ts's
 * applyCredentialEnvVars also writes (SmartRecruiters, like GitHub/Jira, has more than one
 * credential shape: API key vs. OAuth2 client credentials). Never called by the interpreter —
 * genuinely different credential-sourcing behavior, not duplicated logic. */
export function smartRecruitersCredentialFromEnv(name: string): { ok: true; auth: SmartRecruitersAuth } | { ok: false; error: string } {
  const prefix = `HERMIONE_CRED_${String(name)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")}`;
  const type = process.env[`${prefix}_CREDENTIAL_TYPE`];
  if (type === "smartRecruitersApiKey") {
    return { ok: true, auth: { kind: "apiKey", apiKey: process.env[`${prefix}_API_KEY`] || "" } };
  }
  if (type === "smartRecruitersOAuth2ClientCredentials") {
    return {
      ok: true,
      auth: {
        kind: "oauth2",
        clientId: process.env[`${prefix}_CLIENT_ID`] || "",
        clientSecret: process.env[`${prefix}_CLIENT_SECRET`] || "",
        tokenUrl: process.env[`${prefix}_TOKEN_URL`] || "",
      },
    };
  }
  return { ok: false, error: `Credential "${name}" not found in the vault, or is not a SmartRecruiters API Key/OAuth2 credential` };
}

export async function smartRecruitersApiCall(credentialName: string, method: string, path: string, queryJson: string, bodyJson: string) {
  const cred = smartRecruitersCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, status: 0, dataJson: "", error: cred.error };
  let query: Record<string, string> = {};
  try {
    query = queryJson ? JSON.parse(queryJson) : {};
  } catch {
    return { success: false, status: 0, dataJson: "", error: "queryJson is not valid JSON" };
  }
  let body: unknown;
  try {
    body = bodyJson ? JSON.parse(bodyJson) : undefined;
  } catch {
    return { success: false, status: 0, dataJson: "", error: "bodyJson is not valid JSON" };
  }
  return SmartRecruitersManager.forAuth(cred.auth).apiCall(method, path, query, body);
}

// --- Jobs core (Phase 1) -------------------------------------------------------------------

function parseJsonRecord(json: string, label: string): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  try {
    const parsed = json ? JSON.parse(json) : {};
    return { ok: true, value: parsed && typeof parsed === "object" ? parsed : {} };
  } catch {
    return { ok: false, error: `${label} is not valid JSON` };
  }
}

export async function smartRecruitersSearchJobs(credentialName: string, queryJson: string, offset: number, limit: number) {
  const cred = smartRecruitersCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, jobs: [], totalFound: 0, offset: 0, limit: 0, error: cred.error };
  const parsedQuery = parseJsonRecord(queryJson, "queryJson");
  if (!parsedQuery.ok) return { success: false, jobs: [], totalFound: 0, offset: 0, limit: 0, error: parsedQuery.error };
  return SmartRecruitersManager.forAuth(cred.auth).searchJobs({ ...parsedQuery.value, offset, limit });
}

export async function smartRecruitersCreateJob(credentialName: string, jobJson: string) {
  const cred = smartRecruitersCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, job: {}, error: cred.error };
  const parsed = parseJsonRecord(jobJson, "jobJson");
  if (!parsed.ok) return { success: false, job: {}, error: parsed.error };
  return SmartRecruitersManager.forAuth(cred.auth).createJob(parsed.value);
}

export async function smartRecruitersGetJob(credentialName: string, jobId: string) {
  const cred = smartRecruitersCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, job: {}, error: cred.error };
  return SmartRecruitersManager.forAuth(cred.auth).getJob(jobId);
}

export async function smartRecruitersPatchJob(credentialName: string, jobId: string, patchJson: string) {
  const cred = smartRecruitersCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, job: {}, error: cred.error };
  const parsed = parseJsonRecord(patchJson, "patchJson");
  if (!parsed.ok) return { success: false, job: {}, error: parsed.error };
  return SmartRecruitersManager.forAuth(cred.auth).patchJob(jobId, parsed.value);
}

export async function smartRecruitersUpdateJobStatus(credentialName: string, jobId: string, status: string) {
  const cred = smartRecruitersCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, job: {}, error: cred.error };
  return SmartRecruitersManager.forAuth(cred.auth).updateJobStatus(jobId, status);
}

export async function smartRecruitersGetJobStatusHistory(credentialName: string, jobId: string) {
  const cred = smartRecruitersCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, history: [], error: cred.error };
  return SmartRecruitersManager.forAuth(cred.auth).getJobStatusHistory(jobId);
}

export async function smartRecruitersGetLatestApprovalRequest(credentialName: string, jobId: string) {
  const cred = smartRecruitersCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, approval: {}, error: cred.error };
  return SmartRecruitersManager.forAuth(cred.auth).getLatestApprovalRequest(jobId);
}

export async function smartRecruitersUpdateHeadcount(credentialName: string, jobId: string, headcount: number) {
  const cred = smartRecruitersCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, job: {}, error: cred.error };
  return SmartRecruitersManager.forAuth(cred.auth).updateHeadcount(jobId, headcount);
}

export async function smartRecruitersGetJobNote(credentialName: string, jobId: string) {
  const cred = smartRecruitersCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, note: {}, error: cred.error };
  return SmartRecruitersManager.forAuth(cred.auth).getJobNote(jobId);
}

export async function smartRecruitersUpdateJobNote(credentialName: string, jobId: string, content: string) {
  const cred = smartRecruitersCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, note: {}, error: cred.error };
  return SmartRecruitersManager.forAuth(cred.auth).updateJobNote(jobId, content);
}
