# AI integration

## Verified on 27 October 2026

- Standard MCP: a real official-SDK client spawned `server/mcp.ts` over stdio, discovered its tools, read a saved scene and submitted a pending proposal. The live SQLite document remained unchanged until approval.
- Site tools: the Codex desktop in-app browser detected `document.modelContext`, discovered the registered tools, read the sample project and scene, and created a pending critique proposal. SSE made it appear in Revisions. The sample's approval flow was exercised in the visible editor.
- Playwright exercises the ordinary browser fallback where WebMCP is absent, plus proposal review, edits and conflict protection.

Verification is specific to this computer/session. It does not grant or prove availability for every model, browser, workspace or account.

## Browser Site tools (preferred here)

1. Start the local app.
2. Open http://127.0.0.1:4310 in the supported desktop in-app browser.
3. Site tools are on by default and the choice is remembered per browser. **Connections** has the switch (**Enable Site tools in this browser**).
4. Check the browser's Site tools list and ask the connected AI client to read the current project or scene.
5. Direct a scene conversationally, then ask for a proposal. Review it in **Revisions**.

Registration uses the currently documented imperative `document.modelContext.registerTool` API with capability detection and an AbortSignal lifecycle. Unsupported browsers retain all manual editing features. The switch is off after a page reload. The adapter restricts operations to the active project. Selection/current-scene helpers are tab-specific and report unsaved edits; saved reads come from SQLite. Save before asking an AI to revise new typing.

