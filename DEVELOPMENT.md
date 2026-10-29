# Development status

The original specification is preserved in REQUIREMENTS.md. The implemented delivery is a functional local screenplay-writing MVP spanning its foundation, editor, organisation, interchange, proposal and direct-connection phases.

## Completed slices

1. React/TypeScript/Vite application; loopback Express server; SQLite WAL storage; additive migrations; sample project.
2. TipTap screenplay schema; explicit element types; Enter/Tab/direct shortcuts; split/merge; undo/redo; focus mode; character/prefix suggestions; stable IDs and continuous script.
3. Multiple projects; rename/copy/archive; Letter/A4 preferences; scene navigator, status, whole-scene movement/duplication/deletion; characters, bible, research, notes and scene briefs.
4. Fountain parser and exporter; FDX importer/exporter; local paginated PDF; document JSON; native project backup/restore.
5. Pending proposals, readable structured diffs, editing/resubmission, atomic accept/reject, stale-version rejection, immutable history, comparisons/checkpoints/restoration.
6. SSE refresh/reconnection; autosave acknowledgements; separate per-tab crash recovery; guards for delayed responses and competing edits.
7. Shared typed tool services; capability-detected browser Site tools; official SDK stdio MCP; documented account/reachability limits.

8. Dedicated Planning workspace: multiple typed documents, eight-step circles, search, duplication/reordering, project persistence, backup/history, scoped AI reads and approval-only proposals.
9. Independent main/navigation scrolling, sticky workspace tabs, per-project tab/scroll/caret restoration, remembered open/closed panels and browser layout preferences.

## Verification

Automated tests live in tests/ (Vitest) and e2e/ (Playwright). They cover SQLite reopen/migration, concurrency, approval isolation, native restore, format mappings, XML safety, long dialogue, large backup import, real MCP transport, keyboard behavior, scene movement, downloads, browser recovery, proposal edits and long-script interaction. The browser suite uses its own database and never the delivered sample's main database.

A live in-app-browser test also discovers and invokes real Site tools, creates a proposal, observes it in the editor and exercises approval. This is recorded separately from the standard-browser fallback tests.

## Deliberate limits

- Live pages are a continuous writing surface; the PDF exporter supplies saved page counts and page positions. There is no production-style locked-page live layout.
- Dual dialogue, rich emphasis/style preservation, locked scene numbers and production revision colors are future enhancements identified in the plan, not current features.
- FDX XML/mapping round trips are tested. Fade In/Final Draft import has not been tested because those applications are unavailable here.
- No hosted ChatGPT tunnel or public deployment was configured. The local stdio server and browser Site tools are the implemented direct paths.
- Project structure uses schema-versioned JSON inside relational project/revision/proposal tables rather than separate SQL tables for every creative entity.
- Built-in Courier limits PDF glyph coverage. Exact pagination parity with commercial apps is not claimed.
- Browser recovery depends on browser storage capacity. Quota failures are reported and draft downloads remain available.

## Useful follow-on work

Commercial-application interchange fixtures and real Fade In opening tests; richer typography/dual-dialogue support; a more sophisticated live pagination engine; configurable shortcuts; additional OS/browser coverage. These are separate from the working manual editor and reviewed AI workflow.

## Commands

`npm run dev`, `npm test`, `npm run test:browser`, `npm run build`, `npm run format`.

The completion brief records final test counts and the handoff state. Keep data/ and native project backups when moving this application.

## Final verification — 27 October 2026

Production build and TypeScript checks pass. Vitest: 22 passed across six files. Playwright: 11 passed. Live desktop Site tool discovery/read/proposal/error checks also passed; approval was exercised with the supplied sample. The final long-script fixture produced 180 screenplay pages from 2,160 elements. The exported Letter PDF was rendered and visually inspected. See COMPLETION_BRIEF.md for the complete handoff and verification limits.

Latest verification: production build, 25 Vitest checks and 14 Playwright browser workflows pass. Planning checks cover legacy defaults, duplicate IDs, complete native backup/history, scoped reads, approval isolation, stale versions, saved outlines/circle stages, reopened views, explicit open/closed panel states, opt-in isolation and long-script scroll restoration.

The remote-plugin repair adds create_project, empty-collection and empty-editor coverage, reconnecting event streams after backend/session restart, private transport diagnostics and an authenticated tunnel preflight. All creative-content proposals still require review. The remote transport is verified separately from local stdio and must not be called connected merely because its readiness endpoint returns 200.
