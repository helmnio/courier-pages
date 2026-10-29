# Screenplay formats

## Native project backup

`.studio.json` is the complete, restorable project format. It contains the structured screenplay, metadata/page preferences, bible, planning documents and story circles, character profiles, briefs, scene notes/status, continuity/critique notes, proposal history and revision snapshots. The versioned backup envelope is validated before restoration. It restores into a new project and preserves original history/status timestamps.

A plain document `.json` export or draft-recovery download contains current content and supporting development fields but no separate revision/proposal tables. These document files can be imported as new projects. Native backups are the only format intended to preserve all application data.

## Element mapping

| Editor element | Fountain | FDX | PDF |
| --- | --- | --- | --- |
| Scene heading | Forced `.` heading | Scene Heading | Uppercase heading |
| Action | Forced `!` action | Action | Full-width action |
| Character | Forced `@` cue | Character | Character column |
| Dialogue | Dialogue under cue | Dialogue | Narrow dialogue column |
| Parenthetical | Parenthetical under cue | Parenthetical | Parenthetical column |
| Transition | Forced `>` transition | Transition | Right aligned |
| Shot | Action fallback | Shot | Uppercase text |
| General text | Action fallback | General | Full-width text |
| Act / sequence | Section `#` | General fallback | Centered section |
| Forced page break | `===` | StartsNewPage paragraph | New page |
| Private note | Omitted on export | Omitted on export | Omitted |

Title and author are included in Fountain/FDX metadata and the PDF title page.

## Fountain

Imports use the established `fountain-js` parser rather than ad-hoc editing guesses. Forced scene/action/character/transition syntax, normal dialogue, parentheticals, multiline text, title metadata, sections, synopsis/note tokens and page breaks are mapped into explicit editor nodes. Editing itself never infers element types with regex.

Core-element export/reimport is tested with multiple speakers, multiline dialogue, XML-like literal text and explicit breaks. Fountain emphasis and advanced constructs are not represented as rich text marks; dual-dialogue layout and production annotations are not preserved. Shot/general elements flatten to action on Fountain round trips. Unsupported tokens are not a native backup. Use `.studio.json` before importing complex files.

## FDX

The exporter emits escaped XML with FinalDraft/Content/Paragraph/Text structure and a title page. The importer concatenates styled Text runs into the node's plain text. XML declarations are permitted; DOCTYPE/entity declarations and malformed XML are rejected. Unknown paragraph types become general text. A forced break is encoded with `StartsNewPage="Yes"`.

Automated round trips verify the supported elements, title/author, ampersands, angle brackets, quotes, parentheticals, multiple speakers, multiline dialogue and forced breaks. These checks validate our emitted XML and mapping; they do not demonstrate lossless interoperability with every FDX producer.

**Fade In and Final Draft were not installed in the test environment. Opening the exported FDX in either application remains an external compatibility check.** No lossless round-trip claim is made. Production revision colors, dual dialogue, locked pages, scene numbering metadata, embedded resources, comments and rich styling are not preserved.

## PDF

PDF export runs locally using PDFKit, without a cloud service. It produces:

- Separate title page with author.
- US Letter or A4 selected in Project settings.
- Courier 12 and conventional screenplay columns/margins.
- Script page numbers starting at 1 after the title page.
- Forced page breaks.
- Cue/heading orphan guards and measured dialogue continuation with MORE/CONT'D.
- Multi-page action and dialogue.

A page-count test covers long dialogue and A4. A stress fixture generates substantially more than a feature's length. The saved page count in the editor uses this exporter, while the live surface remains continuous.

This is an initial screenplay typesetter, not a complete production-layout engine. Dual dialogue, locked pages, revision marks, font embedding for all Unicode scripts and exact Fade In/Final Draft page matching are outside this version. Built-in Courier has a limited glyph repertoire.

Planning documents, story-circle stages and reference notes remain in native/document JSON and revision history. Fountain, FDX and screenplay PDF exports contain the screenplay, not the Planning workspace.
