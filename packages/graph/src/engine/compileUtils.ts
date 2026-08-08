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
export const FUNCTION_LIBRARY_JIRA_IMPORT = 'import * as functionLibraryJira from "../../packages/core/src/server/functionLibraryJira.ts";';

/** Sibling of FUNCTION_LIBRARY_IMPORT for src/server/functionLibraryDropbox.ts — kept in its own file
 * purely to mirror functionLibrarySftp.ts's one-node-family-per-file convention (see nodes/dropbox.ts). */
export const FUNCTION_LIBRARY_DROPBOX_IMPORT = 'import * as functionLibraryDropbox from "../../packages/core/src/server/functionLibraryDropbox.ts";';

/** Sibling of FUNCTION_LIBRARY_IMPORT for src/server/functionLibraryMicrosoft365.ts — kept in its own
 * file purely to mirror functionLibrarySftp.ts's one-node-family-per-file convention (see nodes/microsoft365.ts). */
export const FUNCTION_LIBRARY_MICROSOFT365_IMPORT = 'import * as functionLibraryMicrosoft365 from "../../packages/core/src/server/functionLibraryMicrosoft365.ts";';

/** Sibling of FUNCTION_LIBRARY_IMPORT for each new enterprise connector's own functionLibrary file —
 * same one-node-family-per-file convention as above (see nodes/slack.ts, nodes/stripe.ts, etc.). */
export const FUNCTION_LIBRARY_SLACK_IMPORT = 'import * as functionLibrarySlack from "../../packages/core/src/server/functionLibrarySlack.ts";';
/** Unlike every other provider (besides Twilio), Stripe has no functionLibraryStripe.ts of its own —
 * StripeManager (packages/core/src/lib/stripeManager.ts) resolves its own credentials straight from
 * the database (see its findCredential), so both the interpreter and the compiled/deployed script
 * call the exact same manager methods directly instead of going through a separate env-var-reading
 * layer. */
export const STRIPE_MANAGER_IMPORT = 'import { StripeManager } from "../../packages/core/src/lib/stripeManager.ts";';
export const FUNCTION_LIBRARY_SALESFORCE_IMPORT = 'import * as functionLibrarySalesforce from "../../packages/core/src/server/functionLibrarySalesforce.ts";';
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
export const FUNCTION_LIBRARY_LINKEDIN_IMPORT = 'import * as functionLibraryLinkedIn from "../../packages/core/src/server/functionLibraryLinkedIn.ts";';
export const FUNCTION_LIBRARY_SENDGRID_IMPORT = 'import * as functionLibrarySendGrid from "../../packages/core/src/server/functionLibrarySendGrid.ts";';

/** Sibling of FUNCTION_LIBRARY_IMPORT for src/server/functionLibraryGithub.ts — kept in its own file
 * purely to mirror functionLibrarySftp.ts's one-node-family-per-file convention (see nodes/github.ts). */
export const FUNCTION_LIBRARY_GITHUB_IMPORT = 'import * as functionLibraryGithub from "../../packages/core/src/server/functionLibraryGithub.ts";';

/** Sibling of FUNCTION_LIBRARY_IMPORT for src/server/functionLibraryGoogle.ts — kept in its own file
 * purely to mirror functionLibrarySftp.ts's one-node-family-per-file convention (see nodes/google.ts). */
export const FUNCTION_LIBRARY_GOOGLE_IMPORT = 'import * as functionLibraryGoogle from "../../packages/core/src/server/functionLibraryGoogle.ts";';

/** Unlike every other provider, Facebook has no functionLibrary<Provider>.ts of its own — FacebookManager
 * (packages/core/src/lib/facebookManager.ts) resolves its own credentials straight from the database
 * (see its findCredential), so both the interpreter and the compiled/deployed script call the
 * exact same manager methods directly instead of going through a separate env-var-reading layer. */
export const FACEBOOK_MANAGER_IMPORT = 'import { FacebookManager } from "../../packages/core/src/lib/facebookManager.ts";';

/** Sibling of FUNCTION_LIBRARY_IMPORT for src/server/functionLibraryAzureStorage.ts — kept in its
 * own file purely to mirror functionLibrarySftp.ts's one-node-family-per-file convention (see
 * nodes/azureStorage.ts). */
export const FUNCTION_LIBRARY_AZURE_STORAGE_IMPORT = 'import * as functionLibraryAzureStorage from "../../packages/core/src/server/functionLibraryAzureStorage.ts";';

/** Sibling of FUNCTION_LIBRARY_IMPORT for src/server/functionLibrarySoap.ts — kept in its own file
 * purely to mirror functionLibrarySftp.ts's one-node-family-per-file convention (see nodes/soap.ts). */
export const FUNCTION_LIBRARY_SOAP_IMPORT = 'import * as functionLibrarySoap from "../../packages/core/src/server/functionLibrarySoap.ts";';

/** Sibling of FUNCTION_LIBRARY_IMPORT for src/server/functionLibraryAwsDynamoDb.ts — kept in its own
 * file purely to mirror functionLibrarySftp.ts's one-node-family-per-file convention (see
 * nodes/AwsdynamoDb.ts). */
export const FUNCTION_LIBRARY_DYNAMODB_IMPORT = 'import * as functionLibraryDynamoDb from "../../packages/core/src/server/functionLibraryAwsDynamoDb.ts";';

/** Sibling of FUNCTION_LIBRARY_IMPORT for src/server/functionLibraryAwsKinesis.ts — kept in its own
 * file purely to mirror functionLibrarySftp.ts's one-node-family-per-file convention (see
 * nodes/Awskinesis.ts). */
export const FUNCTION_LIBRARY_KINESIS_IMPORT = 'import * as functionLibraryKinesis from "../../packages/core/src/server/functionLibraryAwsKinesis.ts";';

/** Sibling of FUNCTION_LIBRARY_IMPORT for src/server/functionLibraryMongo.ts — kept in its own
 * file purely to mirror functionLibrarySftp.ts's one-node-family-per-file convention (see
 * nodes/mongo.ts). */
export const FUNCTION_LIBRARY_MONGO_IMPORT = 'import * as functionLibraryMongo from "../../packages/core/src/server/functionLibraryMongo.ts";';

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
