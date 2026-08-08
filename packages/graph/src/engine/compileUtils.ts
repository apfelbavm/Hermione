/** Indents each line by `spaces` spaces — used when a node's compileExecute nests another block's statements (if/else, loops). */
export function indent(lines: string[], spaces = 2): string[] {
  const pad = " ".repeat(spaces);
  return lines.map((line) => pad + line);
}

/** Shared `delay` helper snippet — any latent node that just needs to wait can contribute this exact source under the name "delay", so the compiler dedupes it across the whole generated file instead of emitting near-duplicate helpers. */
export const DELAY_HELPER_SOURCE = "function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }";

/** A stable, valid-JS-identifier local variable name for a given node instance's compileExecute
 * result — shared by a node's own compileExecute (which declares it) and its compileExecuteOutputs
 * (which references it), so the two independently produce the exact same name for the same node
 * without needing to pass anything between them. Node ids aren't guaranteed to be valid identifiers
 * on their own (e.g. "node-10-ngq47l" contains hyphens). */
export function compileResultVar(nodeId: string): string {
  return `__result_${nodeId.replace(/[^a-zA-Z0-9_]/g, "_")}`;
}

/** Real ESM import of src/server/functionLibrary.ts, the single shared home for every node type's
 * actual runtime logic — every node's compileImports contributes this exact same string, so
 * codegen.ts's plain string-equality dedup collapses it to one import line for the whole compiled
 * file no matter how many distinct nodes/functions are used from it. The relative path assumes a
 * deployed script always lives at data/deployed-scripts/<flowId>.mjs (see server/deployedScriptFile.ts).
 * Resolving this at runtime with no separate build step requires the running Node process to have
 * NODE_OPTIONS=--experimental-strip-types set (see package.json's dev/start scripts). */
export const FUNCTION_LIBRARY_IMPORT = 'import * as functionLibrary from "../../packages/core/src/server/functionLibrary.ts";';

/** Sibling of FUNCTION_LIBRARY_IMPORT for src/server/functionLibrarySftp.ts — kept in its own file
 * (and its own compileImports entry) rather than folded into functionLibrary.ts because it depends
 * on "ssh2-sftp-client", a package deliberately NOT installed for the interpreter/browser build (see
 * that file's own header comment) — no interpreter-facing code may ever import it directly. */
export const FUNCTION_LIBRARY_SFTP_IMPORT = 'import * as functionLibrarySftp from "../../packages/core/src/server/functionLibrarySftp.ts";';

/** Sibling of FUNCTION_LIBRARY_IMPORT for src/server/functionLibraryJira.ts — kept in its own file
 * purely to mirror functionLibrarySftp.ts's one-node-family-per-file convention (see nodes/jira.ts). */
export const JIRA_MANAGER_IMPORT = 'import { JiraManager } from "../../packages/core/src/lib/jiraManager.ts";';

export const DROPBOX_MANAGER_IMPORT = 'import { DropboxManager } from "../../packages/core/src/lib/dropboxManager.ts";';

/** GraphManager (packages/core/src/lib/graphManager.ts) resolves its own credentials straight from
 * the database (see its findCredential), so both the interpreter and the compiled/deployed script
 * call the exact same manager methods directly instead of going through a separate env-var-reading
 * layer — mirrors TWILIO_MANAGER_IMPORT. */
export const MICROSOFT365_MANAGER_IMPORT = 'import { GraphManager } from "../../packages/core/src/lib/graphManager.ts";';

/** Sibling of FUNCTION_LIBRARY_IMPORT for each new enterprise connector's own functionLibrary file —
 * same one-node-family-per-file convention as above (see nodes/slack.ts, nodes/stripe.ts, etc.). */
