import { PageShell } from "../../components/PageHeader";
import { Breadcrumbs } from "../../components/Breadcrumbs";
import { i18n } from "@i18n";

interface TocEntry {
  id: string;
  label: string;
  sub?: boolean;
}

const TOC: TocEntry[] = [
  { id: "overview", label: "Overview" },
  { id: "top-level-layout", label: "Top-level layout" },
  { id: "graph-internals", label: "graph internals", sub: true },
  { id: "graph", label: "How the graph works" },
  { id: "graph-canvas", label: "Canvas basics", sub: true },
  { id: "graph-pins", label: "Pins & wiring", sub: true },
  { id: "graph-execution", label: "Execution model", sub: true },
  { id: "graph-special-nodes", label: "Variables, functions & events", sub: true },
  { id: "graph-compiler", label: "The compiler", sub: true },
  { id: "execution-paths", label: "Two execution paths" },
  { id: "data-persistence", label: "Data & persistence" },
  { id: "user-sign-in", label: "User sign-in" },
  { id: "credential-vault", label: "Credential Vault" },
  { id: "credential-runtime", label: "Credentials at runtime", sub: true },
  { id: "oauth-node-types", label: "OAuth / auth node types", sub: true },
  { id: "integrations", label: "Integrations / connectors" },
  { id: "adding-integration", label: "Adding a new integration", sub: true },
  { id: "browser-stubs", label: "Browser-side SDK stubs", sub: true },
  { id: "conventions", label: "Conventions" },
];

/** Human-facing overview of how Hermione is put together — a prose companion to docs/*.md, with
 * a right-hand table of contents (see PageShell's `aside` prop) so long-form reading doesn't
 * require the sidebar-driven main nav. */
