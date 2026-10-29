import { useEffect, useRef, memo } from 'react';
import { EditorContent, useEditor, type Editor, type JSONContent } from '@tiptap/react';
import { Node, Extension, mergeAttributes } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Plugin, TextSelection } from '@tiptap/pm/state';
import type { NoteTarget } from './ReviewNotes';
import { mapReviewAnchors } from './reviewAnchors';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { kinds, type Block, type ReviewNote } from './model';
const screenplay = Node.create({
  name: 'screenplayBlock',
  group: 'block',
  content: 'inline*',
  defining: true,
  addAttributes() {
    return { id: { default: null }, kind: { default: 'action' } };
  },
  parseHTML() {
    return [{ tag: 'p[data-kind]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'p',
      mergeAttributes(HTMLAttributes, {
        'data-kind': HTMLAttributes.kind,
        'data-block-id': HTMLAttributes.id,
        id: HTMLAttributes.id,
        class: `script-block ${HTMLAttributes.kind}`,
      }),
      0,
    ];
  },
  addKeyboardShortcuts() {
    const cycle = (delta: number) => {
      const kind = this.editor.state.selection.$from.parent.attrs.kind;
      return this.editor.commands.updateAttributes('screenplayBlock', {
        kind: kinds[(kinds.indexOf(kind) + delta + kinds.length) % kinds.length],
      });
    };
    return {
      Tab: () => cycle(1),
      'Shift-Tab': () => cycle(-1),
      Enter: () => {
        const kind = this.editor.state.selection.$from.parent.attrs.kind;
        return this.editor
          .chain()
          .splitBlock()
          .updateAttributes('screenplayBlock', {
            id: crypto.randomUUID(),
            kind: kind === 'character' || kind === 'parenthetical' ? 'dialogue' : 'action',
          })
          .run();
      },
      'Mod-Alt-1': () =>
        this.editor.commands.updateAttributes('screenplayBlock', { kind: 'scene' }),
      'Mod-Alt-2': () =>
        this.editor.commands.updateAttributes('screenplayBlock', { kind: 'action' }),
      'Mod-Alt-3': () =>
        this.editor.commands.updateAttributes('screenplayBlock', { kind: 'character' }),
      'Mod-Alt-4': () =>
        this.editor.commands.updateAttributes('screenplayBlock', { kind: 'dialogue' }),
    };
  },
});
const stableIDs = Extension.create({
  name: 'stableIDs',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction: (_transactions, _old, state) => {
          const seen = new Set<string>();
          const tr = state.tr;
          state.doc.descendants((node, pos) => {
            if (node.type.name === 'screenplayBlock') {
              const id = node.attrs.id;
              if (!id || seen.has(id))
                tr.setNodeMarkup(pos, undefined, { ...node.attrs, id: crypto.randomUUID() });
              else seen.add(id);
            }
          });
          return tr.docChanged ? tr : null;
        },
      }),
    ];
  },
});
const toJSON = (blocks: Block[]): JSONContent => ({
  type: 'doc',
  content: (blocks.length ? blocks : [{ id: crypto.randomUUID(), type: 'action', text: '' }]).map(
    (b) => ({
      type: 'screenplayBlock',
      attrs: { id: b.id, kind: b.type },
      content: b.text
        .split('\n')
        .flatMap((line, i) => [
          ...(i ? [{ type: 'hardBreak' }] : []),
          ...(line ? [{ type: 'text', text: line }] : []),
        ]),
    }),
  ),
});
const fromJSON = (doc: JSONContent): Block[] =>
  (doc.content ?? []).map((n) => ({
    id: n.attrs?.id ?? crypto.randomUUID(),
    type: n.attrs?.kind ?? 'action',
    text: (n.content ?? []).map((c) => (c.type === 'hardBreak' ? '\n' : (c.text ?? ''))).join(''),
  }));