export const SLACK_MANAGER_IMPORT = 'import { SlackManager } from "../../packages/core/src/lib/slackManager.ts";';
/** Unlike every other provider (besides Twilio), Stripe has no functionLibraryStripe.ts of its own —
 * StripeManager (packages/core/src/lib/stripeManager.ts) resolves its own credentials straight from
 * the database (see its findCredential), so both the interpreter and the compiled/deployed script
 * call the exact same manager methods directly instead of going through a separate env-var-reading
 * layer. */
export const STRIPE_MANAGER_IMPORT = 'import { StripeManager } from "../../packages/core/src/lib/stripeManager.ts";';
export const SALESFORCE_MANAGER_IMPORT = 'import { SalesforceManager } from "../../packages/core/src/lib/salesforceManager.ts";';
/** Unlike most other providers, Workday has no functionLibraryWorkday.ts of its own — WorkdayManager
 * (packages/core/src/lib/workdayManager.ts) resolves its own credentials straight from the database
 * (see its findCredential), so both the interpreter and the compiled/deployed script call the
 * exact same manager methods directly instead of going through a separate env-var-reading layer. */
export const WORKDAY_MANAGER_IMPORT = 'import { WorkdayManager } from "../../packages/core/src/lib/workdayManager.ts";';
/** Unlike every other provider, Twilio has no functionLibrary<Provider>.ts of its own — TwilioManager
 * (packages/core/src/lib/twilioManager.ts) resolves its own credentials straight from the database
 * (see its resolveCredential), so both the interpreter and the compiled/deployed script call the
 * exact same manager methods directly instead of going through a separate env-var-reading layer. */
export const TWILIO_MANAGER_IMPORT = 'import { TwilioManager } from "../../packages/core/src/lib/twilioManager.ts";';
export const SMTP_MANAGER_IMPORT = 'import { SmtpManager } from "../../packages/core/src/lib/smtpManager.ts";';
export const SAP_MANAGER_IMPORT = 'import { SapManager } from "../../packages/core/src/lib/sapManager.ts";';
export const LINKEDIN_MANAGER_IMPORT = 'import { LinkedInManager } from "../../packages/core/src/lib/linkedinManager.ts";';
export const SENDGRID_MANAGER_IMPORT = 'import { SendGridManager } from "../../packages/core/src/lib/sendGridManager.ts";';

export const GITHUB_MANAGER_IMPORT = 'import { GithubManager } from "../../packages/core/src/lib/githubManager.ts";';

/** Unlike every other provider, Google has no single functionLibraryGoogle.ts of its own anymore —
 * each of these six lib/google*Manager.ts classes resolves its own credentials straight from the
 * database (see each one's findCredential), so both the interpreter and the compiled/deployed
 * script call the exact same manager methods directly instead of going through a separate
 * env-var-reading layer. Mirrors TWILIO_MANAGER_IMPORT/FACEBOOK_MANAGER_IMPORT. */
export const GOOGLE_ADMIN_MANAGER_IMPORT = 'import { GoogleAdminManager } from "../../packages/core/src/lib/googleAdminManager.ts";';
export const GOOGLE_CALENDAR_MANAGER_IMPORT = 'import { GoogleCalendarManager } from "../../packages/core/src/lib/googleCalendarManager.ts";';
export const GOOGLE_DOCS_MANAGER_IMPORT = 'import { GoogleDocsManager } from "../../packages/core/src/lib/googleDocsManager.ts";';
export const GOOGLE_DRIVE_MANAGER_IMPORT = 'import { GoogleDriveManager } from "../../packages/core/src/lib/googleDriveManager.ts";';
export const GOOGLE_GMAIL_MANAGER_IMPORT = 'import { GoogleGmailManager } from "../../packages/core/src/lib/googleGmailManager.ts";';
export const GOOGLE_SHEETS_MANAGER_IMPORT = 'import { GoogleSheetsManager } from "../../packages/core/src/lib/googleSheetsManager.ts";';
/** google.authorize is the one Google node that isn't a per-service manager method — it exchanges
 * an OAuth2 credential's staging authCode for a refresh token via googleAuthManager.ts's own
 * credentialName-taking `authorize` export (see that file). */
