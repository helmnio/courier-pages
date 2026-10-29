import React, { useEffect, useState } from 'react';
import type { Script, ReviewNote } from './model';
import { useRemembered } from './workspace';
export type NoteTarget = {
  sceneId?: string;
  blockId?: string;
  quote?: string;
  anchorFrom?: number;
  anchorTo?: number;
  pinOffset?: number;
  key: number;
};
type Props = {
  initialNoteId?: string;
  projectId: string;
  document: Script;
  target?: NoteTarget;
  onTargetConsumed: () => void;
  onChange: (notes: ReviewNote[]) => void;
  onNavigate: (id: string) => void;
};
const categories = { note: 'General', continuity: 'Continuity', critique: 'Story & craft' };
export function ReviewNotes({
  projectId,
  initialNoteId,
  document: d,
  target,
  onTargetConsumed,
  onChange,
  onNavigate,
}: Props) {
  const [query, setQuery] = useRemembered(projectId + ':notes-search', '');
  const [status, setStatus] = useRemembered(projectId + ':notes-status', 'open');
  const [sceneFilter, setSceneFilter] = useRemembered(projectId + ':notes-scene', 'all');
  const [priorityFilter, setPriorityFilter] = useRemembered(projectId + ':notes-priority', 'all');
  const [draft, setDraft] = useRemembered(projectId + ':note-draft', {
    text: '',
    author: '',
    sceneId: '',
    blockId: '',
    quote: '',
    category: 'note',
    priority: 'normal',
  });
  useEffect(() => {
    if (!target) return;
    setDraft((old) => ({
      ...old,
      sceneId: target.sceneId ?? '',
      blockId: target.blockId ?? '',
      quote: target.quote ?? '',
    }));
    setStatus('open');
    setSceneFilter('all');
    setQuery('');
    setPriorityFilter('all');
    onTargetConsumed();
  }, [target?.key]);
  useEffect(() => {
    if (initialNoteId) {
      setStatus('all');
      setSceneFilter('all');
      setPriorityFilter('all');
      setQuery('');
    }
  }, [initialNoteId]);
  const scenes = d.blocks.filter((b) => b.type === 'scene');
  const patch = (id: string, changes: Partial<ReviewNote>) =>
    onChange(
      d.notes.map((n) =>
        n.id === id ? { ...n, ...changes, updatedAt: new Date().toISOString() } : n,
      ),
    );
  const visible = d.notes
    .filter(
      (n) =>
        (status === 'all' ||
          (status === 'resolved' ? n.status === 'resolved' : n.status !== 'resolved')) &&
        (sceneFilter === 'all' ||
          (sceneFilter === 'project' ? !n.sceneId : n.sceneId === sceneFilter)) &&
        (priorityFilter === 'all' || (n.priority ?? 'normal') === priorityFilter) &&
        [
          n.text,
          n.quote,
          n.author,
          ...(n.replies ?? []).map((r) => r.text + ' ' + (r.author ?? '')),
        ]
          .join(' ')
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort(
      (a, b) =>
        ({ high: 2, normal: 1, low: 0 })[b.priority ?? 'normal'] -
          { high: 2, normal: 1, low: 0 }[a.priority ?? 'normal'] ||
        (b.createdAt ?? '').localeCompare(a.createdAt ?? ''),
    );
  useEffect(() => {
    if (initialNoteId)
      window.document
        .getElementById('review-note-' + initialNoteId)
        ?.scrollIntoView({ block: 'center' });
  }, [initialNoteId, visible.length]);
  return (
    <section className="panel review-notes">
      <div className="review-heading">
        <div>
          <div className="eyebrow">FEEDBACK & FOLLOW-THROUGH</div>
          <h2>Review notes</h2>
          <p>
            Keep feedback beside your screenplay. Resolving a note leaves the writing untouched.
          </p>
        </div>
        <span className="review-total">
          {d.notes.filter((n) => n.status !== 'resolved').length} open ·{' '}
          {d.notes.filter((n) => n.status === 'resolved').length} resolved
        </span>
      </div>
      <form
        className="note-composer"
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.text.trim()) return;
          const now = new Date().toISOString();
          onChange([
            ...d.notes,
            {
              id: crypto.randomUUID(),
              text: draft.text.trim(),
              category: draft.category as ReviewNote['category'],
              priority: draft.priority as ReviewNote['priority'],
              author: draft.author.trim(),
              sceneId: draft.sceneId || undefined,
              blockId: draft.blockId || undefined,
              quote: draft.quote || undefined,
              status: 'open',
              createdAt: now,
              updatedAt: now,
              replies: [],
            },
          ]);
          setDraft({ ...draft, text: '', blockId: '', quote: '' });
          setStatus('open');
          setSceneFilter('all');
          setPriorityFilter('all');
          setQuery('');
        }}
      >
        <h3>Add a review note</h3>
        <div className="note-fields">
          <label>
            Attach to
            <select
              aria-label="New note scene"
              value={draft.sceneId}
              onChange={(e) =>
                setDraft({ ...draft, sceneId: e.target.value, blockId: '', quote: '' })
              }
            >
              <option value="">Whole project</option>
              {scenes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.text || 'Untitled scene'}
                </option>
              ))}
            </select>
          </label>
          <label>
            Category
            <select
              aria-label="New note category"
              value={draft.category}
              onChange={(e) => setDraft({ ...draft, category: e.target.value })}
            >
              {Object.entries(categories).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            Priority
            <select
              aria-label="New note priority"
              value={draft.priority}
              onChange={(e) => setDraft({ ...draft, priority: e.target.value })}
            >
              {['low', 'normal', 'high'].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label>
            Reviewer
            <input
              aria-label="Reviewer name"
              placeholder="Optional name"
              maxLength={200}
              value={draft.author}
              onChange={(e) => setDraft({ ...draft, author: e.target.value })}
            />
          </label>
        </div>
        {draft.quote && (
          <div>
            <blockquote>{draft.quote}</blockquote>
            <button type="button" onClick={() => setDraft({ ...draft, quote: '', blockId: '' })}>
              Remove passage reference
            </button>
          </div>
        )}
        <label>
          Feedback
          <textarea
            aria-label="New review note"
            rows={3}
            maxLength={100000}
            placeholder="What needs attention, and why?"
            value={draft.text}
            onChange={(e) => setDraft({ ...draft, text: e.target.value })}
          />
        </label>
        <button type="submit" className="primary" disabled={!draft.text.trim()}>
          Add note
        </button>
      </form>
      <div className="note-filters">
        <label>
          Search
          <input
            aria-label="Search review notes"
            placeholder="Notes, passages, reviewers, replies…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label>
          Status
          <select
            aria-label="Filter note status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
            <option value="all">All</option>
          </select>
        </label>
        <label>
          Scene
          <select
            aria-label="Filter note scene"
            value={sceneFilter}
            onChange={(e) => setSceneFilter(e.target.value)}
          >
            <option value="all">All scenes & project</option>
            <option value="project">Whole project</option>
            {scenes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.text || 'Untitled scene'}
              </option>
            ))}
            {d.notes.some((n) => n.sceneId === sceneFilter) &&
              !scenes.some((s) => s.id === sceneFilter) &&
              sceneFilter !== 'all' && <option value={sceneFilter}>Removed scene</option>}
          </select>
        </label>
        <label>
          Priority
          <select
            aria-label="Filter note priority"
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
          >
            <option value="all">All priorities</option>
            {['high', 'normal', 'low'].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="note-result-count">
        {visible.length} {visible.length === 1 ? 'note' : 'notes'} shown
      </p>
      {!visible.length && (
        <div className="note-empty">
          {d.notes.length
            ? 'No notes match these filters.'
            : 'No review notes yet. Add feedback here, or select a passage in the screenplay and choose “＋ Review note”.'}
        </div>
      )}
      <div className="note-list">
        {visible.map((n) => (
          <NoteCard
            key={n.id}
            note={n}
            document={d}
            onPatch={(changes) => patch(n.id, changes)}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </section>
  );
}
function NoteCard({
  note: n,
  document: d,
  onPatch,
  onNavigate,
}: {
  note: ReviewNote;
  document: Script;
  onPatch: (changes: Partial<ReviewNote>) => void;
  onNavigate: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [reply, setReply] = useState('');
  const [replyAuthor, setReplyAuthor] = useState('');
  const scene = d.blocks.find((b) => b.id === n.sceneId && b.type === 'scene');
  const block = d.blocks.find((b) => b.id === n.blockId);
  const passage = block
    ? d.blocks
        .slice(d.blocks.indexOf(block))
        .map((b) => b.text)
        .join('\n')
    : '';
  const changed = n.quote && !passage.includes(n.quote);
  return (
    <article
      id={'review-note-' + n.id}
      className={'review-note ' + (n.status === 'resolved' ? 'resolved' : '')}
      aria-label={'Review note: ' + n.text.slice(0, 80)}
    >
      <div className="note-card-top">
        <span className={'note-priority ' + (n.priority ?? 'normal')}>
          {n.priority ?? 'normal'}
        </span>
        <span>{categories[n.category]}</span>
        <span className="note-state">
          {n.status === 'resolved' ? 'Resolved' : n.status === 'addressed' ? 'Addressed' : 'Open'}
        </span>
      </div>
      <div className="note-context">
        {scene || block ? (
          <button onClick={() => onNavigate(block?.id ?? scene!.id)}>
            {scene?.text || 'Referenced passage'} ↗
          </button>
        ) : (
          <span>
            {n.sceneId || n.blockId ? 'Referenced scene or passage was removed' : 'Whole project'}
          </span>
        )}
      </div>
      {n.quote && (
        <>
          <blockquote>{n.quote}</blockquote>
          {changed && <small>Original passage reference — the text has changed or moved.</small>}
        </>
      )}
      {editing ? (
        <label>
          Note text
          <textarea
            aria-label="Edit review note"
            rows={4}
            maxLength={100000}
            value={n.text}
            onChange={(e) => onPatch({ text: e.target.value })}
          />
        </label>
      ) : (
        <p className="note-text">{n.text}</p>
      )}
      <small>
        {n.author || 'Unnamed reviewer'}
        {n.createdAt ? ' · ' + new Date(n.createdAt).toLocaleString() : ' · Existing note'}
      </small>
      <div className="note-actions">
        <button onClick={() => onPatch({ status: n.status === 'resolved' ? 'open' : 'resolved' })}>
          {n.status === 'resolved' ? 'Reopen note' : 'Resolve note'}
        </button>
        <button onClick={() => setEditing(!editing)}>
          {editing ? 'Done editing' : 'Edit note'}
        </button>
        <label>
          Priority
          <select
            aria-label="Note priority"
            value={n.priority ?? 'normal'}
            onChange={(e) => onPatch({ priority: e.target.value as ReviewNote['priority'] })}
          >
            {['low', 'normal', 'high'].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
      </div>
      {!!n.replies?.length && (
        <ol className="note-replies">
          {n.replies.map((r) => (
            <li key={r.id}>
              <p>{r.text}</p>
              <small>
                {r.author || 'Unnamed reviewer'} · {new Date(r.createdAt).toLocaleString()}
              </small>
            </li>
          ))}
        </ol>
      )}
      <form
        className="note-reply"
        onSubmit={(e) => {
          e.preventDefault();
          if (!reply.trim()) return;
          onPatch({
            replies: [
              ...(n.replies ?? []),
              {
                id: crypto.randomUUID(),
                text: reply.trim(),
                author: replyAuthor.trim(),
                createdAt: new Date().toISOString(),
              },
            ],
          });
          setReply('');
        }}
      >
        <label>
          Reply
          <textarea
            aria-label="Reply to note"
            rows={2}
            maxLength={100000}
            placeholder="Follow up or record how this was addressed…"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
          />
        </label>
        <div>
          <input
            aria-label="Reply author"
            placeholder="Your name (optional)"
            maxLength={200}
            value={replyAuthor}
            onChange={(e) => setReplyAuthor(e.target.value)}
          />
          <button type="submit" disabled={!reply.trim()}>
            Add reply
          </button>
        </div>
      </form>
    </article>
  );
}
