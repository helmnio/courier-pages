import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react';
import { type Project, type Script, type Proposal } from './model';
import { applyUnits, computeUnits, countByTab, reviseNote, unitTabs } from './changes';
import { type Decision, type Decisions, type ReviewView, type ViewScrolls } from './ReviewUI';
import { api } from './helpers';

type Pending = Proposal & { edited?: boolean };

// Everything the review needs from the surrounding studio state.
type Context = {
  p: Project | null;
  d: Script | undefined;
  tab: string;
  setTab: (next: string) => void;
  main: RefObject<HTMLElement | null>;
  pending: Pending[];
  revisionDocs: Record<string, Script>;
  dirty: MutableRefObject<boolean>;
  saving: MutableRefObject<boolean>;
  current: MutableRefObject<Project | null>;
  reviewing: boolean;
  setReviewing: Dispatch<SetStateAction<boolean>>;
  install: (v: Project) => void;
  refresh: () => Promise<void>;
  fail: (e: unknown) => void;
  setError: Dispatch<SetStateAction<string>>;
  setChanged: Dispatch<SetStateAction<any>>;
  setChangesOpen: Dispatch<SetStateAction<boolean>>;
  decision: (q: Pending, accept: boolean) => Promise<void>;
};

// Reviewing one pending AI proposal: per-element decisions, revise requests,
// applying the accepted changes and rejecting the rest.
export function useProposalReview(ctx: Context) {
  const {
    p,
    d,
    tab,
    setTab,
    main,
    pending,
    revisionDocs,
    dirty,
    saving,
    current,
    reviewing,
    setReviewing,
    install,
    refresh,
    fail,
    setError,
    setChanged,
    setChangesOpen,
    decision,
  } = ctx;
  const [reviewId, setReviewId] = useState('');
  const [reviewView, setReviewView] = useState<ReviewView>('changes');
  const [decisions, setDecisions] = useState<Record<string, Decisions>>({});
  const [requests, setRequests] = useState<Record<string, Record<string, string>>>({});
  const reviewBar = useRef<HTMLDivElement>(null);
  const viewScrolls = useRef<ViewScrolls>({});
  const landed = useRef('');
  const queue = [...pending].reverse();
  const reviewActive = reviewing ? (queue.find((q) => q.id === reviewId) ?? queue[0]) : undefined;
  const baseDoc =
    reviewActive && p && d
      ? reviewActive.baseVersion === p.version
        ? d
        : revisionDocs[p.id + ':' + reviewActive.baseVersion]
      : undefined;
  const units = useMemo(
    () => (reviewActive && baseDoc && d ? computeUnits(baseDoc, reviewActive.document, d) : []),
    [reviewActive?.id, baseDoc, d],
  );
  const unitCounts = countByTab(units);
  const chosen: Decisions = (reviewActive && decisions[reviewActive.id]) || {};
  const acceptedIds = units.filter((u) => chosen[u.id] === 'accept').map((u) => u.id);
  const myRequests = (reviewActive && requests[reviewActive.id]) || {};
  const reviseIds = units
    .filter((u) => chosen[u.id] === 'revise' && myRequests[u.id]?.trim())
    .map((u) => u.id);
  const setRequest = (id: string, text: string) =>
    setRequests((old) => ({
      ...old,
      [reviewActive!.id]: { ...(old[reviewActive!.id] ?? {}), [id]: text },
    }));
  const requestNotes = (doc: Script) =>
    units
      .filter((u) => reviseIds.includes(u.id))
      .map((u) => reviseNote(u, myRequests[u.id].trim(), doc));
  const decideUnit = (id: string, value?: Decision) =>
    setDecisions((old) => {
      const next = { ...(old[reviewActive!.id] ?? {}) };
      if (value) next[id] = value;
      else delete next[id];
      return { ...old, [reviewActive!.id]: next };
    });
  const decideMany = (ids: string[], value: Decision) =>
    setDecisions((old) => ({
      ...old,
      [reviewActive!.id]: {
        ...(old[reviewActive!.id] ?? {}),
        ...Object.fromEntries(ids.map((id) => [id, value])),
      },
    }));
  function startReview(id?: string) {
    if (!queue.length) return;
    landed.current = '';
    viewScrolls.current = {};
    setReviewView('changes');
    setReviewId(id ?? queue[0].id);
    setReviewing(true);
  }
  function switchView(next: ReviewView) {
    viewScrolls.current[reviewView] = main.current?.scrollTop ?? 0;
    setReviewView(next);
  }
  async function applyReview(ids: string[]) {
    if (!reviewActive || !d || !p) return;
    if (dirty.current || saving.current)
      return setError('Your latest typing is still saving. Try again in a moment.');
    const merged = applyUnits(d, reviewActive.document, units, new Set(ids));
    const notes = requestNotes(d);
    merged.notes = [...merged.notes, ...notes];
    try {
      const before = current.current;
      const next = await api(`/proposals/${reviewActive.id}/decision`, {
        accept: true,
        document: merged,
        version: p.version,
      });
      if (current.current === before && before) {
        setChanged({
          label:
            `${ids.length} change${ids.length === 1 ? '' : 's'} accepted` +
            (notes.length
              ? `, ${notes.length} revision note${notes.length === 1 ? '' : 's'} left for chat`
              : ''),
          from: before.document,
          undoable: true,
        });
        setChangesOpen(false);
        install(next);
      }
      setDecisions((old) => {
        const rest = { ...old };
        delete rest[reviewActive.id];
        return rest;
      });
      setRequests((old) => {
        const rest = { ...old };
        delete rest[reviewActive.id];
        return rest;
      });
      await refresh();
    } catch (e) {
      fail(e);
    }
  }
  async function rejectReview() {
    if (!reviewActive || !d || !p) return;
    if (!reviseIds.length) return void decision(reviewActive, false);
    if (dirty.current || saving.current)
      return setError('Your latest typing is still saving. Try again in a moment.');
    try {
      const before = current.current;
      const next = await api(`/proposals/${reviewActive.id}/decision`, {
        accept: false,
        document: { ...d, notes: [...d.notes, ...requestNotes(d)] },
        version: p.version,
      });
      if (current.current === before) install(next);
      setRequests((old) => {
        const rest = { ...old };
        delete rest[reviewActive.id];
        return rest;
      });
      await refresh();
    } catch (e) {
      fail(e);
    }
  }
  useEffect(() => {
    if (reviewing && !queue.length) setReviewing(false);
  }, [reviewing, queue.length]);
  useEffect(() => {
    // Land on the first tab that has changes, once, when a revision opens.
    if (!reviewing || !reviewActive || !units.length || landed.current === reviewActive.id) return;
    landed.current = reviewActive.id;
    const first = unitTabs.find((t) => unitCounts[t]);
    if (first && !unitCounts[tab as never]) setTab(first);
    if (first === 'script' || tab === 'script')
      requestAnimationFrame(() =>
        requestAnimationFrame(() =>
          document
            .querySelector('.review-script .review-item')
            ?.scrollIntoView({ block: 'center' }),
        ),
      );
  }, [reviewing, reviewActive?.id, units.length]);
  useEffect(() => {
    const bar = reviewBar.current;
    const root = document.documentElement;
    if (!reviewing || !bar) return void root.style.removeProperty('--review-h');
    const measure = () => root.style.setProperty('--review-h', bar.offsetHeight + 'px');
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    return () => observer.disconnect();
  }, [reviewing, reviewActive?.id]);
  const newDoc = useMemo(
    () =>
      reviewActive && d
        ? applyUnits(
            d,
            reviewActive.document,
            units,
            new Set(
              units.filter((u) => u.tab === 'script' && chosen[u.id] !== 'skip').map((u) => u.id),
            ),
          )
        : undefined,
    [reviewActive?.id, units, decisions],
  );
  const [newPages, setNewPages] = useState<Record<string, number>>();
  useEffect(() => {
    // The New view is not saved yet, so ask the server where its page breaks would fall.
    if (!reviewing || reviewView !== 'new' || !newDoc) return;
    const timer = setTimeout(
      () =>
        void api('/paginate', { document: newDoc })
          .then((layout) => setNewPages(layout.blockPages))
          .catch(() => {}),
      250,
    );
    return () => clearTimeout(timer);
  }, [reviewing, reviewView, newDoc]);
  const showScriptReview = !!(
    reviewing &&
    reviewActive &&
    units.some((u) => u.tab === 'script') &&
    tab === 'script'
  );
  return {
    queue,
    reviewActive,
    baseDoc,
    units,
    unitCounts,
    chosen,
    acceptedIds,
    reviseIds,
    myRequests,
    setRequest,
    decideUnit,
    decideMany,
    startReview,
    switchView,
    applyReview,
    rejectReview,
    reviewId,
    setReviewId,
    reviewView,
    reviewBar,
    viewScrolls,
    landed,
    newDoc,
    newPages,
    showScriptReview,
  };
}