export const GOOGLE_AUTH_MANAGER_IMPORT = 'import { authorize as googleAuthorize } from "../../packages/core/src/lib/googleAuthManager.ts";';

/** Unlike every other provider, Facebook has no functionLibrary<Provider>.ts of its own — FacebookManager
 * (packages/core/src/lib/facebookManager.ts) resolves its own credentials straight from the database
 * (see its findCredential), so both the interpreter and the compiled/deployed script call the
 * exact same manager methods directly instead of going through a separate env-var-reading layer. */
export const FACEBOOK_MANAGER_IMPORT = 'import { FacebookManager } from "../../packages/core/src/lib/facebookManager.ts";';

/** Sibling of FUNCTION_LIBRARY_IMPORT for src/server/functionLibraryAzureStorage.ts — kept in its
 * own file purely to mirror functionLibrarySftp.ts's one-node-family-per-file convention (see
 * nodes/azureStorage.ts). */
export const AZURE_STORAGE_MANAGER_IMPORT = 'import { AzureStorageManager } from "../../packages/core/src/lib/azureStorageManager.ts";';

/** Sibling of FUNCTION_LIBRARY_IMPORT for src/server/functionLibrarySoap.ts — kept in its own file
 * purely to mirror functionLibrarySftp.ts's one-node-family-per-file convention (see nodes/soap.ts). */
export const FUNCTION_LIBRARY_SOAP_IMPORT = 'import * as functionLibrarySoap from "../../packages/core/src/server/functionLibrarySoap.ts";';

/** Sibling of FUNCTION_LIBRARY_IMPORT for src/server/functionLibraryAwsDynamoDb.ts — kept in its own
 * file purely to mirror functionLibrarySftp.ts's one-node-family-per-file convention (see
 * nodes/AwsdynamoDb.ts). */
export const DYNAMODB_MANAGER_IMPORT = 'import { DynamoDbManager } from "../../packages/core/src/lib/dynamoDbManager.ts";';

/** Sibling of FUNCTION_LIBRARY_IMPORT for src/server/functionLibraryAwsKinesis.ts — kept in its own
 * file purely to mirror functionLibrarySftp.ts's one-node-family-per-file convention (see
 * nodes/Awskinesis.ts). */
export const KINESIS_MANAGER_IMPORT = 'import { KinesisManager } from "../../packages/core/src/lib/kinesisManager.ts";';

/** Sibling of FUNCTION_LIBRARY_IMPORT for src/server/functionLibraryMongo.ts — kept in its own
 * file purely to mirror functionLibrarySftp.ts's one-node-family-per-file convention (see
 * nodes/mongo.ts). */
export const MONGO_MANAGER_IMPORT = 'import { MongoManager } from "../../packages/core/src/lib/mongoManager.ts";';

/** Sibling of FUNCTION_LIBRARY_IMPORT for src/server/functionLibrarySmartRecruiters.ts — kept in
 * its own file purely to mirror functionLibrarySftp.ts's one-node-family-per-file convention (see
 * nodes/smartRecruiters.ts). */
export const FUNCTION_LIBRARY_SMARTRECRUITERS_IMPORT = 'import * as functionLibrarySmartRecruiters from "../../packages/core/src/server/functionLibrarySmartRecruiters.ts";';

/** Sibling of FUNCTION_LIBRARY_IMPORT for src/server/executeDeployedFlow.ts — used by
 * flow.executeFlow's compileExecute (see nodes/flow.ts) so a deployed flow's own "Execute Flow"
 * node dynamic-imports the target Flow's DEPLOYED script exactly the same way the interpreter's
 * ExecutionContext.executeFlow hook does (see api/simulate/route.ts), instead of duplicating that
 * DB-lookup/dynamic-import logic inline in generated code. */
export const EXECUTE_FLOW_IMPORT = 'import { executeDeployedFlow } from "../../packages/core/src/server/executeDeployedFlow.ts";';
