# Screenplay Studio — Full Codex Development Plan

The goal is to build a lightweight, local-first screenplay editor with direct ChatGPT integration, combining the essential writing features of Fade In with an AI-assisted creative workflow.

The finished system should allow you to develop stories with ChatGPT, direct scenes yourself, have AI draft those scenes directly into your screenplay, and edit or approve the results in a browser window.

It should also export professional screenplay files that can be opened in Fade In or Final Draft.

## 1. The final experience

Screenplay Studio

Local project

THE TRAWLER

Saved

SCENES

01 Harbour

02 Departure

03 At Sea

04 Engine Room

05 Night Watch

Characters

Story bible

Research

SCENE 04

INT. TRAWLER - ENGINE ROOM - NIGHT

Harris kneels beneath the engine. The metal hull vibrates around him.

Three knocks.

He stops working.

He takes a spanner and strikes the hull twice.

HARRIS

Come on, then.

Nothing answers.

AI PROPOSAL

Revision 02

Reduce dialogue and increase tension.

Proposed scene changes ready for review.

Accept

Reject

Draft 1 · Scene 4 of 5

Export: FDX · Fountain · PDF

Illustrative application layout.

The important principle is that the browser app is the source of truth for the screenplay. ChatGPT is a writing partner connected to it, not the document owner.

## 2. The integration decision

After checking the current OpenAI documentation, I'd support two methods, but prioritise the first.