export default function DocsPage() {
  return (
    <PageShell contentClassName="docs-content" aside={<DocsToc />}>
      <Breadcrumbs items={[{ label: i18n.pages.docs.page_title }]} />
      <h1>{i18n.pages.docs.page_title}</h1>
      <p className="page-empty-note">{i18n.pages.docs.description}</p>

      <section id="overview" className="docs-section">
        <h2>Overview</h2>
        <p>Hermione is a visual node-graph flow builder: you wire up nodes on a canvas, run them directly against live services (Emulate/Simulate), or compile a flow into a standalone script that gets deployed and later triggered on its own (a webhook, a schedule, another flow calling it).</p>
      </section>

      <section id="top-level-layout" className="docs-section">
        <h2>Top-level layout</h2>
        <ul>
          <li>
            <code>src/app</code> — Next.js App Router: pages (<code>projects/</code>, <code>emulate/</code>, <code>credential-vault/</code>, <code>logs/</code>, <code>docs/</code>, <code>ai-docs/</code>) and API routes (<code>api/emulate</code>, <code>api/simulate</code>,{" "}
            <code>api/hooks/[projectId]/[flowId]</code>, <code>api/credentials</code>, <code>api/projects</code>, <code>api/runs</code>).
          </li>
          <li>
            <code>src/graph</code> — the visual node-graph editor plus two execution paths (interpreter and compiler). See below.
          </li>
          <li>
            <code>src/server</code> — DB access, deployed-flow execution, and the one shared home for node runtime logic.
          </li>
          <li>
            <code>src/lib</code> — thin wrappers around each 3rd-party provider&apos;s SDK/API client (one file per provider).
          </li>
          <li>
            <code>src/credentials</code> — credential type registry (field defs) plus shared client-safe types.
          </li>
          <li>
            <code>src/client</code>, <code>src/components</code>, <code>src/state</code>, <code>src/hooks</code>, <code>src/styles</code> — editor UI (React) and its state store.
          </li>
          <li>
            <code>data/deployed-scripts/*.mjs</code> — compiled output of a Flow, deployed and run standalone via <code>executeDeployedFlow</code>.
          </li>
          <li>
            <code>scripts/</code> — one-off/ad-hoc task scripts (not app code).
          </li>
          <li>
            <code>tests/</code> — all test files, mirroring <code>src/</code>&apos;s structure (never colocated with source).
          </li>
        </ul>

        <h3 id="graph-internals">graph internals</h3>
        <ul>
          <li>
            <code>engine/</code> — the interpreter: <code>Graph</code>, <code>NodeInstance</code>, <code>ExecutionContext</code>, <code>executor.ts</code> (walks the graph directly, node-by-node). Used by the Emulate/Simulate pages.
          </li>
          <li>
            <code>compiler/codegen.ts</code> — compiles a <code>Graph</code> into a standalone ESM script (a <code>CompileResult</code> with <code>code</code> plus a manifest of triggers/variables). Output lands in <code>data/deployed-scripts/</code>.
          </li>
          <li>
            <code>nodes/*.ts</code> — editor-only node type definitions (pins, UI, <code>registerNode</code>) for one category each (http, jira, google, dropbox, sftp, soap, auth, oauth2Saml, ...). Real runtime/HTTP logic never lives here.
          </li>
          <li>
            <code>interaction/</code> — canvas pointer/keyboard handling (drag, shortcuts).
          </li>
          <li>
            <code>overlay/</code> — canvas-adjacent UI widgets (tooltips, context menus, the script/code editor, search menu).
          </li>
          <li>
            <code>render/</code> — canvas drawing (grid, wires, nodes, comments, hit-testing, camera/layout math).
          </li>
          <li>
            <code>persistence/</code> — graph JSON <code>schema.ts</code>, <code>load.ts</code>, <code>save.ts</code>.
          </li>
          <li>
            <code>structs/</code>, <code>enum/</code> — per-provider struct/enum definitions surfaced as pin types (mirrors the provider list in <code>nodes/</code>).
          </li>
        </ul>
      </section>

      <section id="graph" className="docs-section">
        <h2>How the graph works</h2>
        <p>A Flow is a visual node graph, similar in spirit to Unreal Engine&apos;s Blueprints: you drop nodes onto a canvas, wire them together, and that wiring is both the program&apos;s logic and its persisted representation (saved as JSON, not source code).</p>

        <h3 id="graph-canvas">Canvas basics</h3>
        <ul>
          <li>
            Each open Flow is a <code>Graph</code> (<code>engine/graph.ts</code>): a flat list of <code>NodeInstance</code>s, their connections, the graph&apos;s <code>Variable</code>s, and any nested <code>FunctionDef</code> bodies (themselves small graphs of their own).
          </li>
          <li>
            <code>render/</code> draws the grid, nodes, wires, and comments straight onto a <code>&lt;canvas&gt;</code>; <code>interaction/</code> turns pointer/keyboard input into graph mutations (drag a node, draw a wire, delete a selection, box-select, etc.) via <code>graphMutations.ts</code>.
          </li>
          <li>
            Every node type is registered once, up front, in <code>engine/registry.ts</code> as a <code>NodeDef</code> (see <code>nodes/*.ts</code>) — the create-node search menu, tooltips, and the canvas itself all read from that same registry, so a new node type only has to be defined in one place
            to appear everywhere.
          </li>
        </ul>

        <h3 id="graph-pins">Pins & wiring</h3>
        <p>
          A node exposes typed <code>PinDef</code>s (<code>exec</code>, <code>number</code>, <code>boolean</code>, <code>string</code>, <code>object</code>, <code>date</code>, <code>enum</code>, <code>struct</code>), each either an input or an output, optionally a container (<code>array</code>/
          <code>set</code>/<code>map</code> of that type instead of a single value). Two pins can be wired together only when their types (and, for <code>enum</code>/<code>struct</code>, their exact registered subtype) are compatible.
        </p>
        <p>Pins come in two flavors that drive everything else about how a node behaves:</p>
        <ul>
          <li>
            <strong>Exec pins</strong> (<code>exec</code>) are the white, arrow-shaped control-flow wires — &quot;do this, then that&quot; — the same idea as Blueprints&apos; white exec wires.
          </li>
          <li>
            <strong>Data pins</strong> (every other type) carry values and are pulled on demand rather than pushed — see the execution model below.
          </li>
        </ul>
        <p>
          An unwired input pin simply uses its literal value, edited inline on the node itself via a type-appropriate widget (a checkbox, a dropdown for an <code>options</code> pin, a rounding number box for an <code>integer</code> pin, and so on).
        </p>

        <h3 id="graph-execution">Execution model (the interpreter)</h3>
        <p>
          A <code>NodeDef</code> is exactly one of two mutually-exclusive kinds, and this split is the core of how a Flow actually runs:
        </p>
        <ul>
          <li>
            An <strong>exec node</strong> declares <code>execute()</code>: it has exec pins, runs its side effect exactly once when its exec-in pin fires, and returns which exec-out pin to continue from next (see <code>executor.ts</code>&apos;s <code>runExecFrom</code>, which walks this chain
            node-by-node — an HTTP call, a Jira API call, an <code>If</code> branch, a loop).
          </li>
          <li>
            A <strong>pure/data node</strong> declares <code>evaluate()</code> instead: no exec pins, no side effects, and its output pins are computed lazily, only when something downstream actually reads them (see <code>resolveDataPin</code>) — arithmetic, string formatting, comparisons, a{" "}
            <code>Get Variable</code>. Each pure node&apos;s result is cached per &quot;tick&quot; keyed by its output pin, so a value read by several downstream nodes in the same step is only computed once.
          </li>
        </ul>
        <p>
          A graph always starts from an <strong>event trigger</strong> node (<code>NodeDef.eventTrigger</code>, the <code>BeginPlay</code>/<code>EventTick</code> equivalent) — e.g. &quot;On HTTP Request&quot;, &quot;On Interval&quot;, or manually pressing Run in Emulate/Simulate — whose exec-out pin
          kicks off the first <code>runExecFrom</code> call.
        </p>

        <h3 id="graph-special-nodes">Variables, functions & events</h3>
        <ul>
          <li>
            <strong>Variables</strong> — declared once on the graph, read/written anywhere via matching <code>Get</code>/<code>Set</code> node instances (<code>NodeDef.derivePins</code> derives that instance&apos;s pins from the bound <code>Variable</code>&apos;s type). A node called from inside a
            function body can see both the function&apos;s own local variables and the graph&apos;s global ones (see <code>visibleVariables</code>).
          </li>
          <li>
            <strong>Functions</strong> — a reusable sub-graph with its own Entry/Return nodes and a <code>Call</code> node elsewhere that invokes it, all keyed off a shared <code>FunctionDef</code>.
          </li>
          <li>
            Some node types don&apos;t take a fixed pin list at all — <code>deriveInstancePins</code>/<code>configurableElementType</code> let a single node type (e.g. Array Length, Append String) adapt its pins to whatever element type or arity the user configures on that specific instance, instead
            of registering one variant per type.
          </li>
        </ul>

        <h3 id="graph-compiler">The compiler</h3>
        <p>
          Every exec/pure node pair (<code>execute</code>/<code>evaluate</code>) has a matching <code>compileExecute</code>/<code>compileEvaluate</code> that produces plain JavaScript instead of running the node live:
        </p>
        <ul>
          <li>
            <code>compileEvaluate</code> returns a JS expression string per output pin (safe to inline anywhere a consumer needs it, since it must stay side-effect-free just like <code>evaluate</code>).
          </li>
          <li>
            <code>compileExecute</code> returns JS statement strings spliced into the compiled function body at that node&apos;s position, then continues the exec chain via a supplied <code>compileFrom</code> callback — mirroring <code>runExecFrom</code>&apos;s traversal, but writing code instead of
            executing it.
          </li>
          <li>
            A node can also contribute <code>compileHelpers</code> (named helper source snippets, e.g. a <code>delay</code> function) and <code>compileImports</code> (literal ESM import lines), both deduped once across the whole generated file.
          </li>
        </ul>
        <p>
          <code>compiler/codegen.ts</code> walks the graph from each event trigger and assembles all of this into one standalone <code>.mjs</code> script (a <code>CompileResult</code> with the generated <code>code</code> plus a manifest of its triggers/variables), written to{" "}
          <code>data/deployed-scripts/</code> and later run by <code>server/executeDeployedFlow.ts</code>. This is why every node type <strong>must</strong> implement both halves — the interpreter and compiler paths have to stay in lockstep, or a Flow could behave differently in Emulate than once
          actually deployed.
        </p>
      </section>

      <section id="execution-paths" className="docs-section">
        <h2>Two execution paths for a Flow</h2>
        <p>
          A Flow&apos;s actual runtime logic (e.g. an HTTP call, a Jira API call) is written once, in <code>src/server/functionLibrary*.ts</code>, and consumed by both paths:
        </p>
        <ul>
          <li>
            <strong>Interpreter</strong> (Emulate/Simulate pages → <code>api/simulate</code>, <code>api/emulate/run</code>): <code>engine/executor.ts</code> walks the live in-memory graph and calls into <code>functionLibrary*.ts</code> directly for each node&apos;s execution.
          </li>
          <li>
            <strong>Compiled/deployed</strong> (<code>compiler/codegen.ts</code> generates code that imports <code>functionLibrary*.ts</code> directly). The generated script is saved under <code>data/deployed-scripts/</code> and later invoked by <code>server/executeDeployedFlow.ts</code> (used by{" "}
            <code>flow.executeFlow</code> nodes and by <code>api/hooks/[projectId]/[flowId]</code>).
          </li>
        </ul>
        <p>
          <code>graph/nodes/*.ts</code> must stay editor-only (pins, labels, UI) — never add real request/API logic there; it belongs in <code>server/functionLibrary*.ts</code> so both execution paths share it.
        </p>
      </section>

      <section id="data-persistence" className="docs-section">
        <h2>Data & persistence</h2>
        <ul>
          <li>
            <code>src/server/DatabaseManager.ts</code> — SQLite (better-sqlite3) access; the only place that touches raw rows.
          </li>
          <li>
            <code>src/server/models.ts</code> — plain DTOs returned by <code>DatabaseManager</code> (e.g. <code>ProjectSummary</code>, <code>FlowSummary</code>, <code>RunLog</code>) — safe to import anywhere, including client components.
          </li>
          <li>
            Flow versioning: <code>flow.revision</code> bumps on every autosave/save; <code>flow.version</code> plus <code>flow_versions</code> rows only bump on an explicit &quot;Save new version&quot; / restore (see <code>RestoreVersion*</code> components).
          </li>
        </ul>
      </section>

      <section id="user-sign-in" className="docs-section">
        <h2>User sign-in (app access)</h2>
        <p>Everything else on this page is about connector/integration credentials (the Credential Vault). For signing into the app itself:</p>
        <ul>
          <li>
            <code>src/server/auth.ts</code> — Auth.js (next-auth v5) config: a Microsoft Entra ID provider (trusted, no domain check) plus two Credentials providers, <code>email-code</code> (one-time emailed code) and <code>email-totp</code> (a self-enrolled authenticator app), both gated by the
            allowed-domains list.
          </li>
          <li>
            <code>src/proxy.ts</code> — gates every page/API route except <code>/login</code> and <code>/api/auth/*</code>, accepting either a normal next-auth cookie session or an <code>Authorization: Bearer</code> tab token.
          </li>
          <li>
            <code>src/server/tabToken.ts</code> / <code>src/client/authClient.ts</code> / <code>src/components/AuthGate.tsx</code> — the &quot;per tab vs per browser&quot; session scope, set on <code>/account/security</code> for admins: in &quot;tab&quot; mode, a brand-new tab always starts signed
            out and one tab&apos;s sign-out never affects another&apos;s.
          </li>
          <li>
            <code>/account/security</code> — every signed-in email-provider user enrolls/disables their own authenticator app (TOTP) here; admins additionally see the allowed email domains and session scope settings.
          </li>
          <li>
            <code>/admin/users</code> — admins manage every user&apos;s role (viewer/editor/admin), block/unblock sign-in, or delete their account.
          </li>
          <li>
            Required env vars are documented in <code>.env.example</code> at the repo root (<code>AUTH_SECRET</code>, <code>AUTH_MICROSOFT_ENTRA_ID_*</code>, <code>AUTH_SMTP_*</code>, <code>AUTH_ADMIN_EMAILS</code>).
          </li>
        </ul>
      </section>

      <section id="credential-vault" className="docs-section">
        <h2>Credential Vault</h2>
        <ul>
          <li>
            <code>src/credentials/types.ts</code> — shared, client-safe types (<code>CredentialTypeId</code>, per-type data shapes). No Node/DB dependency — importable from the browser (Credential Vault UI) and the server alike.
          </li>
          <li>
            <code>src/credentials/registry.ts</code> — <code>CredentialTypeDef</code> registry: each type&apos;s <code>id</code>, <code>label</code>, and <code>CredentialFieldDef[]</code> (with secret/help flags) driving the Credential Vault dialog&apos;s form.
          </li>
          <li>Stored credentials live in the DB via DatabaseManager, never in graph/node definitions.</li>
        </ul>

        <h3 id="credential-runtime">Credentials at runtime</h3>
        <p>Two different runtimes need the same credential, by two different mechanisms:</p>
        <ul>
          <li>
            <strong>Interpreter</strong> (Emulate/Simulate): reads straight from the DB via <code>DatabaseManager</code> at execution time.
          </li>
          <li>
            <strong>Compiled/deployed script</strong>: has no DB access. <code>src/server/credentialEnv.ts</code>
            &apos;s <code>applyCredentialEnvVars(db)</code> copies every stored credential&apos;s fields into <code>process.env</code> under <code>HERMIONE_CRED_&lt;SANITIZED_NAME&gt;_&lt;FIELD&gt;</code>. The compiled node&apos;s own generated reader looks up those exact env var names.
          </li>
        </ul>
        <p>
          <strong>Rule: never hardcode or embed credential values</strong> in a node definition or compiled output — they&apos;re always looked up at runtime, by name, through one of the two mechanisms above.
        </p>

        <h3 id="oauth-node-types">OAuth / auth node types</h3>
        <ul>
          <li>
            <code>graph/nodes/auth.ts</code> — generic username/password credential node.
          </li>
          <li>
            <code>graph/nodes/oauth2Saml.ts</code> — SAML Bearer OAuth2 flow (used by Google/Microsoft-style service auth).
          </li>
          <li>
            <code>graph/nodes/oauth2ClientCredentials.ts</code> — OAuth2 client-credentials flow (Microsoft Graph app-only auth).
          </li>
          <li>
            Dropbox uses a one-time <code>dropbox.authorize</code> node to exchange an auth code for a refresh token, stored back into the credential.
          </li>
        </ul>
      </section>

      <section id="integrations" className="docs-section">
        <h2>Integrations / connectors</h2>
        <p>Every 3rd-party provider follows the same 4-layer pattern. Take Jira as the example:</p>
        <table className="docs-table">
          <thead>
            <tr>
              <th>Layer</th>
              <th>File</th>
              <th>Responsibility</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Provider client</td>
              <td>
                <code>src/lib/jiraManager.ts</code>
              </td>
              <td>Thin wrapper around the provider&apos;s own SDK.</td>
            </tr>
            <tr>
              <td>Runtime logic</td>
              <td>
                <code>src/server/functionLibraryJira.ts</code>
              </td>
              <td>Actual node execution logic; calls into the manager. Shared by both execution paths.</td>
            </tr>
            <tr>
              <td>Node definitions</td>
              <td>
                <code>src/graph/nodes/jira.ts</code>
              </td>
              <td>Editor-only: pins, labels, tooltips. No real API/HTTP calls here.</td>
            </tr>
            <tr>
              <td>Struct/enum pin types</td>
              <td>
                <code>src/graph/structs/jira.ts</code>, <code>src/graph/enum/jira.ts</code>
              </td>
              <td>Typed pin shapes surfaced in the editor for this provider&apos;s data.</td>
            </tr>
          </tbody>
        </table>
        <p>
          Current providers: Dropbox, GitHub, Google (Admin/Calendar/Docs/Drive/Gmail/Sheets/Auth), Jira, Facebook, Azure Storage, Microsoft 365, AWS DynamoDB, MongoDB, Slack, Stripe, Salesforce, Workday, Twilio, SMTP, SAP (OData/Gateway only), LinkedIn, SendGrid. Plus generic protocol nodes not
          tied to one vendor: <code>http.ts</code>, <code>soap.ts</code>, <code>sftp.ts</code>, <code>odata.ts</code>, <code>xml.ts</code>, <code>csv.ts</code>.
        </p>

        <h3 id="adding-integration">Adding a new integration</h3>
        <ul>
          <li>
            Add the credential type (fields it needs) to <code>src/credentials/registry.ts</code> plus a <code>CredentialTypeId</code> variant and data shape in <code>src/credentials/types.ts</code>.
          </li>
          <li>
            Add <code>src/lib/&lt;provider&gt;Manager.ts</code> wrapping the provider&apos;s SDK.
          </li>
          <li>
            Add <code>src/server/functionLibrary&lt;Provider&gt;.ts</code> with the actual node execution functions, reading credentials via the <code>credentialEnv.ts</code> conventions for the deployed-script path.
          </li>
          <li>
            Add <code>src/graph/nodes/&lt;provider&gt;.ts</code> with editor-only node/pin definitions, and register it in <code>src/graph/nodes/index.ts</code>.
          </li>
          <li>
            Add struct/enum files under <code>src/graph/structs/</code> / <code>src/graph/enum/</code> only if the provider needs custom typed pin shapes.
          </li>
        </ul>

        <h3 id="browser-stubs">Browser-side SDK stubs</h3>
        <p>
          Some provider SDKs (<code>googleapis</code>, <code>facebook-nodejs-business-sdk</code>, <code>mongodb</code>) are Node-only and would break the browser bundle if imported by editor code. Stub files under <code>src/lib/*BrowserStub.ts</code> exist to satisfy imports client-side (aliased in{" "}
          <code>next.config.mjs</code>&apos;s <code>turbopack.resolveAlias</code>) — never import the real SDK from anything that also runs in the browser (editor nodes, components).
        </p>
      </section>

      <section id="conventions" className="docs-section">
        <h2>Conventions</h2>
        <ul>
          <li>
            All test files go in <code>tests/</code> at the repo root (mirroring <code>src/</code>&apos;s structure), never colocated next to the source file they test.
          </li>
          <li>Comments only describe something naming can&apos;t already convey, kept to at most 2 sentences.</li>
          <li>Prefer classes/interfaces over &quot;function-soup&quot; files — avoid free functions that all take the same instance as their first argument; make it an actual method instead.</li>
          <li>
            Ad-hoc task scripts (one-off migration/refactor helpers, not app code) go in <code>scripts/</code>, not scattered in the repo root.
          </li>
          <li>Run changed files through Prettier before considering a change done.</li>
        </ul>
      </section>
    </PageShell>
  );
}

function DocsToc() {
  return (
    <>
      <p className="page-toc-title">{i18n.pages.docs.toc_title}</p>
      <ul className="page-toc-list">
        {TOC.map((entry) => (
          <li key={entry.id} className={entry.sub ? "page-toc-item-sub" : undefined}>
            <a href={`#${entry.id}`}>{entry.label}</a>
          </li>
        ))}
      </ul>
    </>
  );
}
