import {
  Fragment,
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import type { Block, ReviewNote, Script } from './model';
import type { Unit } from './changes';
import { wordDiff } from './Review';
export type Decision = 'accept' | 'skip' | 'revise';
export type Decisions = Record<string, Decision>;
export type ReviewView = 'original' | 'new' | 'changes';
/** Each view remembers its own scroll position. */
export type ViewScrolls = Partial<Record<ReviewView, number>>;
const typeLabels: Record<string, string> = {
  scene: 'Scene heading',
  action: 'Action',
  character: 'Character',
  dialogue: 'Dialogue',
  parenthetical: 'Parenthetical',
  transition: 'Transition',
  shot: 'Shot',
  general: 'General',
  pageBreak: 'Page break',
  note: 'Private note',
  section: 'Act / sequence',
};
const verbs = {
  changed: ['Accept', 'Skip'],
  added: ['Accept', 'Skip'],
  removed: ['Accept removal', 'Keep'],
} as const;
interface ReviewContextValue {
  requests: Record<string, string>;
  onRequest: (id: string, text: string) => void;
  notesFor: (blockId?: string) => ReviewNote[];
  editing: string | null;
  setEditing: (id: string | null) => void;
}
const ReviewContext = createContext<ReviewContextValue | null>(null);
/** Shares revise requests, the notes already on a passage, and which element is being edited. */
export function ReviewScope({
  requests,
  onRequest,
  notesFor,
  children,
}: {
  requests: Record<string, string>;
  onRequest: (id: string, text: string) => void;
  notesFor: (blockId?: string) => ReviewNote[];
  children: ReactNode;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <ReviewContext.Provider value={{ requests, onRequest, notesFor, editing, setEditing }}>
      {children}
    </ReviewContext.Provider>
  );
}
function Controls({
  unit,
  decision,
  onDecide,
}: {
  unit: Unit;
  decision?: Decision;
  onDecide: (id: string, value?: Decision) => void;
}) {
  const ctx = useContext(ReviewContext);
  const [yes, no] = verbs[unit.kind];
  return (
    <div className="unit-controls" role="group" aria-label={'Decide: ' + (unit.label || 'change')}>
      {unit.conflict && <span className="unit-conflict">You edited this since</span>}
      <button
        className={decision === 'accept' ? 'on accept' : 'accept'}
        aria-pressed={decision === 'accept'}
        onClick={() => onDecide(unit.id, decision === 'accept' ? undefined : 'accept')}
      >
        ✓ {yes}
      </button>
      <button
        className={decision === 'skip' ? 'on skip' : 'skip'}
        aria-pressed={decision === 'skip'}
        onClick={() => onDecide(unit.id, decision === 'skip' ? undefined : 'skip')}
      >
        ✕ {no}
      </button>
      {ctx && (
        <button
          className={decision === 'revise' ? 'on revise' : 'revise'}
          aria-pressed={decision === 'revise'}
          title="Leave this as it is and add a note so chat revises it again"
          onClick={() => {
            if (decision === 'revise') {
              ctx.onRequest(unit.id, '');
              onDecide(unit.id, undefined);
            } else ctx.setEditing(unit.id);
          }}
        >
          ✎ Revise
        </button>
      )}
    </div>
  );
}
/** Notes already on this passage, the revise request, and the box to write one. */
function ItemExtras({
  unit,
  decision,
  onDecide,
}: {
  unit: Unit;
  decision?: Decision;
  onDecide: (id: string, value?: Decision) => void;
}) {
  const ctx = useContext(ReviewContext);
  const [text, setText] = useState(ctx?.requests[unit.id] ?? '');
  if (!ctx) return null;
  const notes = ctx.notesFor(unit.blockId);
  return (
    <>
      {notes.length > 0 && (
        <div className="addressed" aria-label="Open notes on this passage">
          {notes.map((n) => (
            <span className="note-chip" key={n.id} title={n.text}>
              ✎ {n.text.slice(0, 90)}
              {n.text.length > 90 ? '…' : ''}
            </span>
          ))}
        </div>
      )}
      {decision === 'revise' && ctx.editing !== unit.id && (
        <p className="revise-note">
          <strong>Revise:</strong> {ctx.requests[unit.id]}{' '}
          <button className="link" onClick={() => ctx.setEditing(unit.id)}>
            Edit
          </button>
        </p>
      )}
      {ctx.editing === unit.id && (
        <form
          className="revise-composer"
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            ctx.onRequest(unit.id, text.trim());
            onDecide(unit.id, 'revise');
            ctx.setEditing(null);
          }}
        >
          <label>
            What should change? This becomes a note chat can address.
            <textarea
              autoFocus
              rows={3}
              value={text}
              placeholder="e.g. Keep her silence, but lose the bow."
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          <div>
            <button type="submit" className="primary" disabled={!text.trim()}>
              Save request
            </button>
            <button type="button" onClick={() => ctx.setEditing(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </>
  );
}
function UnitText({ unit, decision }: { unit: Unit; decision?: Decision }) {
  if (unit.kind === 'added') return <ins className="unit-added">{unit.after}</ins>;
  if (unit.kind === 'removed') return <del>{unit.before}</del>;
  if (decision === 'accept') return <>{unit.after}</>;
  if (decision === 'skip') return <>{unit.before}</>;
  const segments = wordDiff(unit.before, unit.after);
  if (!segments)
    return (
      <>
        <del>{unit.before}</del> <ins>{unit.after}</ins>
      </>
    );
  return (
    <>
      {segments.map((s, i) =>
        s.kind === 'same' ? (
          <span key={i}>{s.text}</span>
        ) : s.kind === 'del' ? (
          <del key={i}>{s.text}</del>
        ) : (
          <ins key={i}>{s.text}</ins>
        ),
      )}
    </>
  );
}
type Row = { block?: Block; unit?: Unit };
/** The screenplay with the chat's changes marked in red and green, each one accepted or skipped on its own. */
export function ScriptReview({
  current,
  units,
  decisions,
  onDecide,
  title,
  view = 'changes',
  newDoc,
  scrolls,
  pages,
  newPages,
}: {
  pages?: Record<string, number>;
  newPages?: Record<string, number>;
  scrolls?: RefObject<ViewScrolls>;
  view?: ReviewView;
  newDoc?: Script;
  current: Script;
  units: Unit[];
  decisions: Decisions;
  onDecide: (id: string, value?: Decision) => void;
  title: string;
}) {
  const [open, setOpen] = useState<Set<number>>(new Set());
  const root = useRef<HTMLDivElement>(null);
  const changedIds = new Set(units.map((u) => u.blockId));
  const first = useRef(true);
  useLayoutEffect(() => {
    // Each view keeps its own place. Mounting (returning to the tab) never scrolls.
    if (first.current) {
      first.current = false;
      return;
    }
    const scroller = root.current?.closest('main');
    if (!scroller) return;
    const y = scrolls?.current?.[view];
    if (y !== undefined) scroller.scrollTop = y;
    else
      root.current
        ?.querySelector<HTMLElement>('[data-changed="true"], .review-item')
        ?.scrollIntoView({ block: 'center' });
  }, [view]);
  const numberScenes = (doc: Script) =>
    new Map(
      doc.blocks.filter((x) => x.type === 'scene').map((x, i) => [x.id, String(i + 1)] as const),
    );
  const sceneNo = numberScenes(view === 'new' ? (newDoc ?? current) : current);
  if (view !== 'changes') {
    const shown = view === 'new' ? (newDoc ?? current) : current;
    return (
      <div className="canvas review-canvas" ref={root}>
        <article className="paper review-script">
          <div className="paper-heading">
            {title}
            <span>
              {view === 'new' ? 'NEW SCRIPT · SKIPPED CHANGES LEFT OUT' : 'ORIGINAL SCRIPT'}
            </span>
          </div>
          {(() => {
            const map = view === 'new' ? (newPages ?? pages) : pages;
            let page = 1;
            return shown.blocks.map((b) => {
              const next = map?.[b.id] ?? page;
              const divider = next !== page ? <PageDivider key={'pg' + next} page={next} /> : null;
              page = next;
              return (
                <Fragment key={b.id}>
                  {divider}
                  <Plain block={b} changed={changedIds.has(b.id)} scene={sceneNo.get(b.id)} />
                </Fragment>
              );
            });
          })()}
        </article>
      </div>
    );
  }
  const byBlock = new Map(units.filter((u) => u.kind !== 'added').map((u) => [u.blockId!, u]));
  const added = new Map<string | null, Unit[]>();
  for (const u of units.filter((u) => u.kind === 'added'))
    added.set(u.anchorAfter ?? null, [...(added.get(u.anchorAfter ?? null) ?? []), u]);
  const rows: Row[] = [];
  const placed = new Set<string>();
  const pushAdded = (key: string | null) => {
    for (const u of added.get(key) ?? []) {
      if (placed.has(u.id)) continue;
      placed.add(u.id);
      rows.push({ unit: u });
      pushAdded(u.blockId!);
    }
  };
  pushAdded(null);
  for (const block of current.blocks) {
    rows.push({ block, unit: byBlock.get(block.id) });
    pushAdded(block.id);
  }
  for (const u of units) if (u.kind === 'added' && !placed.has(u.id)) rows.push({ unit: u });
  const pageOf = (r: Row) => pages?.[(r.block?.id ?? r.unit?.blockId)!];
  const rowPage: number[] = [];
  const startsPage: boolean[] = [];
  let lastPage = 1;
  rows.forEach((r, i) => {
    const p = pageOf(r) ?? lastPage;
    startsPage[i] = i > 0 && p !== lastPage;
    rowPage[i] = p;
    lastPage = p;
  });
  const changed = rows.map((r) => !!r.unit);
  const near = (i: number) => changed.slice(Math.max(0, i - 2), i + 3).some(Boolean);
  const out: React.ReactNode[] = [];
  for (let i = 0; i < rows.length;) {
    if (!near(i)) {
      let j = i;
      while (j < rows.length && !near(j)) j++;
      const key = i;
      if (open.has(key)) {
        for (let k = i; k < j; k++) {
          if (startsPage[k]) out.push(<PageDivider key={'pg' + k} page={rowPage[k]} />);
          out.push(<Plain key={k} block={rows[k].block!} scene={sceneNo.get(rows[k].block!.id)} />);
        }
      } else
        out.push(
          <button
            key={'gap' + key}
            className="unchanged-gap"
            onClick={() => setOpen(new Set([...open, key]))}
          >
            {j - i} unchanged element{j - i === 1 ? '' : 's'}
            {rowPage[i] !== rowPage[j - 1] ? ` · pg ${rowPage[i]}–${rowPage[j - 1]}` : ''}
          </button>,
        );
      i = j;
      continue;
    }
    const row = rows[i];
    if (startsPage[i]) out.push(<PageDivider key={'pg' + i} page={rowPage[i]} />);
    out.push(
      row.unit ? (
        <Changed
          key={row.unit.id}
          row={row}
          decision={decisions[row.unit.id]}
          onDecide={onDecide}
          scene={sceneNo.get(row.unit.blockId!)}
        />
      ) : (
        <Plain key={'p' + i} block={row.block!} scene={sceneNo.get(row.block!.id)} />
      ),
    );
    i++;
  }
  return (
    <div className="canvas review-canvas" ref={root}>
      <article className="paper review-script">
        <div className="paper-heading">
          {title}
          <span>REVIEWING CHANGES</span>
        </div>
        {out}
      </article>
    </div>
  );
}
function PageDivider({ page }: { page: number }) {
  return (
    <div className="page-divider" aria-label={'Page ' + page}>
      <span>pg {page}</span>
    </div>
  );
}
function Plain({ block, changed, scene }: { block: Block; changed?: boolean; scene?: string }) {
  return (
    <div
      className={`script-block ${block.type}`}
      data-block={block.id}
      data-scene={block.type === 'scene' ? scene : undefined}
      data-changed={changed || undefined}
    >
      {block.text || ' '}
    </div>
  );
}
function Changed({
  row,
  decision,
  onDecide,
  scene,
}: {
  scene?: string;
  row: Row;
  decision?: Decision;
  onDecide: (id: string, value?: Decision) => void;
}) {
  const unit = row.unit!;
  const skippedAdd = unit.kind === 'added' && decision === 'skip';
  return (
    <div className={`review-item ${unit.kind} ${decision ?? 'undecided'}`}>
      <div className="review-item-head">
        <span className="review-item-kind">
          {unit.kind === 'added' ? 'New' : unit.kind === 'removed' ? 'Removed' : 'Changed'} ·{' '}
          {typeLabels[unit.blockType ?? ''] ?? 'Element'}
        </span>
        <Controls unit={unit} decision={decision} onDecide={onDecide} />
      </div>
      <ItemExtras unit={unit} decision={decision} onDecide={onDecide} />
      {!skippedAdd && (
        <div
          className={`script-block ${unit.blockType}`}
          data-block={unit.blockId}
          data-scene={unit.blockType === 'scene' ? (scene ?? 'new') : undefined}
        >
          {unit.kind === 'removed' && decision === 'skip' ? (
            unit.before
          ) : (
            <UnitText unit={unit} decision={decision} />
          )}
        </div>
      )}
      {skippedAdd && <p className="review-skipped">Skipped</p>}
    </div>
  );
}
/** Changes the chat proposed to one tab's fields (bible, scenes, characters, plans, notes). */
export function ChangePanel({
  units,
  decisions,
  onDecide,
  onDecideAll,
}: {
  units: Unit[];
  decisions: Decisions;
  onDecide: (id: string, value?: Decision) => void;
  onDecideAll: (ids: string[], value: Decision) => void;
}) {
  if (!units.length) return null;
  return (
    <section className="change-panel" aria-label="Changes from chat in this tab">
      <header>
        <strong>
          {units.length} change{units.length === 1 ? '' : 's'} from chat in this tab
        </strong>
        <span>
          <button
            onClick={() =>
              onDecideAll(
                units.map((u) => u.id),
                'accept',
              )
            }
          >
            Accept all here
          </button>
          <button
            onClick={() =>
              onDecideAll(
                units.map((u) => u.id),
                'skip',
              )
            }
          >
            Skip all here
          </button>
        </span>
      </header>
      {units.map((unit) => {
        const decision = decisions[unit.id];
        return (
          <div className={`review-item ${unit.kind} ${decision ?? 'undecided'}`} key={unit.id}>
            <div className="review-item-head">
              <span className="review-item-kind">{unit.label}</span>
              <Controls unit={unit} decision={decision} onDecide={onDecide} />
            </div>
            <ItemExtras unit={unit} decision={decision} onDecide={onDecide} />
            <p className="panel-diff">
              <UnitText unit={unit} decision={decision} />
            </p>
          </div>
        );
      })}
    </section>
  );
}