- WebMCP Site tools: The app exposes structured operations to ChatGPT Work or Codex when opened in the supported ChatGPT desktop browser. This is particularly well suited to editing a document while looking at it.&#x20;

  [image](https://www.google.com/s2/favicons?domain=https://learn.chatgpt.com\&sz=32)

  ChatGPT Learn

- Standard MCP server: Enables other compatible clients, including local Codex, to access the project without needing the browser tab open. ChatGPT's connection method depends on the client and account; remote access may require Secure MCP Tunnel.&#x20;

  [image](https://www.google.com/s2/favicons?domain=https://learn.chatgpt.com\&sz=32)

  ChatGPT Learn

  +1



One important caveat: custom MCP write access in hosted ChatGPT is subject to plan and product restrictions. The current documentation limits some full write capabilities to Business, Enterprise and Edu. That is why WebMCP is the first integration to validate, rather than assuming conventional custom MCP writes will work in your ChatGPT account.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://help.openai.com\&sz=32)

OpenAI Help Center



## 3. Complete Codex build brief

You can copy the following directly into Codex. It specifies the architecture, features, implementation order, safety requirements and what counts as finished.

# PROJECT: SCREENPLAY STUDIO

## Mission

Build a professional-feeling, lightweight, local-first screenplay writing web application.

The application should combine:

1. The core screenplay writing and formatting experience of Fade In.
2. The project organisation of a dedicated writing workspace.
3. Direct AI integration through WebMCP and MCP.
4. A human-led creative workflow in which AI can read, draft, analyse and propose edits to screenplay content.
5. Reliable imports and exports compatible with professional screenwriting applications.

This is intended for writing feature films, short films and eventually television scripts.

The application must be fully functional without an AI connection.

The primary user is a writer who develops stories conversationally with ChatGPT, directs the narrative and individual scenes, and uses AI to produce initial screenplay drafts.

**Do not build an AI that independently invents or controls the entire film. Build a screenplay editor that gives the human author control of the story.**

---

# 1. DEVELOPMENT PRINCIPLES

- Local-first: No account, subscription or cloud hosting needed.
- Single-user: No multiplayer or remote collaboration needed initially.
- Browser-based: Runs at a local address on macOS.
- Persistent: Work survives closing the browser, restarting the server and restarting the computer.
- Portable: Projects must have reliable backup and export options.
- AI-independent: Manual writing works even with every AI feature disconnected.
- AI-ready: Expose properly designed tool operations from the start.
- Human-approved: AI-generated revisions must be reviewable.
- Modular: Screenplay editing, storage, import/export and integrations must remain separate.
- Maintainable: Prefer established libraries over custom editing engines.
- Fast: No unnecessary dashboards, animations or product complexity.

Preserve structured screenplay content, not just unstructured HTML.

Use TypeScript throughout.

---

# 2. TECHNOLOGY STACK

## Frontend

- React
- TypeScript
- Vite
- TipTap / ProseMirror for rich structured text editing
- Zustand or equivalent lightweight state management
- Tailwind CSS or scoped CSS modules
- Lucide icons

## Backend

- Node.js
- TypeScript
- Fastify or equivalent lightweight HTTP server
- SQLite
- Drizzle ORM or equivalent database layer
- Zod for runtime validation
- Server-Sent Events or WebSockets for document change notifications

## Testing

- Vitest for unit and integration testing
- Playwright for browser testing
- Database migration tests
- Import/export round-trip tests

## Development

Use a monorepo if appropriate:

- apps/web
- apps/server
- packages/core
- packages/screenplay-formats
- packages/ai-tools
- packages/mcp-server

A simpler structure is acceptable if it reduces complexity without losing separation of concerns.

## Important storage decision

SQLite is the authoritative project database.

Do not use browser localStorage as the master document store.

Browser storage may be used for interface preferences and a recoverable emergency draft cache, but must not become a competing source of truth.

Use an application service layer shared by the normal HTTP API, WebMCP adapter and conventional MCP adapter.

---

# 3. INTERFACE DESIGN

Build a minimal desktop-first writing interface.

Aesthetic:

- Calm, clean, professional.
- Light theme initially.
- White screenplay pages.
- Subtle grey surrounding workspace.
- Courier-style monospaced screenplay text.
- Modern sans-serif interface text.
- Minimal visual distractions.
- No unnecessary gradients or flashy components.

## Main layout

### Top toolbar

Display:

- Application name
- Current screenplay title
- Save status
- Undo / redo
- Export menu
- Project settings

### Left sidebar

Include:

- Project title
- Scene navigator
- Act and sequence headings
- Character list
- Story bible
- Research and notes
- Revision history

Make the sidebar collapsible.

### Central screenplay editor

The primary working area.

Show screenplay pages with industry-inspired formatting.

Support:

- Keyboard-based writing
- Element switching
- Full-screen distraction-free mode
- Scroll position preservation
- Selection and cursor stability
- Page count
- Scene boundaries

Avoid making every scene a completely separate document requiring its own editing window.

The screenplay should read as one continuous script while still being structured internally by scene.

### Right sidebar

Optional and collapsible.

Show contextual information such as:

- Scene synopsis
- Scene direction
- Character intentions
- AI draft proposals
- Revision comparison
- Comments and notes

Do not include a compulsory AI chat interface in version one. ChatGPT itself will be the conversation interface.

---

# 4. SCREENPLAY EDITOR

This is the most important part of the application.

Build a structured screenplay editor rather than a generic rich text editor.

## Supported elements

- Title page
- Scene heading
- Action
- Character
- Dialogue
- Parenthetical
- Transition
- Shot
- General text
- Forced page break
- Notes (not included in standard screenplay exports unless specifically supported)

Later support:

- Dual dialogue
- Scene numbers
- Character extensions such as (V.O.) and (O.S.)
- Continued dialogue
- Revision marks

## Writing behaviour

Implement familiar screenplay editor behaviour:

- Enter after scene heading creates Action.
- Enter after Character creates Dialogue.
- Enter after Dialogue creates Action or the next appropriate element.
- Tab cycles or selects relevant screenplay element types.
- Keyboard shortcuts allow direct element switching.
- Character names can autocomplete from project characters.
- Scene headings can autocomplete INT., EXT. and time of day.
- Normal typing must feel responsive and predictable.

Do not rely on regex to guess element types while editing. Screenplay elements must have explicit types.

## Formatting

Use traditional screenplay conventions:

- Monospaced screenplay font
- Conventional scene heading style
- Appropriate Action width
- Narrower Dialogue column
- Character names correctly positioned
- Parentheticals correctly positioned
- Transitions right-aligned

The editing experience should resemble a screenplay, not a Word document.

## Pagination

Provide US Letter and A4 settings.

Implement screenplay-aware pagination with support for:

- Page boundaries
- Different element widths
- Dialogue wrapping
- Avoiding orphaned character headings
- Continued dialogue where appropriate
- Explicit page breaks

Do not assume that CSS page-break rules alone can produce fully reliable screenplay pagination.

Initially prioritise accurate export pagination over perfect live editor pagination.

---

# 5. PROJECT MANAGEMENT

Support multiple screenplays.

Each project contains:

- ID
- Title
- Author
- Logline
- Genre
- Format (feature, short, television)
- Description
- Created date
- Updated date
- Draft version
- Page size preferences
- Screenplay content
- Supporting creative documents

## Dashboard

Provide a simple home page showing existing projects.

Actions:

- Create project
- Open project
- Rename project
- Duplicate project
- Archive project
- Import screenplay
- Export or back up project

Destructive actions must require confirmation.

---

# 6. STRUCTURED DATA MODEL

Design a relational database schema with stable identifiers.

Suggested entities:

## Project

id, title, author, metadata, timestamps, settings.

## ScreenplayDocument

id, projectId, schemaVersion, contentVersion, structured content.

## Scene

id, projectId, stable ordering identifier, heading, location, timeOfDay, synopsis, status, notes.

## Character

id, projectId, name, aliases, age, description, background, motivation, relationships, voice notes, development arc.

## StoryBible

id, projectId, title, category, structured content, revision number.

## SceneBrief

id, sceneId, purpose, startingState, endingState, requiredBeats, characterIntentions, dialogueGuidance, tone, constraints.

## Proposal

id, projectId, sceneId, baseVersion, proposedContent, rationale, status, createdAt, reviewedAt.

## Revision

id, projectId, sceneId, oldVersion, newVersion, operation, timestamp, source.

## ContinuityNote

id, projectId, sceneId, category, content, status.

The screenplay must also support document-wide content outside numbered scenes, such as opening text or transitions.

Scene IDs must survive rearrangement and edits.

Do not use scene number as the permanent identifier.

---

# 7. SCENE NAVIGATOR

Automatically identify scenes from typed Scene Heading elements.

Display:

- Scene number
- Location or heading
- Optional synopsis
- Scene status
- Approximate page position

Support:

- Click to navigate
- Rename and update heading
- Reorder scenes
- Create new scenes
- Duplicate scenes
- Delete scenes with confirmation
- Add scene notes
- Mark scenes as planned, drafting, revision or approved

Scene reordering must move all associated screenplay elements together.

Notes, AI proposals and character references must remain attached to the same scene after reordering.

---

# 8. STORY BIBLE

Provide an organised reference area for film development.

## Sections

### Premise

- Logline
- Synopsis
- Genre
- Themes
- Tone
- Intended audience

### Story

- Act structure
- Story outline
- Sequence breakdown
- Major turning points
- Ending

### Characters

- Biographies
- Motivations
- Conflicts
- Relationships
- Character arcs
- Dialogue style

### World

- Setting
- Time period
- Locations
- Historical or technical context
- Established world rules

### Continuity

- Established facts
- Events and chronology
- Character knowledge
- Unresolved questions

### Creative constraints

Examples:

- No unnecessary exposition.
- Avoid melodramatic dialogue.
- Do not invent supernatural explanations.
- Prefer visual storytelling.
- Preserve ambiguity where specified.

The story bible should be editable in the application.

AI must be able to retrieve relevant parts of the bible through explicit tools.

Do not automatically send the entire bible every time an AI tool is used.

---

# 9. AI COLLABORATION SYSTEM

The application must support human-led screenwriting through structured AI operations.

AI should be able to:

- Read the current project.
- Read a scene.
- Read surrounding scenes.
- Read relevant character information.
- Read the story bible.
- Read scene briefs.
- Create proposed scenes.
- Propose revisions.
- Suggest dialogue alternatives.
- Add non-destructive critique notes.
- Flag possible continuity problems.

AI must not silently overwrite approved screenplay content.

## Proposal workflow

Example:

1. Human directs Scene 12 in ChatGPT.
2. ChatGPT retrieves the project context.
3. ChatGPT develops screenplay dialogue and action.
4. ChatGPT creates a proposed scene in the app.
5. The proposal appears in the right sidebar.
6. Human compares it with existing content.
7. Human accepts, rejects or edits the proposal.
8. Accepted content is written to the screenplay.
9. Previous content remains available through history.

A new scene may enter a draft state, but it must be clearly identified as unapproved AI work until accepted.

## AI edit modes

Support:

### Draft new scene

AI writes a scene from a human scene brief.

### Revise scene

AI rewrites specified elements of an existing scene.

### Dialogue pass

AI concentrates on dialogue without changing the scene's plot.

### Action pass

AI improves visual action descriptions and economy of language.

### Subtext pass

AI identifies explicit or unnatural dialogue and proposes subtler alternatives.

### Script critique

AI reviews without modifying the screenplay.

### Continuity check

AI identifies inconsistencies and reports supporting scene references.

These modes should map to shared application operations rather than separate implementations.

---

# 10. WEBMCP SITE TOOLS

Treat this as the priority AI integration.

Use current official WebMCP documentation rather than relying on assumed or outdated APIs.

The initial goal is for ChatGPT Work or Codex to interact with the application through structured tools when the application is open in the supported ChatGPT desktop browser.

Register tools from the top-level page.

Feature-detect availability and fail gracefully when unsupported.

## Initial tool list

Read operations:

- screenplay_get_current_project
- screenplay_get_current_selection
- screenplay_get_current_scene
- screenplay_list_scenes
- screenplay_get_scene
- screenplay_get_adjacent_scenes
- screenplay_get_story_bible
- screenplay_list_characters
- screenplay_get_character
- screenplay_get_scene_brief
- screenplay_get_revisions

Write/proposal operations:

- screenplay_create_scene_proposal
- screenplay_propose_scene_revision
- screenplay_add_scene_note
- screenplay_add_continuity_issue
- screenplay_update_scene_brief

Optional navigation operations:

- screenplay_navigate_to_scene
- screenplay_open_proposal

Do not provide unrestricted overwrite, arbitrary SQL execution, arbitrary filesystem access or unconditional approval tools.

## Tool design

Each tool must:

- Have a clear description.
- Accept a small validated input schema.
- Return structured JSON.
- Return stable entity identifiers.
- Clearly indicate whether any changes occurred.
- Report current document version.
- Return actionable errors.
- Reuse the application's existing service layer.
- Respect the user's active project.
- Avoid implicit changes to unrelated scenes.

Provide useful descriptions so an AI agent can choose the correct operation without guessing.

## First integration test

Before implementing the entire WebMCP suite:

1. Register a read-only tool returning the open project's title.
2. Test discovery in a supported ChatGPT desktop built-in browser.
3. Register a tool to retrieve the active scene.
4. Register a non-destructive proposal creation tool.
5. Confirm a proposal appears in the application.
6. Document the exact working setup.

If the user's environment cannot access Site tools, continue developing the editor independently and keep the integration behind a feature flag.

Do not claim success without an actual end-to-end test.

---

# 11. STANDARD MCP SERVER

Build a second integration adapter using the official Model Context Protocol SDK.

Its purpose is to allow compatible clients to access the screenplay independently of the browser UI.

The standard MCP server must use the same application services and validation as WebMCP.

## Local support

Support local MCP clients using an appropriate STDIO or Streamable HTTP transport.

Document configuration for Codex.

## Hosted ChatGPT support

Do not assume that hosted ChatGPT can directly connect to localhost.

Investigate currently supported remote MCP and Secure MCP Tunnel options.

If an authenticated remote/tunnel integration is possible, document it separately.

Do not expose an unauthenticated write server to the public internet.

Do not invent unsupported ChatGPT connection steps or claim unavailable permissions are enabled.

## Shared behaviour

Both MCP integrations must return equivalent data and produce equivalent proposals.

The screenplay must not behave differently depending on which integration created the edit.

---

# 12. DIRECT TOOL API

Implement a typed application service layer.

Examples:

- listProjects()
- getProject(projectId)
- getDocument(projectId)
- getScene(sceneId)
- listScenes(projectId)
- getSceneContext(sceneId)
- getCharacter(characterId)
- getStoryBible(projectId)
- createSceneProposal(input)
- createRevisionProposal(input)
- acceptProposal(proposalId, expectedVersion)
- rejectProposal(proposalId)
- updateSceneBrief(sceneId, input)
- addContinuityNote(input)

Use this as the foundation for:

- Browser UI operations
- HTTP endpoints
- WebMCP
- Standard MCP
- Import/export functions

Do not duplicate editing logic in every integration.

---

# 13. CONCURRENT EDITING AND DOCUMENT SAFETY

The user may be typing in the browser when an AI creates a proposal.

Prevent lost updates.

## Required protections

- Optimistic concurrency using document or scene revision numbers.
- Stable IDs.
- Database transactions.
- Autosave acknowledgements.
- Dirty-state tracking.
- Recovery after browser crashes.
- Conflict warnings.
- Revision snapshots.
- Never discard unacknowledged user edits.
- Never apply an AI proposal against an outdated base version without detecting the conflict.

## Proposal acceptance

When a proposal is accepted:

1. Check its base version.
2. Check current database version.
3. If compatible, apply atomically.
4. Record the previous version.
5. Notify the browser.
6. Preserve selection where feasible.
7. Offer undo or revision restoration.

If the content has changed since the proposal was created, require a conflict review or regenerate the proposal.

Do not automatically force-merge conflicting dialogue or scene text.

---

# 14. LIVE BROWSER UPDATES

Implement SSE or WebSocket notifications.

When the underlying project changes:

- Notify all open views of that project.
- Update the relevant scene or proposal.
- Update save status.
- Update scene navigator metadata.
- Preserve cursor location during unrelated changes.
- Never replace the full editor state unnecessarily.

Support clean reconnection after a dropped connection.

Notifications should contain event type, project ID, affected entity ID and revision metadata.

Clients should retrieve authoritative changed content using the shared API.

---

# 15. IMPORT AND EXPORT

Professional portability is essential.

## Fountain

Support:

- Export full screenplay.
- Import Fountain files.
- Scene headings.
- Action.
- Dialogue.
- Parentheticals.
- Transitions.
- Title page where supported.
- Common Fountain markup and forced elements.

Use a well-tested parser or implement against the published specification with comprehensive tests.

## Final Draft FDX

Support import and export of .fdx files.

Use standards-compatible XML.

Map supported structured screenplay elements to the appropriate FDX element types.

Handle XML escaping correctly.

Test character names, parentheticals, scene headings, transitions and multiline dialogue.

Include title-page metadata where supported.

Be explicit about unsupported FDX features.

Never claim lossless round-trip compatibility unless testing proves it.

## PDF

Support:

- Title page.
- Page numbering.
- US Letter and A4.
- Courier-style font.
- Screenplay margins.
- Correct dialogue indentation.
- Multi-page scenes.
- Explicit page breaks.
- Print-friendly output.

PDF generation must happen without requiring a commercial cloud service.

## Complete project backup

Provide a native backup format containing:

- Screenplay.
- Story bible.
- Characters.
- Scene notes.
- Scene briefs.
- Proposal history.
- Revision snapshots.
- Project metadata.

The native backup must be restorable into the app.

FDX and Fountain exports are portable screenplay files, not complete project backups.

---

# 16. REVISION HISTORY

Implement a reliable revision system.

Store checkpoints for:

- Approved AI changes.
- Scene reordering.
- Major manual revisions.
- Imported document changes.
- Explicit user snapshots.

Avoid writing a huge database snapshot for every keystroke.

Support:

- View revision list.
- Compare versions.
- Restore an earlier version.
- Show who or what initiated a change (Human, AI proposal accepted, Import).
- Export or back up historical revisions.

Restoring a revision must itself create a new revision, preserving history.

---

# 17. AI PROPOSAL REVIEW UI

Display AI proposals clearly.

For each proposal show:

- Target scene.
- Creation time.
- Summary of intended change.
- Original content.
- Proposed content.
- Differences.
- Accept.
- Reject.
- Edit proposal.

Use text-level or structured-element diffing where practical.

Highlight:

- Added dialogue.
- Removed action.
- Rewritten descriptions.
- Changed character cues.
- New or deleted screenplay elements.

Do not silently replace text just because a proposal has been submitted.

---

# 18. SEARCH AND NAVIGATION

Provide:

- Search screenplay text.
- Search characters.
- Search scene headings.
- Jump to scene.
- Find occurrences of a character.
- Search notes.

Future enhancement:

- Show character appearances by scene.
- Show estimated dialogue percentage by character.
- Show locations used throughout the film.

These analytical features are not required for the initial MVP.

---

# 19. KEYBOARD SHORTCUTS

Prioritise a fast keyboard workflow.

Support:

- Standard undo and redo.
- Save/checkpoint shortcut.
- Search.
- Switch screenplay element type.
- Next/previous scene.
- Focus scene navigator.
- Distraction-free mode.

Use intuitive defaults and allow configuration later.

Avoid browser shortcut conflicts.

---

# 20. LOCAL SECURITY

The application is intended to run locally.

Implement:

- Bind the backend to loopback by default.
- Restrict allowed origins.
- Validate Origin headers for state-changing requests.
- No arbitrary file read/write API.
- No raw SQL tools.
- Input validation on all endpoints.
- Safe XML parsing.
- File import size limits.
- Protection against malicious imported documents.
- Sensitive project data remains local by default.
- Optional external connectivity only when explicitly configured.

Understand that content submitted through ChatGPT tools may be processed by the AI service, even if the application's primary database is local.

Do not create automatic remote backups or analytics.

---

# 21. PERFORMANCE

Optimise for feature-length scripts of approximately 90–130 pages.

Test with significantly larger scripts as well.

Requirements:

- Smooth typing.
- No visible lag when editing normal scenes.
- No full-screen rerender per character.
- Efficient scene indexing.
- Efficient search.
- Reliable autosaving.
- Pagination that does not block ordinary typing.
- Minimal unnecessary network requests.

---

# 22. DEVELOPMENT PHASES

Complete work incrementally.

Do not attempt the whole application in one uncontrolled implementation pass.

## Phase 0 — Project foundation and integration proof

- Create app structure.
- Install dependencies.
- Set up SQLite and migrations.
- Implement sample project.
- Build minimal UI.
- Test basic WebMCP discovery on a small prototype.
- Document integration limitations and fallback strategy.

Deliverable: A running local app and a clear assessment of direct ChatGPT connectivity.

## Phase 1 — Functional screenplay editor

- Structured screenplay elements.
- Text editing.
- Keyboard behaviour.
- Correct visual formatting.
- Scene detection.
- Save and reopen.
- Basic undo/redo.
- Single continuous screenplay view.

Deliverable: A usable manual screenplay writing application.

## Phase 2 — Project organisation

- Project dashboard.
- Scene navigator.
- Story bible.
- Characters.
- Scene briefs.
- Notes.
- Search.

Deliverable: The writer can organise an entire film.

## Phase 3 — Professional exports

- Fountain import/export.
- FDX import/export.
- PDF export.
- Title page.
- Page formatting.
- Round-trip verification.

Deliverable: A screenplay can be opened and continued in Fade In or Final Draft.

## Phase 4 — AI proposal system

- Shared application services.
- Proposal creation.
- Proposal review UI.
- Accept/reject.
- Revision tracking.
- Version conflict handling.
- Live browser updates.

Deliverable: AI-authored scene proposals can be safely reviewed and committed through the application's APIs.

## Phase 5 — Direct AI connectivity

- WebMCP read tools.
- WebMCP proposal tools.
- Standard MCP adapter.
- Codex MCP configuration instructions.
- ChatGPT desktop connectivity testing.
- Supported fallback workflow.
- End-to-end tests.

Deliverable: Compatible AI clients can read the screenplay and propose changes without manipulating the browser UI manually.

## Phase 6 — Refinement

- Improve typing experience.
- Improve pagination.
- Better scene navigator.
- Better diff previews.
- Keyboard shortcuts.
- Backup and restore.
- Stability improvements.
- Accessibility.
- Long-script performance.

Deliverable: A polished, dependable writing application.

---

# 23. TESTING REQUIREMENTS

Use automated tests.

## Editor tests

- Create and edit scene headings.
- Switch element types.
- Type dialogue.
- Split and merge paragraphs.
- Undo and redo.
- Reorder scenes.
- Preserve scene IDs.

## Persistence tests

- Save.
- Close app.
- Restart server.
- Reopen project.
- Verify content remains unchanged.

## Export tests

- Fountain export and reimport.
- FDX export and reimport.
- XML validity.
- Special characters.
- Multiple speakers.
- Long dialogue blocks.
- Empty scenes.
- Page breaks.
- PDF pagination.

## AI tests

- Read a scene.
- Read characters.
- Read the bible.
- Create a proposal.
- Review proposal.
- Reject proposal.
- Accept proposal.
- Reject stale-version proposal.
- Verify history.
- Verify user edits remain intact.

## Integration tests

- Discover WebMCP tools where supported.
- Invoke a read tool.
- Invoke a proposal tool.
- Confirm browser receives update.
- Test connection loss.
- Verify safe behaviour when AI integration is unavailable.

## Backup tests

- Export complete project.
- Restore into a clean database.
- Verify every scene, character, note and revision.

---

# 24. DOCUMENTATION

Maintain these files:

README.md

- Installation
- Running locally
- Building for production
- Project overview

ARCHITECTURE.md

- Data model
- Editor architecture
- API design
- Sync behaviour

SCREENPLAY_FORMATS.md

- Supported elements
- Fountain conversion
- FDX conversion
- Known limitations

AI_INTEGRATION.md

- WebMCP integration
- Standard MCP configuration
- Supported clients
- ChatGPT setup
- Security constraints
- Tested functionality

DEVELOPMENT.md

- Current phase
- Completed features
- Known issues
- Next tasks

Include a sample screenplay project for manual testing.

---

# 25. DEFINITION OF DONE

The initial application is ready when:

1. I can start it locally with a documented command.
2. I can create a screenplay project.
3. I can write and format screenplay scenes naturally.
4. My writing persists across restarts.
5. I can browse and reorganise scenes.
6. I can maintain characters and story notes.
7. I can import and export Fountain.
8. I can export a valid FDX file and open it in Fade In.
9. I can export a readable PDF.
10. An AI tool can retrieve a scene using a structured interface.
11. An AI tool can submit a proposed scene or revision.
12. I can review and approve or reject that proposal in the browser.
13. Approved changes appear without destroying unrelated edits.
14. I can restore an earlier revision.
15. The integration documentation clearly distinguishes verified functionality from features dependent on external client availability.

---

# 26. INSTRUCTIONS FOR CODEX

You are the lead engineer responsible for developing this application.

Make reasonable technical decisions independently.

Do not ask unnecessary implementation questions.

Use the specifications above as the product requirements.

Before implementing a major subsystem, inspect the existing code and avoid unnecessary rewrites.

Proceed through the phases sequentially, but aim for usable vertical slices.

At the end of each phase:

1. Run relevant automated tests.
2. Build the application.
3. Resolve compilation and runtime errors.
4. Verify the feature manually where possible.
5. Update DEVELOPMENT.md.
6. Report what works, what remains and any known limitations.

Do not present simulated integrations as working integrations.

Do not claim FDX compatibility without actual validation.

Do not invent APIs for WebMCP or MCP.

Consult current official documentation before implementing external integration points.

Prioritise maintainability, writing quality and data integrity over rapidly adding features.

**Begin with Phase 0, then build Phase 1 to a usable state. Continue iteratively through the remaining phases, validating each before progressing.**

## 4. Three decisions I would make before Codex starts

First, prioritise the editing experience. If the screenplay editor isn't comfortable enough to write in for hours, the MCP integration won't matter. Scene formatting, keyboard behaviour and reliable saving are the foundation.

Second, validate WebMCP very early. The official documentation confirms that Site tools work in the supported ChatGPT desktop browser, not ordinary Chrome, and require compatible account/model access.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://help.openai.com\&sz=32)

OpenAI Help Center

&#x20;Codex should prove this with one read tool and one proposal tool before investing heavily in integration work.



Third, use FDX as the professional handoff format. Fade In officially supports Final Draft `.fdx` imports and exports, so that's a practical target for compatibility.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://www.fadeinpro.com\&sz=32)

fadeinpro.com

&#x20;Fountain remains useful as a portable, text-based backup and interchange format.



## 5. What I would deliberately leave out of version one

I wouldn't build an embedded AI chatbot, accounts, online collaboration, cloud hosting, mobile editing, casting tools, production breakdowns or automated story generation.

Those features could eventually be useful, but your real objective is more focused:

You discuss and direct the story in ChatGPT. The AI writes proposed screenplay scenes through a direct connection. You see, edit and approve them in your own application.

That's the product worth building first.

I've also initiated a Work handoff for the development task, so you can continue the implementation there. The full brief above is suitable for pasting into Codex as the project's specification.