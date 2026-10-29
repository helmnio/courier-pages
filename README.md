# Courier Pages

A local writing room for human-led screenplays. React, TypeScript and TipTap provide a continuous structured editor; a loopback Node server stores your work on this computer. No account, API key, subscription or cloud service is required to write. Claude, Codex and other AI chats can read your project and suggest changes over MCP; nothing changes until you approve it.

## Install and open

1. Install [Node.js](https://nodejs.org) 22.13 or newer.
2. Double-click **Courier Pages.command**. The first run installs what it needs, builds the app, and offers to connect the AI apps it finds (Claude Code, Claude Desktop, Codex).
3. Your browser opens at http://127.0.0.1:4310. Keep the Terminal window open while you write.

From a terminal instead:

```sh
npm ci
npm run build
npm run connect -- --all   # optional: connect Claude Code, Claude Desktop, Codex
npm start
```

Your screenplays are saved in `~/Documents/Courier Pages` (or in the app's own `data` folder if you already had one). Set `STUDIO_DATA` to use another folder. To connect later, open **Connections** in the app or run `npm run connect`. After connecting, restart the AI app. `npm run verify:mcp` checks that the MCP server starts and lists your projects.

## Review what a chat suggests

When a chat proposes changes, a banner says so. Choose **Review changes** and each tab shows the suggestion in place: removed text in red, new text in green, with word-level differences inside edited lines. Every element has its own **Accept** and **Skip** buttons. Use the arrows in the review bar to flick between pending revisions, then **Accept all** or **Apply n accepted** (unchosen changes are discarded). An element you edited after the chat read the script is flagged and left out of **Accept all**. **Undo** restores the previous version.

## Write

Choose an element in the toolbar or use Tab / Shift+Tab to cycle types. Enter splits the current paragraph: a character cue or parenthetical continues into dialogue; other elements continue into action. Shift+Enter inserts a line break. Standard undo and redo work in the screenplay. Character and scene-prefix suggestions appear above the page.

- **Screenplay:** continuous screenplay, focus mode, contextual scene notes.
- **Planning:** outlines, treatments, beat sheets, act/sequence plans, research, free notes and eight-step story circles. Create multiple plans, search, duplicate and reorder them; circle stages and your selected plan are remembered.
- **Story bible:** premise, outline, world, continuity, creative constraints and research.
- **Scenes:** create, rename, move, duplicate, delete, mark status, and maintain direction briefs.
- **Characters:** structured profiles, motivations, relationships and voice.
- **Projects:** create/open, rename, duplicate, archive and change Letter/A4 preferences.
- **Revisions:** inspect, edit, approve or reject pending AI suggestions.
- **History:** compare, download, checkpoint and restore saved versions.
- **Connections:** opt into browser Site tools or read MCP setup guidance.

The workspace remembers sidebar visibility, focus mode, scene-notes panel, expanded or closed detail panels, and each project's active tab, plan, circle stage, writing position and caret. The scene navigator and main page scroll independently; the view tabs stay available while you write. These are optional local browser preferences. Clearing browser storage resets them without deleting saved SQLite plans or screenplays. Browser Site tools still require opt-in for each open tab.

## Save, recover and back up

The acknowledged SQLite version is authoritative. Autosave runs after a short typing pause, with periodic saves during continuous writing. Save now and Cmd+S request an immediate save. Browser storage keeps emergency drafts separately for each tab; it is not the master document store.

If another window saves first, your draft remains visible and recoverable. Download its draft backup before loading the latest saved version. Stale AI proposals cannot be approved. There is no automatic merge of conflicting screenplay text.

**Export → BACKUP** produces a complete `.studio.json` project containing the screenplay, metadata, characters, bible, planning documents/story circles, briefs, notes, proposals and revision history. Restore it through **Import**; restoration creates a new project and keeps the original. The native backup limit is 256 MB. Individual Fountain, FDX and document-only JSON imports are limited to 6 MB. The footer's **Download draft backup** preserves the current editor document, including unsaved writing, but does not include proposal/history tables.

Data lives in `data/studio.sqlite`, with SQLite WAL files and a permission-restricted local MCP token in the same directory. Do not delete `data/`. For a manual database copy, stop the app first and copy the entire directory. Native project backups are preferable for portability.

## Interchange

Import/export Fountain and FDX; export locally generated PDFs and document JSON. Native backups carry all development material; screenplay interchange files do not. See SCREENPLAY_FORMATS.md for tested mappings and limits. The live page surface is a continuous writing view; PDF export is the pagination reference.

## Keyboard shortcuts

| Shortcut on macOS | Action |
| --- | --- |
| Cmd+S | Save |
| Cmd+Z / Cmd+Shift+Z | Undo / redo |
| Tab / Shift+Tab | Next / previous element type |
| Cmd+Option+1 / 2 / 3 / 4 | Scene / action / character / dialogue |
| Shift+Enter | Line break within an element |
| Option+PageDown / PageUp | Next / previous scene |
| Cmd+Shift+L | Focus scene search |
| Cmd+Shift+F | Toggle distraction-free mode |

Control substitutes for Command on platforms where supported. Shortcuts are fixed in this version.

## AI integration

Site tools were discovered and invoked in the Codex desktop in-app browser during development, including a real scene read, proposal creation and visible approval. The ordinary editor works in browsers without WebMCP. See AI_INTEGRATION.md for exact verified behavior and local Codex MCP configuration.

AI models are provided by the client you connect; there is no embedded chatbot or automatic story generation. Read/proposal tools expose only their defined operations. Approval is absent from both tool adapters and remains an editor action.

## Development and tests

```sh
npm run dev
npm test
npm run test:browser
npm run build
```

Browser tests use an isolated database and headless Google Chrome at its standard macOS path. Set `CHROME_PATH` to a compatible Chrome/Chromium executable elsewhere. Test data is placed under ignored `work/`; it never uses your main database.

Additional documentation: ARCHITECTURE.md, SCREENPLAY_FORMATS.md, AI_INTEGRATION.md, DEVELOPMENT.md and the original REQUIREMENTS.md.

## Direct local Desktop MCP connection

The server is configured once as `courier-pages` in `~/.codex/config.toml` (run `npm run connect -- --all`), using absolute paths and your data folder. Reload MCP servers in the desktop app after configuration changes. MCP calls reuse the running app, or start its backend against the existing database when stopped. No additional database or replacement screenplay is created. Proposal tools still require human approval in the editor. See AI_INTEGRATION.md for the exact configuration and read-only verification command. This local route is separate from the installed tunnel plugin and does not require the tunnel or an OpenAI API key.

## Creating a project from a connected chat

Ask the connected Courier Pages plugin to list projects first. If you explicitly want a new blank screenplay, use `create_project` with a title and optional author/description. It returns a new project ID and version 1 without replacing any existing project. New projects begin without scenes or planning. Read and propose edits using that ID; approvals remain in the editor.

> **Optional and advanced.** The ChatGPT tunnel files (`integration/`, **Start ChatGPT Connection.command**) are the author's own setup. They need OpenAI's `tunnel-client` binary and a profile that are not included in this repository, and are not needed to use Courier Pages. Most people only need the local MCP connection above.

For the installed ChatGPT plugin, keep **Start ChatGPT Connection.command** running. Its hidden key prompt does not save the runtime key. Configuration and local health alone do not establish remote authentication: the launcher now checks the runtime key's access to the tunnel, and a real plugin read must succeed. Refresh the existing plugin after new tools are added. See AI_INTEGRATION.md for logs, transport boundaries and the distinction between the local Desktop MCP entry and the remote plugin.

## Review notes

Open **Review notes** for project or scene feedback. Select screenplay text and choose **＋ Review note** to keep a snapshot of that passage and a stable navigation reference. Notes support general/story-craft/continuity categories, reviewer names, priorities, replies, editing, search and scene/status/priority filters. Resolve or reopen notes without changing the screenplay. Original quoted text remains visible after script edits; missing or changed passages are labelled. Filters and the new-note draft are remembered locally per project.

Notes and replies autosave through the same version/conflict protection as other project edits and are included in History and full `.studio.json` backups. They are not inserted into screenplay PDF/Fountain/FDX exports. Existing basic notes remain readable.

MCP adds `screenplay_get_review_notes` and `screenplay_propose_review_note`. Adding, replying to, editing or resolving an AI note always creates a pending proposal. Reconnect the local MCP client (or start a fresh local chat) to discover the added tools. Preserve all note fields and replies when proposing full-document changes.

### Pin notes on the screenplay

Choose **Review mode** in the screenplay toolbar, then click the exact word or cursor position you want to discuss. Type in the yellow sticky card beside the page and choose **Pin note**. A marker identifies the character position you clicked; the word is highlighted. Click the marker or **Open discussion** for the complete thread in Review notes. **Exit review mode** returns to writing. **Hide sticky notes** gives a clean writing view.

Pins store block IDs and character offsets, so repeated words can have separate references. Local editor insertions, deletions and paragraph splits map saved pins through the same edit; original quoted text remains available for context. Missing passages retain their notes. Position pins and threads survive autosave, History and full project backup/restore. Notes and pins are excluded from screenplay export and print. On narrow screens the cards stack below the page; the word markers remain in the text.

## Licence

[MIT](LICENSE) © 2026 George Robertson.