const noReviewNotes: ReviewNote[] = [];
export const ScreenplayEditor = memo(function ScreenplayEditor({
  blocks,
  notes = noReviewNotes,
  showNotes = true,
  reviewMode = false,
  pendingNote,
  openNoteId,
  pages,
  singlePage = 0,
  onPinNote,
  onOpenNote,
  onChange,
  onFocus,
  onReady,
}: {
  blocks: Block[];
  notes?: ReviewNote[];
  showNotes?: boolean;
  reviewMode?: boolean;
  pendingNote?: NoteTarget;
  openNoteId?: string;
  pages?: Record<string, number>;
  singlePage?: number;
  onPinNote?: (target: NoteTarget) => void;
  onOpenNote?: (id: string) => void;
  onChange: (b: Block[], notes?: ReviewNote[]) => void;
  onFocus: (id: string) => void;
  onReady: (editor: Editor) => void;
}) {
  const props = useRef({
    onChange,
    onFocus,
    onReady,
    reviewMode,
    onPinNote,
    onOpenNote,
    showNotes,
    pendingNote,
    openNoteId,
    pages,
    singlePage,
  });
  props.current = {
    onChange,
    onFocus,
    onReady,
    reviewMode,
    onPinNote,
    onOpenNote,
    showNotes,
    pendingNote,
    openNoteId,
    pages,
    singlePage,
  };
  const reviewNotes = useRef(notes);
  reviewNotes.current = notes;
  const reviewHighlights = Extension.create({
    name: 'reviewHighlights',
    addProseMirrorPlugins() {
      return [
        new Plugin({
          props: {
            decorations(state) {
              const decorations: Decoration[] = [];
              const { pages: pageOf, singlePage: only } = props.current;
              let sceneNumber = 0;
              state.doc.forEach((node, pos) => {
                if (node.attrs.kind === 'scene')
                  decorations.push(
                    Decoration.node(pos, pos + node.nodeSize, {
                      'data-scene': String(++sceneNumber),
                    }),
                  );
              });
              if (pageOf) {
                let page = 1;
                state.doc.forEach((node, pos) => {
                  const next = pageOf[node.attrs.id] ?? page;
                  if (only) {
                    if (next !== only)
                      decorations.push(
                        Decoration.node(pos, pos + node.nodeSize, { class: 'page-hidden' }),
                      );
                  } else if (next !== page)
                    decorations.push(
                      Decoration.widget(
                        pos,
                        () => {
                          const divider = document.createElement('div');
                          divider.className = 'page-divider';
                          divider.contentEditable = 'false';
                          const label = document.createElement('span');
                          label.textContent = 'pg ' + next;
                          divider.append(label);
                          return divider;
                        },
                        {
                          side: -1,
                          key: 'page-' + next,
                          ignoreSelection: true,
                          stopEvent: () => true,
                        },
                      ),
                    );
                  page = next;
                });
              }
              const open: ReviewNote[] = props.current.showNotes
                ? reviewNotes.current.filter((n) => n.status !== 'resolved')
                : [];
              const draft = props.current.showNotes ? props.current.pendingNote : undefined;
              if (draft)
                open.push({ ...draft, id: 'composer', text: '', category: 'note', status: 'open' });
              state.doc.forEach((node, pos) => {
                const attached = open.filter((n) => (n.blockId ?? n.sceneId) === node.attrs.id);
                if (!attached.length) return;
                for (const n of attached) {
                  const text = node.textBetween(0, node.content.size, '\n', '\n');
                  const index = n.anchorFrom ?? (n.quote ? text.indexOf(n.quote) : -1);
                  const end = n.anchorTo ?? (n.quote ? index + n.quote.length : index);
                  if (index >= 0 && end > index && end <= node.content.size)
                    decorations.push(
                      Decoration.inline(pos + 1 + index, pos + 1 + end, {
                        class:
                          'review-passage-highlight' +
                          (n.id === props.current.openNoteId ? ' active' : ''),
                        'data-review-note-id': n.id,
                        title: n.text || 'Review note',
                      }),
                    );
                }
              });
              return DecorationSet.create(state.doc, decorations);
            },
          },
        }),
      ];
    },
  });
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        paragraph: false,
        heading: false,
        blockquote: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        codeBlock: false,
        horizontalRule: false,
        link: false,
        underline: false,
        bold: false,
        italic: false,
        strike: false,
        code: false,
      }),
      screenplay,
      stableIDs,
      reviewHighlights,
    ],
    content: toJSON(blocks),
    editorProps: {
      handleClick(view, pos, event) {
        const hit = (event.target as HTMLElement).closest<HTMLElement>('[data-review-note-id]');
        const noteId = hit?.dataset.reviewNoteId;
        if (noteId && noteId !== 'composer') {
          props.current.onOpenNote?.(noteId);
          return props.current.reviewMode;
        }
        if (!props.current.reviewMode) return false;
        const $pos = view.state.doc.resolve(pos);
        if ($pos.parent.type.name !== 'screenplayBlock') return false;
        const text = $pos.parent.textBetween(0, $pos.parent.content.size, '\n', '\n');
        const offset = $pos.parentOffset;
        let from = offset,
          to = offset;
        const word = (char: string | undefined) => !!char && /[\p{L}\p{N}'’_-]/u.test(char);
        if (word(text[offset]) || word(text[offset - 1])) {
          while (from > 0 && word(text[from - 1])) from--;
          while (to < text.length && word(text[to])) to++;
        }
        let sceneId: string | undefined;
        view.state.doc.forEach((node, at) => {
          if (at <= pos && node.attrs.kind === 'scene') sceneId = node.attrs.id;
        });
        view.dispatch(
          view.state.tr.setSelection(
            TextSelection.create(view.state.doc, $pos.start() + from, $pos.start() + to),
          ),
        );
        props.current.onPinNote?.({
          blockId: $pos.parent.attrs.id,
          sceneId,
          anchorFrom: from,
          anchorTo: to,
          pinOffset: offset,
          quote: text.slice(from, to),
          key: Date.now(),
        });
        return true;
      },
      attributes: { 'aria-label': 'Screenplay editor', role: 'textbox', 'aria-multiline': 'true' },
      transformPastedHTML: () => '',
      handleKeyDown: (view, event) => {
        if ((event.metaKey || event.ctrlKey) && event.altKey && /^Digit[1-4]$/.test(event.code)) {
          const kind = ['scene', 'action', 'character', 'dialogue'][
            Number(event.code.slice(-1)) - 1
          ];
          const pos = view.state.selection.$from;
          view.dispatch(
            view.state.tr.setNodeMarkup(pos.before(), undefined, { ...pos.parent.attrs, kind }),
          );
          return true;
        }
        return false;
      },
      handlePaste: (view, e) => {
        const text = e.clipboardData?.getData('text/plain');
        if (text !== undefined) {
          view.dispatch(view.state.tr.insertText(text));
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor, transaction }) =>
      props.current.onChange(
        fromJSON(editor.getJSON()),
        mapReviewAnchors(
          reviewNotes.current,
          transaction.before,
          editor.state.doc,
          transaction.mapping,
        ),
      ),
    onSelectionUpdate: ({ editor }) =>
      props.current.onFocus(editor.state.selection.$from.parent.attrs.id),
    onFocus: ({ editor }) => props.current.onFocus(editor.state.selection.$from.parent.attrs.id),
    onCreate: ({ editor }) => props.current.onReady(editor),
  });
  useEffect(() => {
    if (!editor) return;
    const existing = fromJSON(editor.getJSON());
    if (JSON.stringify(existing) !== JSON.stringify(blocks)) {
      const scroller = editor.view.dom.closest('main');
      const top = scroller?.scrollTop;
      const position = editor.state.selection.from;
      editor.commands.setContent(toJSON(blocks), { emitUpdate: false });
      editor.commands.setTextSelection(Math.min(position, editor.state.doc.content.size - 1));
      if (scroller && top !== undefined) scroller.scrollTop = top;
    }
  }, [blocks, editor]);
  useEffect(() => {
    if (editor && !editor.isDestroyed)
      editor.view.dispatch(editor.state.tr.setMeta('reviewNotesChanged', true));
  }, [notes, editor, pendingNote, showNotes, openNoteId, pages, singlePage]);
  useEffect(() => {
    if (editor && !editor.isDestroyed) editor.setEditable(!reviewMode, false);
  }, [editor, reviewMode]);
  return (
    <EditorContent className={reviewMode ? 'screenplay-review-mode' : undefined} editor={editor} />
  );
});
