import { GithubManager, type GithubAuth } from "../lib/githubManager.ts";

/** Compile-time-only counterpart of nodes/github.ts's execute() vault lookup
 * (resolveGithubCredential) — the compiled/deployed script has no access to the Credential Vault
 * database, only the interpreter does, so it reads the same credential's fields from environment
 * variables instead, keyed by the `_CREDENTIAL_TYPE` suffix credentialEnv.ts's
 * applyCredentialEnvVars also writes (GitHub, like Jira, has more than one credential shape:
 * personal access token vs. GitHub App). Never called by the interpreter — genuinely different
 * credential-sourcing behavior, not duplicated logic.
 *
 * Kept in its own file, separate from functionLibrary.ts, purely to mirror
 * functionLibraryJira.ts/functionLibrarySftp.ts's one-node-family-per-file convention. */
export function githubCredentialFromEnv(name: string): { ok: true; auth: GithubAuth } | { ok: false; error: string } {
  const prefix = `HERMIONE_CRED_${String(name)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")}`;
  const type = process.env[`${prefix}_CREDENTIAL_TYPE`];
  if (type === "githubToken") {
    return { ok: true, auth: { token: process.env[`${prefix}_TOKEN`] || "" } };
  }
  if (type === "githubApp") {
    return {
      ok: true,
      auth: {
        appId: process.env[`${prefix}_APP_ID`] || "",
        privateKey: process.env[`${prefix}_PRIVATE_KEY`] || "",
        installationId: process.env[`${prefix}_INSTALLATION_ID`] || "",
      },
    };
  }
  return { ok: false, error: `Credential "${name}" not found in the vault, or is not a GitHub Token/App credential` };
}

export async function githubListIssues(credentialName: string, owner: string, repo: string, state: "open" | "closed" | "all") {
  const cred = githubCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, issues: [], error: cred.error };
  return GithubManager.forAuth(cred.auth).listIssues(owner, repo, state);
}

export async function githubCreateIssue(credentialName: string, owner: string, repo: string, title: string, body: string) {
  const cred = githubCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, number: 0, url: "", error: cred.error };
  return GithubManager.forAuth(cred.auth).createIssue(owner, repo, title, body);
}

export async function githubCommentOnIssue(credentialName: string, owner: string, repo: string, issueNumber: number, body: string) {
  const cred = githubCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, error: cred.error };
  return GithubManager.forAuth(cred.auth).commentOnIssue(owner, repo, issueNumber, body);
}

export async function githubListPullRequests(credentialName: string, owner: string, repo: string, state: "open" | "closed" | "all") {
  const cred = githubCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, pullRequests: [], error: cred.error };
  return GithubManager.forAuth(cred.auth).listPullRequests(owner, repo, state);
}

export async function githubCreatePullRequest(credentialName: string, owner: string, repo: string, title: string, head: string, base: string, body: string) {
  const cred = githubCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, number: 0, url: "", error: cred.error };
  return GithubManager.forAuth(cred.auth).createPullRequest(owner, repo, title, head, base, body);
}

export async function githubMergePullRequest(credentialName: string, owner: string, repo: string, pullNumber: number, mergeMethod: "merge" | "squash" | "rebase") {
  const cred = githubCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, merged: false, sha: "", error: cred.error };
  return GithubManager.forAuth(cred.auth).mergePullRequest(owner, repo, pullNumber, mergeMethod);
}

export async function githubGetFileContent(credentialName: string, owner: string, repo: string, path: string, ref: string) {
  const cred = githubCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, content: "", sha: "", error: cred.error };
  return GithubManager.forAuth(cred.auth).getFileContent(owner, repo, path, ref || undefined);
}

export async function githubCreateOrUpdateFile(credentialName: string, owner: string, repo: string, path: string, content: string, message: string, branch: string, sha: string) {
  const cred = githubCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, sha: "", commitSha: "", error: cred.error };
  return GithubManager.forAuth(cred.auth).createOrUpdateFile(owner, repo, path, content, message, branch || undefined, sha || undefined);
}

export async function githubRequest(credentialName: string, route: string, paramsJson: string) {
  const cred = githubCredentialFromEnv(credentialName);
  if (!cred.ok) return { success: false, data: null, error: cred.error };
  const rawParams = String(paramsJson ?? "").trim();
  let params: Record<string, unknown> | undefined;
  try {
    params = rawParams ? JSON.parse(rawParams) : undefined;
  } catch (err) {
    return { success: false, data: null, error: err instanceof Error ? err.message : String(err) };
  }
  return GithubManager.forAuth(cred.auth).request(route, params);
}
