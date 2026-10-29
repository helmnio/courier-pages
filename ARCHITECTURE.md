# Architecture

## Boundaries

- `src/model.ts`: versioned Zod document schema, stable elements, scene slicing/movement/duplication.
- `src/Editor.tsx`: TipTap/ProseMirror schema, explicit screenplay nodes, paragraph editing, keyboard behavior and stable-ID repair after split/paste.
- `src/Planning.tsx`: project planning documents, eight-stage story circles and reference notes.
- `src/workspace.tsx`: optional browser view preferences and controlled remembered details.
- `src/main.tsx`: local writer workspace, draft state, save acknowledgements, review and recovery.
- `server/store.ts`: SQLite migrations, project transactions, immutable revision snapshots, proposals and native backups.
- `server/tools.ts`: typed shared read/propose application operations and tool definitions.
- `server/app.ts`: authenticated local HTTP transport and SSE notifications, using the store/services.
- `src/webmcp.ts`: optional top-level `document.modelContext` adapter; passes to the same HTTP tool dispatcher.
- `server/mcp.ts`: official MCP SDK stdio adapter; passes to that same dispatcher.
- `server/formats.ts`: isolated Fountain/FDX/PDF conversion.

The package uses a simple source tree instead of a monorepo. CSS is scoped through application component classes. React state and refs are the lightweight state layer; Express is the HTTP server; prepared SQLite statements form the database layer. These replace optional stack choices without introducing a separate service or ORM.

## Authoritative data

SQLite contains projects, revisions and proposals. Project rows hold schema-versioned structured JSON plus a monotonic content version and timestamps. Scenes are stable heading-element IDs, never scene numbers. Character profiles, scene briefs, scene status, notes and bible entries live within the versioned document, so an approved transaction captures screenplay and supporting context together. They are structured entities inside a project rather than independent relational tables in this version.

Migration 1 adds project timestamps; migration 2 adds review timestamps and project/version indexes. Startup checks columns before additive migrations and records `PRAGMA user_version`. WAL, foreign-key checking and a busy timeout are enabled. All SQL is prepared, except fixed migrations. Creating a project, saving a revision, restoring a backup and accepting a proposal use transactions.

## Concurrency

A human save includes the document's expected version. The update changes one row only if the expected version matches. A proposal stores a complete candidate snapshot against a base version. Scene operations construct that snapshot by replacing exactly one stable scene or inserting one new scene; unrelated content is copied without modification.

Acceptance is atomic: verify pending status, compare base version, update the project, insert a revision and mark the proposal accepted. Rejection does not change the screenplay or content version. An accepted or rejected proposal cannot be decided again. A stale proposal stays pending until rejected or regenerated.

The browser retains the in-flight save snapshot and any newer typing separately. It does not replace the current editor for a proposal-only notification, for an older server response, or while a dirty draft exists. Delayed project opens and approvals check the active document before installing their result. No text force-merge is attempted.

## Live views and recovery

SSE notifications carry event type, project ID, affected entity ID and current version when available. Import/create events may omit an entity until the client refreshes the project list. Clients retrieve authoritative content through the normal API. Reconnection refreshes local authentication and current metadata. Editor state remains mounted across workspace tabs to retain cursor and undo state; script scroll is restored when returning to the page.

Browser recovery keys include project and tab IDs. Each tab retains its own unacknowledged draft. A recovered draft based on an older content version is blocked from saving until the writer explicitly reviews the conflict. LocalStorage quota failures are reported, and a draft download remains available. Clearing browser storage removes emergency copies, not SQLite work.

## History and backups

History lists contain metadata only; individual snapshots are fetched for comparison/restoration. Restoring an earlier draft goes through the ordinary expected-version save and creates a new revision. Complete backups include current content, revision snapshots, proposal statuses and timestamps. Restoring a backup creates a new project; document entity IDs survive, while project/revision/proposal IDs are remapped to avoid collisions. Approval-source references are remapped with their proposals.

## Security boundary

The server binds `127.0.0.1`. Host and Origin allowlists, SameSite/HttpOnly local session cookies, bounded JSON imports, Zod validation and XML entity/DOCTYPE rejection protect the local interface. The stdio adapter reads a randomly generated mode-0600 bearer token. That credential permits reads and proposals, but does not authorize human save/import/decision routes. Neither adapter exposes arbitrary SQL, file access, unconditional approval or overwrite tools.

This is a single-user local application, not an authenticated multiuser hosting service. A process already running with the user's filesystem and browser access is outside its isolation boundary. No tunnel, cloud backup, analytics, model call or remote publication is started by the app.

## Pagination

PDFKit measures element widths and text height. Export has a title page, Letter/A4 pages, Courier 12, page numbers, heading/cue orphan guards, measured dialogue continuation and forced breaks. The API exposes saved-document page counts and block starting pages from that same renderer. Live editing uses a continuous paper surface and saved pagination metadata; it does not pretend CSS alone gives typesetting parity with commercial screenplay applications.

## Planning and view preferences

`planning` is an additive document field defaulting to an empty array for legacy documents, revisions and backups. Each item has a unique stable ID, title, kind, body, subject and eight circle-stage text fields. Planning changes use the existing acknowledged save, recovery, immutable history and approval paths. Native and document JSON retain them; screenplay interchange formats do not.

`screenplay_get_planning` returns metadata only unless a specific plan ID is supplied. `screenplay_propose_planning_update` copies the current snapshot and adds/replaces exactly one plan by ID, retaining other project content; normal expected-version and editor approval rules apply.

View preferences use the `studio-view:` localStorage namespace, distinct from emergency draft recovery. Tab, main-scroll positions, caret, detail panels and selected plan are project-scoped; sidebar/focus/context layout preferences are browser-scoped. Project changes load their own view preferences; autosave acknowledgements do not reapply scroll positions. Main and navigator have separate bounded scroll areas, with a sticky tab row. Selection navigation uses a single explicit scroll rather than competing focus and centering requests. Site-tool authorization is deliberately not persisted as a layout preference.
