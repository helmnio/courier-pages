import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { ReviewNote, Script } from './model';
import type { NoteTarget } from './ReviewNotes';
import { useRemembered } from './workspace';
const MARKER = 30;
/**
 * Review notes live in the page margin as small markers aligned to the passage they
 * discuss. A marker expands into a card over the page, so the layout is the same at
 * every pane width and the screenplay text is never displaced.
 */
export function ScriptNotes({
  projectId,
  document: d,
  target,
  children,
  visible,
  openId,
  onOpenId,
  isVisible,
  onChange,
  onCancel,
  onOpen,
}: {
  visible: boolean;
  projectId: string;
  document: Script;
  target?: NoteTarget;
  children: ReactNode;
  openId?: string;
  isVisible?: (blockId?: string) => boolean;
  onOpenId: (id: string | undefined) => void;
  onChange: (notes: ReviewNote[]) => void;
  onCancel: () => void;
  onOpen: (id: string) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLFormElement>(null);
  const [showResolved, setShowResolved] = useRemembered(projectId + ':sticky-resolved', false);
  const [positions, setPositions] = useState<Record<string, number>>({});
  const [text, setText] = useRemembered(projectId + ':sticky-draft', '');
  const notes = d.notes.filter(
    (n) =>
      (showResolved || n.status !== 'resolved') &&
      (!isVisible || isVisible(n.blockId ?? n.sceneId)),
  );
  const resolved = d.notes.filter((n) => n.status === 'resolved').length;
  // Measure real editor paragraphs; no screenplay text or editor nodes are inserted for notes.
  useLayoutEffect(() => {
    const wrapper = root.current;
    if (!visible || !wrapper) return;
    let frame = 0;
    const measure = () => {
      const origin = wrapper.getBoundingClientRect().top;
      const blocks = new Map(
        Array.from(wrapper.querySelectorAll<HTMLElement>('[data-block-id]')).map((el) => [
          el.dataset.blockId,
          el,
        ]),
      );
      const entries = notes.map((n) => ({ id: n.id, blockId: n.blockId, sceneId: n.sceneId }));
      if (target)
        entries.push({ id: 'composer', blockId: target.blockId, sceneId: target.sceneId });
      const paper = wrapper.querySelector<HTMLElement>('.paper');
      const anchor = (entry: (typeof entries)[number]) => {
        const pin = Array.from(wrapper.querySelectorAll<HTMLElement>('[data-review-note-id]')).find(
          (el) => el.dataset.reviewNoteId === entry.id,
        );
        const el = pin ?? blocks.get(entry.blockId ?? '') ?? blocks.get(entry.sceneId ?? '');
        return el
          ? el.getBoundingClientRect().top - origin
          : entry.blockId || entry.sceneId
            ? (paper?.offsetHeight ?? 100)
            : 8;
      };
      entries.sort((a, b) => anchor(a) - anchor(b));
      let bottom = 0;
      const next: Record<string, number> = {};
      for (const entry of entries) {
        const top = Math.max(bottom, anchor(entry));
        next[entry.id] = top;
        bottom = top + MARKER + 4;
      }
      setPositions((old) => (JSON.stringify(old) === JSON.stringify(next) ? old : next));
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const resize = new ResizeObserver(schedule);
    const paper = wrapper.querySelector('.paper');
    if (paper) resize.observe(paper);
    window.addEventListener('resize', schedule);
    const editor = wrapper.querySelector('.tiptap');
    const observer = new MutationObserver(schedule);
    if (editor) observer.observe(editor, { subtree: true, childList: true, characterData: true });
    measure();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      observer.disconnect();
      window.removeEventListener('resize', schedule);
    };
  }, [d.blocks, d.notes, target?.key, showResolved, visible, isVisible]);
  const composerPlaced = !!target && positions.composer !== undefined;
  useEffect(() => {
    // Focus once the box sits beside the passage. Focusing earlier scrolls to wherever it first rendered.
    if (!composerPlaced) return;
    composer.current
      ?.querySelector<HTMLTextAreaElement>('textarea')
      ?.focus({ preventScroll: true });
    composer.current?.scrollIntoView({ block: 'nearest' });
  }, [composerPlaced, target?.key]);
  useEffect(() => {
    if (!openId) return;
    const away = (e: Event) => {
      const el = e.target as Element;
      if (!el.closest?.('.note-card, .note-marker, .review-passage-highlight')) onOpenId(undefined);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onOpenId(undefined);
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [openId]);
  const patch = (id: string, changes: Partial<ReviewNote>) =>
    onChange(
      d.notes.map((n) =>
        n.id === id ? { ...n, ...changes, updatedAt: new Date().toISOString() } : n,
      ),
    );
  const glyph = (n: ReviewNote) =>
    n.status === 'resolved'
      ? '✓'
      : n.priority === 'high'
        ? '!'
        : n.replies?.length
          ? String(n.replies.length)
          : '✎';
  return (
    <div ref={root} className={'note-layer' + (visible ? ' with-markers' : '')}>
      {visible && (resolved > 0 || notes.length > 0) && (
        <div className="note-legend">
          <span>
            {notes.length} {notes.length === 1 ? 'note' : 'notes'}
          </span>
          {resolved > 0 && (
            <label>
              <input
                type="checkbox"
                checked={showResolved}
                onChange={(e) => setShowResolved(e.target.checked)}
              />{' '}
              Show resolved ({resolved})
            </label>
          )}
        </div>
      )}
      {children}
      {visible && (
        <div className="note-markers" aria-label="Review notes">
          {notes.map((n) => {
            const missing =
              (n.blockId || n.sceneId) && !d.blocks.some((b) => b.id === (n.blockId ?? n.sceneId));
            const open = openId === n.id;
            const top = positions[n.id] ?? 8;
            return (
              <React.Fragment key={n.id}>
                <button
                  className={
                    'note-marker' +
                    (n.status === 'resolved' ? ' resolved' : n.priority === 'high' ? ' high' : '') +
                    (open ? ' open' : '')
                  }
                  data-sticky-id={n.id}
                  style={{ top }}
                  aria-expanded={open}
                  aria-label={'Review note: ' + n.text.slice(0, 80)}
                  onClick={() => onOpenId(open ? undefined : n.id)}
                >
                  {glyph(n)}
                </button>
                {open && (
                  <article className="note-card" style={{ top: top + MARKER + 2 }}>
                    <div className="sticky-meta">
                      <span>{n.category === 'critique' ? 'Story & craft' : n.category}</span>
                      <span>
                        {n.priority === 'high'
                          ? 'High priority'
                          : n.status === 'resolved'
                            ? 'Resolved'
                            : n.status === 'addressed'
                              ? 'Addressed'
                              : 'Open'}
                      </span>
                      <button
                        className="note-close"
                        aria-label="Close note"
                        onClick={() => onOpenId(undefined)}
                      >
                        ×
                      </button>
                    </div>
                    {n.quote && <blockquote>{n.quote}</blockquote>}
                    {missing && <small>Original passage removed</small>}
                    {!n.sceneId && !n.blockId && <small>Whole project</small>}
                    <p>{n.text}</p>
                    {n.replies?.length ? (
                      <div className="note-latest-reply">
                        <small>{n.replies[n.replies.length - 1].author || 'Reply'}</small>
                        <p>{n.replies[n.replies.length - 1].text}</p>
                      </div>
                    ) : null}
                    <small>
                      {n.author || 'Review note'}
                      {n.replies?.length ? ` · ${n.replies.length} replies` : ''}
                    </small>
                    <div className="sticky-actions">
                      <button onClick={() => onOpen(n.id)}>Open discussion</button>
                      <button
                        onClick={() => {
                          patch(n.id, { status: n.status === 'resolved' ? 'open' : 'resolved' });
                          onOpenId(undefined);
                        }}
                      >
                        {n.status === 'resolved' ? 'Reopen' : 'Resolve'}
                      </button>
                    </div>
                  </article>
                )}
              </React.Fragment>
            );
          })}
          {target && (
            <>
              <span
                className="note-marker open"
                style={{ top: positions.composer ?? 8 }}
                aria-hidden="true"
              >
                ＋
              </span>
              <form
                key={target.key}
                ref={composer}
                className="note-card sticky-composer"
                style={{
                  top: (positions.composer ?? 8) + MARKER + 2,
                  visibility: composerPlaced ? 'visible' : 'hidden',
                }}
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!text.trim()) return;
                  const now = new Date().toISOString();
                  onChange([
                    ...d.notes,
                    {
                      id: crypto.randomUUID(),
                      sceneId: target.sceneId,
                      blockId: target.blockId,
                      quote: target.quote || undefined,
                      anchorFrom: target.anchorFrom,
                      anchorTo: target.anchorTo,
                      pinOffset: target.pinOffset,
                      category: 'note',
                      text: text.trim(),
                      status: 'open',
                      priority: 'normal',
                      createdAt: now,
                      updatedAt: now,
                      replies: [],
                    },
                  ]);
                  setText('');
                  onCancel();
                }}
              >
                <strong>New review note</strong>
                {target.quote && <blockquote>{target.quote}</blockquote>}
                <label>
                  Review feedback
                  <textarea
                    aria-label="Sticky note feedback"
                    rows={4}
                    value={text}
                    maxLength={100000}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Your note on this passage…"
                  />
                </label>
                <div className="sticky-actions">
                  <button type="submit" disabled={!text.trim()}>
                    Pin note
                  </button>
                  <button type="button" onClick={onCancel}>
                    Cancel
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      )}
    </div>
  );
}