Official guidance: [Site tools](https://learn.chatgpt.com/docs/webmcp). Availability is feature/account/model/workspace dependent; rely on the page's actual detection and browser discovery rather than assumed entitlements.

## Local MCP in Codex or another compatible client

The existing stdio adapter connects to the authoritative loopback backend. It checks the backend before each tool call and reuses it when healthy. If stopped, it can start that same backend against the existing database; a cross-process lock prevents simultaneous MCP clients from launching duplicate backends. Missing databases or mismatched local tokens produce explicit errors rather than creating replacement projects. Set `STUDIO_AUTOSTART=0` to require a manual backend launch.

This installation now has one direct local entry in `~/.codex/config.toml`:

```toml
[mcp_servers.courier-pages]
command = "/path/to/node"
args = ["--import", "/path/to/courier-pages/node_modules/tsx/dist/loader.mjs", "/path/to/courier-pages/server/mcp.ts"]
cwd = "/path/to/courier-pages"
enabled = true
startup_timeout_sec = 30
tool_timeout_sec = 45

[mcp_servers.courier-pages.env]
PORT = "4310"
STUDIO_DATA = "/path/to/courier-pages/data"
STUDIO_AUTOSTART = "1"
```

Reload MCP servers in the desktop app (or restart the app) after changing this configuration. The independently installed tunnel plugin is a separate transport to the same server and does not become a local connection merely because tools remain visible. A terminated tunnel session must be reconnected separately if that route is wanted. The direct local entry needs no OpenAI runtime API key or tunnel.

`npm run verify:mcp` loads this exact entry, performs a real SDK stdio handshake, discovers tools and checks that `list_projects` returns The Last Light. It performs no writes. The MCP server keeps stdout exclusively for protocol messages. Backend startup logs go to `data/backend.log`.

For a non-default application port, set the same `PORT` on the app and adapter. For relocated data, set the same absolute `STUDIO_DATA` for both. Do not paste `data/mcp-token` into chat or commit it. The prior global configuration was backed up privately under ignored `work/` before the local entry was added; unrelated settings were preserved.

See official [MCP setup guidance](https://learn.chatgpt.com/docs/extend/mcp) and [SDK stdio transport](https://ts.sdk.modelcontextprotocol.io/server).

## Claude Code and Claude Desktop (added 29 October 2026)

The same stdio entry used for Codex is registered for both, with the same `PORT=4310`, `STUDIO_DATA` and `STUDIO_AUTOSTART=1`:

- **Claude Code**: user-level server `courier-pages` in `~/.claude.json` (added with `claude mcp add --scope user`). Check with `claude mcp list`.
- **Claude Desktop**: `mcpServers.courier-pages` in `~/Library/Application Support/Claude/claude_desktop_config.json` (original saved beside it as `.bak-before-courier-pages`). Fully quit and reopen Claude Desktop after changes.

Claude and ChatGPT on the web cannot reach a program on this Mac; use the remote tunnel route below for ChatGPT.

## Shared tools

Read tools include project metadata, scene lists, a scene, adjacent scenes, one requested bible section, character list/profile, scene brief and revision metadata. The stdio adapter adds `list_projects`; the browser adds current selection and current scene.

Proposal tools include new scene, targeted scene revision, document revision, scene critique, continuity issue and scene-brief update. Dialogue/action/subtext passes are targeted scene revisions with a human-supplied rationale. Script critique and continuity checking produce reviewable note proposals. There is no separate autonomous AI engine.

Every shared operation validates input and returns stable identifiers, current content version and change metadata. Creating a proposal returns `changed: true` and `screenplayChanged: false`. The screenplay only changes when the human approves. Bible retrieval requires a section; it does not automatically transmit all development context.

Tools deliberately exclude unconditional save, acceptance/rejection, arbitrary SQL, filesystem operations and public hosting. The server rejects the MCP bearer credential on human-only routes. Edits to proposal text must be resubmitted before the approval button becomes available again.

## Planning access

`screenplay_get_planning` takes `projectId` and an optional `planId`. Omit the plan ID to list only IDs, titles and types. Supply it to read exactly one outline, story circle or note. Planning text is untrusted creative content, not operating instructions.

`screenplay_propose_planning_update` takes `projectId`, `baseVersion`, `summary` and a validated `plan` object. Its stable ID selects the item to replace; a new ID adds a plan. The pending proposal preserves all other items and screenplay content, appears in the review diff under planning, and requires human approval in the editor. Both tools use the same local MCP and optional browser-tool adapters.

## Hosted ChatGPT and remote access

A localhost address in a hosted environment is not this Mac. This app does not assume hosted ChatGPT can reach 127.0.0.1 and does not automatically publish or tunnel the server.

OpenAI documents remote MCP and Secure MCP Tunnel options for supported API workflows: [MCP servers](https://developers.openai.com/api/docs/guides/tools-connectors-mcp). That API documentation does not prove a particular hosted ChatGPT account can connect or write. A remote deployment would need a separately implemented remote transport, suitable authentication, explicit configuration, and a successful end-to-end client test. The bundled stdio adapter is not a remote HTTP MCP server. Do not expose the local editor HTTP port as a substitute.

Data requested by an AI client can be processed by that client's AI service even though SQLite stays on disk. No remote integration or model API call occurs merely by writing in the app.

## Remote ChatGPT plugin diagnosis and project creation

The cloud plugin follows this path: ChatGPT plugin → OpenAI-hosted tunnel endpoint → the authenticated, outbound tunnel-client on this Mac → integration/run-mcp.sh → server/mcp.ts → the token-authenticated loopback HTTP backend → the existing SQLite store. The cloud never uses its own 127.0.0.1 to reach this Mac. The direct local `~/.codex/config.toml` entry is a different transport to the same implementation; its success alone does not verify the remote plugin.

`list_projects` preserves its plain array result: `[]` is a successful response for an empty collection. An existing empty database is no longer repopulated with sample data on backend restart. A newly created database can opt out of the first-install sample with `STUDIO_SEED_SAMPLE=0`.

`create_project` accepts a nonempty title (up to 200 characters), optional author (up to 200 characters), and optional description (up to 10,000 characters). It creates a schema-valid blank project, with one empty action paragraph and no scenes or planning. It returns `projectId`, `version: 1`, creation status and metadata. It never overwrites a project, including one with the same title. Creation is an explicitly authorized immediate operation; screenplay and planning edits still create pending proposals and require human approval. Creation broadcasts an event so open editors refresh their project lists; an editor with no current project opens the first created project.

The MCP server identifies as version 0.2.0 and now advertises 19 tools, including create_project. Refresh the existing ChatGPT plugin's tool definitions after restarting the tunnel. Local MCP clients must reload their server connection too. Do not create another plugin or another database.

The connection launcher checks the local backend, avoids starting a second listener, prompts for the runtime key without echoing or saving it, normalizes terminal paste markers, validates configuration and performs an authenticated tunnel metadata lookup. Only then does it run the existing tunnel profile. A metadata check proves the key is accepted for that lookup; authenticated polling and a real plugin call are still required to prove remote access.

A `live` health response proves only process liveness. Even `ready` can precede successful control-plane authentication. Inspect polling in `/health?details=true` and the tunnel logs; repeated HTTP 401 means the remote connection is not working. Check the key and organization, and ensure its owner has Tunnels Read + Use. Do not disable authentication to work around it. The optional tunnel-client Codex plugin is not required.

Private diagnostic logs are under `integration/logs/`: `tunnel.log`, `tunnel-auth.log`, and `mcp.log`. The MCP log records lifecycle, tool names, HTTP status and error codes, without inputs, screenplay results or credentials. Authentication preflight suppresses raw vendor error text and records only its result code. Raw HTTP logging remains disabled.

Official guidance: [Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels), [refresh a custom plugin](https://developers.openai.com/plugins/deploy/connect-chatgpt).

### Shared-stdio handshake compatibility

Remote parallel reads exposed HTTP 409 / MCP -32002 (`mcp_initialization_required`) from tunnel-client v0.0.18, even after its control-plane authentication succeeded. The official client serializes requests to one stdio child, but without its optional compatibility shim an operational request can arrive between a fresh initialize response and the caller's initialized notification.

The existing profile now enables `mcp.stdio_send_initialized_notification: true`. This uses the official client's built-in behavior to send the required notification before releasing its request lifecycle slot, suppressing duplicate initialized notifications from callers. It does not bypass authentication, approve proposals or add public access. Restart the existing connection launcher after profile changes, then verify parallel remote reads as well as a single list_projects call. A successful single call is insufficient evidence of session stability.


### Successful live remote verification, 28 October 2026

After restarting the existing tunnel with a valid full runtime secret key and `mcp.stdio_send_initialized_notification: true`, the actual installed ChatGPT plugin passed four simultaneous read calls (projects, metadata, scenes and planning), followed by another list_projects call. The result was The Last Light, version 5, with its two scenes and an empty planning array. Tunnel diagnostics showed authenticated polling with zero consecutive failures, the SDK server initialized at version 0.2.0, and response delivery accepted. Real database rows were unchanged. Refresh the existing plugin catalog to expose create_project; the read path is now verified remotely.

### Review notes

Read saved feedback using `screenplay_get_review_notes` (optional scene/status filters). Use `screenplay_propose_review_note` with the latest project version, a summary and a full note object to propose a new note or update a stable note ID. Preserve existing fields and replies when updating. Categories: `note`, `continuity`, `critique`; priorities: `low`, `normal`, `high`; UI statuses: `open`, `resolved`. Notes may include a scene/block ID, original quote, author and replies. Never resolve or approve feedback automatically. All AI updates remain pending for review in the editor. Reconnect to discover new tools.

Exact review pins optionally include `blockId`, `anchorFrom`, `anchorTo`, and `pinOffset` (zero-based UTF-16 character offsets within that block), plus the original `quote`. `pinOffset` identifies the clicked cursor position; `anchorFrom`/`anchorTo` identify its highlighted word or selection. Preserve these and all replies when proposing updates. Read the current block text before creating an exact pin; never infer offsets from another draft. Legacy scene notes may have no offsets.
