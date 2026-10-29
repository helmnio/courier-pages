import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { kinds, type Project, type Script, type Proposal, type Block } from './model';
import './style.css';
import { ChangeRows } from './Review';
import { applyUnits, computeUnits, countByTab, reviseNote, unitTabs } from './changes';
import {
  ChangePanel,
  ReviewScope,
  ScriptReview,
  type Decision,
  type Decisions,
  type ReviewView,
  type ViewScrolls,
} from './ReviewUI';
import { confirmAsync, DialogHost, newScreenplayDialog } from './dialogs';
import { Planning } from './Planning';
import { ReviewNotes, type NoteTarget } from './ReviewNotes';
import { ScriptNotes } from './ScriptNotes';
import { recall, remember, useRemembered, RememberedDetails } from './workspace';
import { ScreenplayEditor } from './Editor';
import type { Editor } from '@tiptap/react';
import { moveScene, duplicateScene, sceneBlocks, BriefSchema, CharacterSchema } from './model';
import { registerBrowserTools } from './webmcp';
async function api(url: string, body?: unknown, method = 'POST') {
  const r = await fetch('/api' + url, {
    method: body ? method : 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw Error(data.error);
  return data;
}
function cached<T = any>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null');
  } catch {
    return null;
  }
}
const tabId = (() => {
  try {
    let id = sessionStorage.getItem('studio-tab');
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem('studio-tab', id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
})();
const key = (id: string) => `studio-recovery:${id}:${tabId}`;
function recoveryFor(id: string): (Project & { recoveryKey?: string }) | null {
  try {
    const own = cached<Project>(key(id));
    if (own) return { ...own, recoveryKey: key(id) };
    const other = Object.keys(localStorage)
      .filter((k) => k.startsWith('studio-recovery:' + id + ':'))
      .map((k) => ({ key: k, value: cached<Project>(k) }))
      .filter((x) => x.value)
      .at(-1);
    return other?.value ? { ...other.value, recoveryKey: other.key } : null;
  } catch {
    return null;
  }
}
const labels: Record<string, string> = {
  scene: 'Scene heading',
  action: 'Action',
  character: 'Character',
  dialogue: 'Dialogue',
  parenthetical: 'Parenthetical',
  transition: 'Transition',
  shot: 'Shot',
  general: 'General text',
  pageBreak: 'Page break',
  note: 'Private note',
  section: 'Act / sequence',
};
function App() {
  const [projects, setProjects] = useState<any[]>([]),
    [p, setP] = useState<Project | null>(null),
    [tab, setTabState] = useState('script'),
    [proposals, setProposals] = useState<(Proposal & { edited?: boolean })[]>([]),
    [history, setHistory] = useState<any[]>([]),
    [status, setStatus] = useState('Connecting…'),
    [error, setError] = useState(''),
    [focus, setFocus] = useState(''),
    [tools, setTools] = useRemembered('site-tools', true),
    [capabilities, setCapabilities] = useState<any>(null),
    [recovery, setRecovery] = useState<(Project & { recoveryKey?: string }) | null>(null),
    [search, setSearch] = useState(''),
    [layout, setLayout] = useState<{
      pages: number;
      screenplayPages: number;
      blockPages: Record<string, number>;
    } | null>(null),
    [contextual, setContextual] = useRemembered('contextual', false),
    [revisionDocs, setRevisionDocs] = useState<Record<string, Script>>({});
  const [noteTarget, setNoteTarget] = useState<NoteTarget | undefined>();
  const [reviewNoteId, setReviewNoteId] = useState<string | undefined>();
  const [stickyNotes, setStickyNotes] = useRemembered('sticky-notes', true);
  const [reviewMode, setReviewMode] = useRemembered('review-mode', false);
  const openRequest = useRef(0);
  const focusRef = useRef(focus);
  focusRef.current = focus;
  const lastEdit = useRef(0),
    lastSave = useRef(0);
  const current = useRef<Project | null>(null),
    dirty = useRef(false),
    saving = useRef(false),
    blocked = useRef(false);
  const file = useRef<HTMLInputElement>(null);
  const main = useRef<HTMLElement>(null);
  const viewTab = useRef(tab);
  viewTab.current = tab;
  const scrollPositions = useRef<Record<string, number>>({});
  function keepScroll() {
    const id = current.current?.id;
    if (!id || !main.current) return;
    scrollPositions.current[viewTab.current] = main.current.scrollTop;
    remember(id + ':scroll', scrollPositions.current);
  }
  function setTab(next: string) {
    keepScroll();
    viewTab.current = next;
    if (current.current) remember(current.current.id + ':tab', next);
    setTabState(next);
  }
  useLayoutEffect(() => {
    if (main.current) main.current.scrollTop = scrollPositions.current[tab] ?? 0;
  }, [p?.id, tab]);
  useEffect(() => {
    const flush = () => keepScroll();
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, []);
  const editor = useRef<Editor | null>(null);
  const [zen, setZen] = useRemembered('zen', false);
  const [side, setSide] = useRemembered('sidebar', true);
  const [drawer, setDrawer] = useState(false);
  const [connections, setConnections] = useState<{
    dataDirectory: string;
    installDirectory: string;
    clients: { id: string; label: string; state: string; detail: string; restart: string }[];
  } | null>(null);
  const [connectNote, setConnectNote] = useState<
    Record<string, { ok: boolean; message: string; command?: string }>
  >({});
  const [reviewing, setReviewing] = useState(false);
  const [reviewId, setReviewId] = useState('');
  const [reviewView, setReviewView] = useState<ReviewView>('changes');
  const [decisions, setDecisions] = useState<Record<string, Decisions>>({});
  const [requests, setRequests] = useState<Record<string, Record<string, string>>>({});
  const reviewBar = useRef<HTMLDivElement>(null);
  const viewScrolls = useRef<ViewScrolls>({});
  const landed = useRef('');
  const [pageMode, setPageMode] = useRemembered('page-mode', false);
  const [pageNo, setPageNo] = useState(1);
  const [pageDraft, setPageDraft] = useState('');
  const [noteOpen, setNoteOpen] = useState<string | undefined>();
  const [changed, setChanged] = useState<{
    label: string;
    from: Script;
    undoable: boolean;
  } | null>(null);
  const [changesOpen, setChangesOpen] = useState(false);
  useEffect(() => {
    if (!changed) return;
    const doc = current.current?.document;
    if (!doc) return;
    const before = new Map(changed.from.blocks.map((b) => [b.id, JSON.stringify(b)]));
    const ids = doc.blocks.filter((b) => before.get(b.id) !== JSON.stringify(b)).map((b) => b.id);
    const frame = requestAnimationFrame(() =>
      ids.forEach((id) =>
        document.querySelector(`[data-block-id="${id}"]`)?.classList.add('just-changed'),
      ),
    );
    return () => {
      cancelAnimationFrame(frame);
      document
        .querySelectorAll('.just-changed')
        .forEach((el) => el.classList.remove('just-changed'));
    };
  }, [changed]);
  const [menu, setMenu] = useState<'' | 'more' | 'view' | 'suggest'>('');
  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => {
      if (!(e.target as Element).closest?.('.menu-wrap')) setMenu('');
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMenu('');
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [menu]);
  function install(v: Project) {
    if (current.current?.id !== v.id) {
      setNoteTarget(undefined);
      setReviewNoteId(undefined);
      keepScroll();
      scrollPositions.current = recall(v.id + ':scroll', {});
      const next = recall(v.id + ':tab', 'script');
      viewTab.current = next;
      setTabState(next);
    }
    current.current = v;
    setP(v);
    dirty.current = false;
    blocked.current = false;
    try {
      localStorage.setItem('studio-last', JSON.stringify(v));
    } catch {
      /* SQLite acknowledgement remains authoritative. */
    }
  }
  function edit(document: Script) {
    lastEdit.current = Date.now();
    if (!current.current) return;
    const v = { ...current.current, document };
    current.current = v;
    dirty.current = true;
    setP(v);
    try {
      localStorage.setItem(key(v.id), JSON.stringify(v));
      setStatus('Unsaved • recovery copy stored');
    } catch {
      setError('Browser recovery storage is full. Save or download a backup now.');
    }
  }
  async function refresh() {
    const list = await api('/projects');
    setProjects(list);
    const v = current.current;
    if (!v) {
      if (list[0]) await open(list[0].id);
      return;
    }
    const [incoming, items, remote] = await Promise.all([
      api('/projects/' + v.id + '/proposals'),
      api('/projects/' + v.id + '/history'),
      api('/projects/' + v.id),
    ]);
    const now = current.current;
    if (!now || now.id !== v.id) return;
    setProposals((old) =>
      incoming.map(
        (q: Proposal) => old.find((x) => x.id === q.id && x.edited && q.status === 'pending') ?? q,
      ),
    );
    setHistory(items);
    if (remote.version <= now.version) return;
    if (!dirty.current && !saving.current) {
      setChanged({
        label: 'Updated from outside this tab',
        from: now.document,
        undoable: false,
      });
      setChangesOpen(false);
      install(remote);
    } else if (!saving.current) {
      blocked.current = true;
      setError(
        'Another window changed this script. Your draft is preserved. Download it, then load the latest version.',
      );
    }
  }

  async function open(id: string) {
    if (dirty.current) {
      setError(
        'Save this draft or download a backup and load the latest before switching projects.',
      );
      return;
    }
    const request = ++openRequest.current;
    const before = current.current;
    try {
      const v = await api(`/projects/${id}`);
      if (request !== openRequest.current) return;
      if (dirty.current && current.current !== before)
        return setError('Your draft changed while opening a project. Save it before switching.');
      install(v);
      setRecovery(recoveryFor(id));
      setStatus('Saved locally');
      setError('');
      const [incoming, items] = await Promise.all([
        api(`/projects/${id}/proposals`),
        api(`/projects/${id}/history`),
      ]);
      if (request === openRequest.current && current.current?.id === id) {
        setProposals(incoming);
        setHistory(items);
      }
    } catch (e) {
      fail(e);
    }
  }
  function fail(e: unknown) {
    setError(e instanceof Error ? e.message : String(e));
  }
  async function save() {
    if (!dirty.current || saving.current || blocked.current || !current.current) return;
    const v = current.current;
    saving.current = true;
    setStatus('Saving…');
    try {
      const next = await api(
        `/projects/${v.id}`,
        { version: v.version, document: v.document },
        'PUT',
      );
      if (current.current === v) {
        install(next);
        localStorage.removeItem(key(v.id));
        setStatus('Saved locally');
        lastSave.current = Date.now();
      } else {
        const merged = { ...current.current!, version: next.version };
        current.current = merged;
        setP(merged);
        localStorage.setItem(key(v.id), JSON.stringify(merged));
      }
      setError('');
    } catch (e) {
      setStatus('Draft stored in browser');
      fail(e);
      if (String(e).includes('changed')) blocked.current = true;
    } finally {
      saving.current = false;
    }
  }
  useEffect(() => {
    let alive = true;
    let events: EventSource;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    function reconnect() {
      events?.close();
      if (!alive) return;
      setStatus('Reconnecting • drafts stay on this device');
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(async () => {
        try {
          await api('/session');
          if (!alive) return;
          await refresh();
          if (alive) connectEvents();
        } catch {
          if (alive) reconnect();
        }
      }, 1000);
    }
    function connectEvents() {
      events = new EventSource('/api/events');
      events.onmessage = () => {
        if (alive) void refresh().catch(fail);
      };
      events.onerror = reconnect;
      events.onopen = () => {
        if (!alive) return;
        setStatus(dirty.current ? 'Unsaved draft' : 'Connected locally');
        void refresh().catch(fail);
      };
    }
    void (async () => {
      try {
        await api('/session');
        const list = await api('/projects');
        if (!alive) return;
        setProjects(list);
        setCapabilities(await api('/capabilities'));
        const last = cached<Project>('studio-last');
        if (list[0]) await open(list.some((v: any) => v.id === last?.id) ? last!.id : list[0].id);
        if (alive) connectEvents();
      } catch (e) {
        const v = cached<Project>('studio-last');
        if (v) {
          install(v);
          setRecovery(recoveryFor(v.id));
        }
        setStatus('Offline');
        fail(e);
      }
    })();
    return () => {
      alive = false;
      clearTimeout(reconnectTimer);
      events?.close();
    };
  }, []);
  useEffect(() => {
    const t = setInterval(() => {
      if (Date.now() - lastEdit.current > 800 || Date.now() - lastSave.current > 10000) void save();
    }, 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      if (e.altKey && ['PageDown', 'PageUp'].includes(e.key)) {
        e.preventDefault();
        const all = current.current?.document.blocks.filter((b) => b.type === 'scene') ?? [];
        const blocks = current.current?.document.blocks ?? [];
        const cursor = blocks.findIndex((b) => b.id === focusRef.current);
        const own = blocks
          .slice(0, cursor + 1)
          .filter((b) => b.type === 'scene')
          .at(-1);
        const at = all.findIndex((b) => b.id === own?.id) + (e.key === 'PageDown' ? 1 : -1);
        const scene = all[Math.max(0, Math.min(all.length - 1, at))];
        if (scene) {
          navigate(scene.id);
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void save();
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setZen((x) => !x);
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        document.querySelector<HTMLInputElement>('.search')?.focus();
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, []);
  useEffect(() => {
    const f = (e: BeforeUnloadEvent) => {
      if (dirty.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', f);
    return () => window.removeEventListener('beforeunload', f);
  }, []);
  useEffect(() => {
    if (!tools) return;
    return registerBrowserTools(
      () => current.current?.id ?? null,
      () => {
        const v = current.current;
        const id = focusRef.current;
        const index = v?.document.blocks.findIndex((b) => b.id === id) ?? -1;
        const sceneId = v?.document.blocks
          .slice(0, index + 1)
          .filter((b) => b.type === 'scene')
          .at(-1)?.id;
        const state = editor.current?.state;
        return {
          elementId: id,
          sceneId,
          version: v?.version,
          hasUnsavedEdits: dirty.current,
          text: state?.doc.textBetween(state.selection.from, state.selection.to, '\n') ?? '',
        };
      },
      api,
      fail,
    );
  }, [tools]);
  useEffect(() => {
    if (p)
      void api('/projects/' + p.id + '/pagination')
        .then(setLayout)
        .catch(() => {});
  }, [p?.id, p?.version]);
  useEffect(() => {
    if (!p || (tab !== 'review' && !reviewing)) return;
    for (const q of proposals) {
      const key = p.id + ':' + q.baseVersion;
      if (!revisionDocs[key])
        void api('/projects/' + p.id + '/revisions/' + q.baseVersion)
          .then((h) => setRevisionDocs((old) => ({ ...old, [key]: h.document })))
          .catch(fail);
    }
  }, [tab, reviewing, proposals, p?.id]);
  const d = p?.document;
  const scenes = d?.blocks.filter((b) => b.type === 'scene') ?? [];
  const active = d?.blocks.find((b) => b.id === focus);
  const sceneIndex = active ? d!.blocks.findIndex((b) => b.id === active.id) : -1;
  const currentScene = d?.blocks
    .slice(0, sceneIndex + 1)
    .filter((b) => b.type === 'scene')
    .at(-1);
  const names = d
    ? [
        ...new Set([
          ...d.characters.map((c) => c.name.toUpperCase()),
          ...d.blocks.filter((b) => b.type === 'character').map((b) => b.text),
        ]),
      ]
    : [];
  const pending = proposals.filter((q) => q.status === 'pending');
  function block(id: string, patch: Partial<Block>) {
    edit({ ...d!, blocks: d!.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)) });
  }
  function navigate(id: string) {
    setDrawer(false);
    if (layout?.blockPages[id]) setPageNo(layout.blockPages[id]);
    setTab('script');
    requestAnimationFrame(() => {
      const e = editor.current;
      if (!e) return;
      let position: number | undefined;
      e.state.doc.forEach((node, pos) => {
        if (node.attrs.id === id) position = pos + 1;
      });
      if (position !== undefined) {
        e.commands.setTextSelection(position);
        e.view.dom.focus({ preventScroll: true });
      }
      document.getElementById(id)?.scrollIntoView({ block: 'nearest' });
    });
  }
  function add(after?: string) {
    const e = editor.current;
    const b: Block = {
      id: crypto.randomUUID(),
      type: after && active?.type === 'character' ? 'dialogue' : 'action',
      text: '',
    };
    if (e) {
      let position = e.state.doc.content.size;
      if (after)
        e.state.doc.forEach((node, pos) => {
          if (node.attrs.id === after) position = pos + node.nodeSize;
        });
      e.chain()
        .insertContentAt(position, { type: 'screenplayBlock', attrs: { id: b.id, kind: b.type } })
        .setTextSelection(position + 1)
        .run();
      e.view.focus();
      setFocus(b.id);
      return;
    }
    const blocks = [...d!.blocks];
    blocks.splice(after ? blocks.findIndex((x) => x.id === after) + 1 : blocks.length, 0, b);
    edit({ ...d!, blocks });
    navigate(b.id);
  }

  function backup() {
    if (!current.current) return;
    const u = URL.createObjectURL(
      new Blob([JSON.stringify(current.current.document, null, 2)], { type: 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = u;
    a.download = 'screenplay-recovery.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(u), 1000);
  }
  async function decision(q: Proposal & { edited?: boolean }, accept: boolean) {
    if (dirty.current || saving.current) {
      setError('Save your draft before reviewing a proposal.');
      return;
    }
    if (accept && q.edited) {
      setError('Submit your edited proposal before approval.');
      return;
    }
    try {
      const before = current.current;
      const next = await api(`/proposals/${q.id}/decision`, { accept });
      if (current.current === before) {
        if (accept && before) {
          setChanged({ label: 'Revision approved', from: before.document, undoable: true });
          setChangesOpen(false);
        }
        install(next);
      } else if (current.current?.id === next.id && dirty.current) {
        blocked.current = true;
        setError(
          'The reviewed revision was saved. Your newer typing is preserved in recovery; review the latest version before saving.',
        );
      }
      await refresh();
    } catch (e) {
      fail(e);
    }
  }
  async function latest() {
    if (!current.current) return;
    if (
      dirty.current &&
      !(await confirmAsync('Your draft remains in browser recovery. Load the saved version?', {
        confirmLabel: 'Load saved version',
      }))
    )
      return;
    try {
      const before = current.current;
      const v = await api(`/projects/${before.id}`);
      if (current.current !== before)
        return setError(
          'Your draft changed while loading. Save or back up the latest edits first.',
        );
      install(v);
      setRecovery(recoveryFor(v.id));
      setError('');
    } catch (e) {
      fail(e);
    }
  }
  useEffect(() => {
    if (tab === 'connect')
      void api('/connect')
        .then(setConnections)
        .catch(() => {});
  }, [tab]);
  async function connectClient(id: string) {
    try {
      const result = await api('/connect/' + id, {}).catch(
        (e: Error) => ({ ok: false, message: e.message }) as any,
      );
      setConnectNote((old) => ({ ...old, [id]: result }));
      if (result.clients) setConnections((c) => (c ? { ...c, clients: result.clients } : c));
    } catch (e) {
      fail(e);
    }
  }
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
  const totalPages = Math.max(1, layout?.screenplayPages ?? 1);
  function goPage(next: number) {
    const target = Math.min(totalPages, Math.max(1, Math.round(next) || 1));
    setPageNo(target);
    setPageDraft('');
    requestAnimationFrame(() => {
      if (main.current) main.current.scrollTop = 0;
      const e = editor.current;
      const first = d?.blocks.find((b) => layout?.blockPages[b.id] === target);
      if (!e || !first) return;
      e.state.doc.forEach((node, pos) => {
        if (node.attrs.id === first.id) e.commands.setTextSelection(pos + 1);
      });
    });
  }
  useEffect(() => {
    if (pageNo > totalPages) setPageNo(totalPages);
  }, [totalPages]);
  useEffect(() => {
    // Single-page mode follows the cursor if typing pushes it onto another page.
    const at = layout?.blockPages[focus];
    if (pageMode && at && at !== pageNo) setPageNo(at);
  }, [layout, focus]);
  useEffect(() => {
    if (zen) setDrawer(false);
  }, [zen]);
  useEffect(() => {
    if (!drawer) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setDrawer(false);
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [drawer]);
  const wide = () => window.matchMedia('(min-width: 1000px)').matches;
  const openNotes = d?.notes.filter((n) => n.status !== 'resolved').length ?? 0;
  const primaryTabs: [string, string][] = [
    ['script', 'Script'],
    ['notes', `Notes${openNotes ? ' · ' + openNotes : ''}`],
    ['review', `Revisions${pending.length ? ' · ' + pending.length : ''}`],
    ['planning', 'Plan'],
    ['scenes', 'Scenes'],
  ];
  const moreTabs: [string, string][] = [
    ['bible', 'Story bible'],
    ['characters', 'Characters'],
    ['projects', 'Projects'],
    ['history', 'History'],
    ['connect', 'Connections'],
  ];
  return (
    <div
      className={`app ${zen ? 'zen' : ''} ${side ? '' : 'sidebar-hidden'} ${drawer ? 'drawer-open' : ''}`}
    >
      <div className="scrim" onClick={() => setDrawer(false)} aria-hidden="true" />
      <DialogHost />
      <aside className="sidebar" aria-label="Projects and scenes">
        <button
          className="drawer-close icon-btn"
          aria-label="Close menu"
          onClick={() => setDrawer(false)}
        >
          ×
        </button>
        <div className="brand">
          <span className="brandmark">C</span>
          <div>
            courier pages<small>YOUR WRITING ROOM</small>
          </div>
        </div>
        <div className="workspace-label">
          WORKSPACE <span>LOCAL</span>
        </div>
        <select
          disabled={!p}
          aria-label="Project"
          value={p?.id ?? ''}
          onChange={(e) => void open(e.target.value)}
        >
          {projects
            .filter((q) => !q.archived || q.id === p?.id)
            .map((q) => (
              <option key={q.id} value={q.id}>
                {q.title}
              </option>
            ))}
        </select>
        <button
          className="new"
          onClick={async () => {
            if (dirty.current) return setError('Save your draft first.');
            const choice = await newScreenplayDialog();
            if (choice)
              try {
                const v = await api('/projects', { title: choice.title });
                await refresh();
                await open(v.id);
                const now = current.current;
                if (now && now.id === v.id)
                  edit({
                    ...now.document,
                    metadata: {
                      ...now.document.metadata,
                      format: choice.format,
                      pageSize: choice.pageSize,
                    },
                  });
              } catch (e) {
                fail(e);
              }
          }}
        >
          ＋ New screenplay
        </button>
        <div className="divider" />
        <div className="workspace-label">
          SCENE NAVIGATOR <span>{scenes.length.toString().padStart(2, '0')}</span>
        </div>
        <input
          className="search"
          placeholder="Find a scene…"
          aria-label="Find a scene"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <div className="search-results">
            {d?.blocks
              .filter((b) => b.text.toLowerCase().includes(search.toLowerCase()))
              .slice(0, 12)
              .map((b) => (
                <button key={b.id} onClick={() => navigate(b.id)}>
                  {b.text.slice(0, 70)}
                </button>
              ))}
            {d?.characters
              .filter((c) => JSON.stringify(c).toLowerCase().includes(search.toLowerCase()))
              .map((c) => (
                <button key={c.id} onClick={() => setTab('characters')}>
                  {c.name}
                </button>
              ))}
            {d?.notes
              .filter((n) => n.text.toLowerCase().includes(search.toLowerCase()))
              .map((n) => (
                <button key={n.id} onClick={() => setTab('notes')}>
                  {n.text.slice(0, 70)}
                </button>
              ))}
          </div>
        )}
        <nav>
          {d?.blocks
            .filter((b) => b.type === 'section')
            .map((b) => (
              <button className="section-link" key={b.id} onClick={() => navigate(b.id)}>
                {b.text || 'Act / sequence'}
              </button>
            ))}
          {scenes.map(
            (s, i) =>
              s.text.toLowerCase().includes(search.toLowerCase()) && (
                <button
                  className={focus === s.id ? 'scene-link selected' : 'scene-link'}
                  key={s.id}
                  onClick={() => navigate(s.id)}
                >
                  <span>{String(i + 1).padStart(2, '0')}</span>
                  <div>
                    {s.text || 'Untitled scene'}
                    <small>{d!.bible.scenes[s.id] || 'Scene notes ready to write'}</small>
                    <small>
                      {d!.sceneStatus[s.id] ?? 'drafting'} · p. {layout?.blockPages[s.id] ?? '—'}
                    </small>
                  </div>
                </button>
              ),
          )}
        </nav>
        <div className="sidebar-bottom">
          <span className="dot" /> Private by default<small>Stored on this computer</small>
        </div>
      </aside>
      <main ref={main} onScroll={keepScroll}>
        <header className="topbar">
          <div className="topbar-row">
            <button
              className="icon-btn"
              aria-label="Scenes and projects"
              aria-expanded={drawer || (side && wide())}
              onClick={() => (wide() ? setSide(!side) : setDrawer(!drawer))}
            >
              ☰
            </button>
            <div className="doc-title">
              <h1>{d?.title ?? 'Your next story starts here'}</h1>
              <span className="eyebrow">
                DRAFT {d?.metadata.draft ?? 1} · REV {p?.version ?? 1}
              </span>
            </div>
            <div className="save-status" role="status">
              <span className="dot" />
              <span className="save-text">{status}</span>
              <button onClick={() => void save()}>Save</button>
            </div>
            <div className="header-actions">
              <button aria-label="Import" title="Import" onClick={() => file.current?.click()}>
                ↑<span className="btn-label"> Import</span>
              </button>
              <select
                aria-label="Export screenplay"
                value=""
                onChange={async (e) => {
                  const f = e.target.value;
                  if (dirty.current || saving.current)
                    return setError(
                      'Save your draft before exporting, or download the draft backup.',
                    );
                  if (p && f)
                    window.location.href =
                      f === 'backup'
                        ? `/api/projects/${p.id}/backup`
                        : `/api/projects/${p.id}/export/${f}`;
                }}
              >
                <option value="">↓ Export</option>
                {['fountain', 'fdx', 'pdf', 'json', 'backup'].map((f) => (
                  <option key={f} value={f}>
                    {f.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="tabs" role="tablist" aria-label="Sections">
            {primaryTabs.map(([id, label]) => (
              <button
                role="tab"
                aria-selected={tab === id}
                className={tab === id ? 'active' : ''}
                onClick={() => setTab(id)}
                key={id}
              >
                {label}
                {reviewing && unitCounts[id as never] ? (
                  <span className="tab-dot">{unitCounts[id as never]}</span>
                ) : null}
              </button>
            ))}
            <div className="menu-wrap">
              <button
                role="tab"
                aria-selected={moreTabs.some(([id]) => id === tab)}
                aria-haspopup="menu"
                aria-expanded={menu === 'more'}
                className={moreTabs.some(([id]) => id === tab) ? 'active' : ''}
                onClick={() => setMenu(menu === 'more' ? '' : 'more')}
              >
                {moreTabs.find(([id]) => id === tab)?.[1] ?? 'More'} ▾
              </button>
              {menu === 'more' && (
                <div className="menu" role="menu">
                  {moreTabs.map(([id, label]) => (
                    <button
                      role="menuitem"
                      className={tab === id ? 'active' : ''}
                      key={id}
                      onClick={() => {
                        setTab(id);
                        setMenu('');
                      }}
                    >
                      {label}
                      {reviewing && unitCounts[id as never] ? (
                        <span className="tab-dot">{unitCounts[id as never]}</span>
                      ) : null}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </header>
        <input
          ref={file}
          type="file"
          hidden
          accept=".fountain,.fdx,.json"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            if (f.size > (f.name.endsWith('.studio.json') ? 256000000 : 6000000))
              return setError(
                'Screenplays must be under 6 MB; complete .studio.json backups can be up to 256 MB.',
              );
            if (dirty.current) return setError('Save this draft before importing.');
            try {
              const text = await f.text();
              const native =
                f.name.endsWith('.json') && JSON.parse(text).format === 'screenplay-studio';
              const v = native
                ? await api('/restore', JSON.parse(text))
                : await api('/import', {
                    format: f.name.endsWith('.fdx')
                      ? 'fdx'
                      : f.name.endsWith('.json')
                        ? 'json'
                        : 'fountain',
                    text,
                  });
              await refresh();
              await open(v.id);
            } catch (e) {
              fail(e);
            }
            e.target.value = '';
          }}
        />
        {pending.length > 0 && tab !== 'review' && !reviewing && (
          <div className="chat-banner" role="status">
            <div className="banner-row">
              <strong>
                {pending.length} revision{pending.length === 1 ? '' : 's'} from chat waiting
              </strong>
              <span className="banner-sub">{pending[0].summary}</span>
              <div className="banner-actions">
                <button className="primary" onClick={() => startReview()}>
                  Review changes
                </button>
              </div>
            </div>
          </div>
        )}
        {changed &&
          d &&
          (() => {
            const rows = diff(changed.from, d);
            return (
              <div className="chat-banner changed" role="status">
                <div className="banner-row">
                  <strong>{changed.label}</strong>
                  <span className="banner-sub">
                    {rows.length} change{rows.length === 1 ? '' : 's'}, highlighted in the script
                  </span>
                  <div className="banner-actions">
                    <button onClick={() => setChangesOpen(!changesOpen)}>
                      {changesOpen ? 'Hide changes' : 'Show changes'}
                    </button>
                    {changed.undoable && (
                      <button
                        onClick={() => {
                          edit(changed.from);
                          setChanged(null);
                        }}
                      >
                        Undo
                      </button>
                    )}
                    <button
                      className="icon-btn"
                      aria-label="Dismiss"
                      onClick={() => setChanged(null)}
                    >
                      ×
                    </button>
                  </div>
                </div>
                {changesOpen && <ChangeRows rows={rows} />}
              </div>
            );
          })()}
        {reviewing && reviewActive && (
          <div
            className="review-bar"
            ref={reviewBar}
            role="region"
            aria-label="Reviewing a revision from chat"
          >
            <div className="review-nav">
              <button
                aria-label="Previous revision"
                disabled={queue.findIndex((q) => q.id === reviewActive.id) <= 0}
                onClick={() => {
                  landed.current = '';
                  setReviewId(queue[queue.findIndex((q) => q.id === reviewActive.id) - 1].id);
                }}
              >
                ‹
              </button>
              <span>
                {queue.findIndex((q) => q.id === reviewActive.id) + 1} / {queue.length}
              </span>
              <button
                aria-label="Next revision"
                disabled={queue.findIndex((q) => q.id === reviewActive.id) >= queue.length - 1}
                onClick={() => {
                  landed.current = '';
                  setReviewId(queue[queue.findIndex((q) => q.id === reviewActive.id) + 1].id);
                }}
              >
                ›
              </button>
            </div>
            <div className="review-title">
              <strong>{reviewActive.summary}</strong>
              <small>
                {baseDoc
                  ? `${units.length} change${units.length === 1 ? '' : 's'}${
                      units.some((u) => u.conflict)
                        ? ` · ${units.filter((u) => u.conflict).length} you edited since`
                        : ''
                    } · ${acceptedIds.length} accepted${reviseIds.length ? ` · ${reviseIds.length} to revise` : ''}`
                  : 'Loading the version this was written against…'}
              </small>
            </div>
            {showScriptReview && (
              <div className="review-views" role="group" aria-label="Script view">
                {(
                  [
                    ['original', 'Original'],
                    ['new', 'New'],
                    ['changes', 'Changes'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    aria-pressed={reviewView === id}
                    className={reviewView === id ? 'on' : ''}
                    onClick={() => switchView(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            <div className="review-actions">
              <button
                className="primary"
                disabled={!units.some((u) => !u.conflict)}
                title="Accepts every change you haven't skipped, marked for revision, or edited since"
                onClick={() =>
                  void applyReview(
                    units
                      .filter(
                        (u) => !u.conflict && chosen[u.id] !== 'skip' && chosen[u.id] !== 'revise',
                      )
                      .map((u) => u.id),
                  )
                }
              >
                Accept all
              </button>
              <button
                disabled={!acceptedIds.length && !reviseIds.length}
                title="Applies the changes you accepted, saves your revise requests as notes, and discards the rest"
                onClick={() => void applyReview(acceptedIds)}
              >
                Apply {acceptedIds.length || ''} accepted
                {reviseIds.length ? ` · ${reviseIds.length} to revise` : ''}
              </button>
              <button onClick={() => void rejectReview()}>Reject</button>
              <button onClick={() => setReviewing(false)}>Done</button>
            </div>
          </div>
        )}
        {reviewing &&
          reviewActive &&
          tab !== 'script' &&
          ['bible', 'scenes', 'characters', 'planning', 'notes', 'projects'].includes(tab) && (
            <ReviewScope requests={myRequests} onRequest={setRequest} notesFor={() => []}>
              <ChangePanel
                units={units.filter((u) => u.tab === tab)}
                decisions={chosen}
                onDecide={decideUnit}
                onDecideAll={decideMany}
              />
            </ReviewScope>
          )}
        {d && tab === 'notes' && (
          <ReviewNotes
            key={p!.id}
            projectId={p!.id}
            document={d}
            initialNoteId={reviewNoteId}
            onTargetConsumed={() => setNoteTarget(undefined)}
            onChange={(notes) => edit({ ...d, notes })}
            onNavigate={navigate}
          />
        )}
        {d && tab === 'planning' && (
          <Planning
            key={p!.id}
            projectId={p!.id}
            items={d.planning ?? []}
            onChange={(planning) => edit({ ...d, planning })}
          />
        )}
        {error && (
          <div className="alert" role="alert">
            {error}
            <div>
              <button onClick={backup}>Download draft backup</button>
              <button onClick={() => void latest()}>Load latest</button>
              <button onClick={() => setError('')}>Dismiss</button>
            </div>
          </div>
        )}
        {recovery && (
          <div className="alert">
            A browser recovery draft is available (version {recovery.version}).
            <button
              onClick={() => {
                edit(recovery.document);
                if (recovery.version !== p?.version) {
                  blocked.current = true;
                  setError(
                    'Recovered draft is based on an older version. Back it up before loading the latest script.',
                  );
                }
                setRecovery(null);
              }}
            >
              Recover draft
            </button>
            <button
              onClick={async () => {
                if (
                  await confirmAsync(
                    'Discard this browser recovery draft and its unsaved changes?',
                    {
                      confirmLabel: 'Discard',
                      danger: true,
                    },
                  )
                ) {
                  localStorage.removeItem(recovery.recoveryKey ?? key(recovery.id));
                  setRecovery(null);
                }
              }}
            >
              Discard recovery
            </button>
          </div>
        )}
        {d && (
          <div hidden={tab !== 'script'}>
            {showScriptReview && reviewActive && (
              <ReviewScope
                requests={myRequests}
                onRequest={setRequest}
                notesFor={(blockId) =>
                  blockId
                    ? d.notes.filter((n) => n.blockId === blockId && n.status !== 'resolved')
                    : []
                }
              >
                <ScriptReview
                  current={d}
                  units={units.filter((u) => u.tab === 'script')}
                  decisions={chosen}
                  onDecide={decideUnit}
                  title={d.title.toUpperCase()}
                  view={reviewView}
                  newDoc={newDoc}
                  scrolls={viewScrolls}
                  pages={layout?.blockPages}
                  newPages={newPages}
                />
              </ReviewScope>
            )}
            <div hidden={showScriptReview}>
              <div className="toolbar" role="toolbar" aria-label="Script tools">
                <select
                  aria-label="Element type"
                  value={active?.type ?? 'action'}
                  disabled={!active || reviewMode}
                  onChange={(e) =>
                    editor.current
                      ?.chain()
                      .focus()
                      .updateAttributes('screenplayBlock', { kind: e.target.value })
                      .run()
                  }
                >
                  {kinds.map((k) => (
                    <option value={k} key={k}>
                      {labels[k]}
                    </option>
                  ))}
                </select>
                {(() => {
                  const options =
                    active?.type === 'scene'
                      ? ['INT. ', 'EXT. ', 'INT./EXT. ']
                      : active?.type === 'character'
                        ? names
                            .filter((n) => n.toLowerCase().startsWith(active.text.toLowerCase()))
                            .slice(0, 8)
                        : [];
                  const usable = !reviewMode && options.length > 0;
                  return (
                    <div className="menu-wrap">
                      <button
                        aria-haspopup="menu"
                        aria-expanded={menu === 'suggest'}
                        disabled={!usable}
                        title={
                          active?.type === 'character'
                            ? 'Character names'
                            : 'Scene prefix (select a scene heading)'
                        }
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => setMenu(menu === 'suggest' ? '' : 'suggest')}
                      >
                        {active?.type === 'character' ? 'Name' : 'INT/EXT'} ▾
                      </button>
                      {menu === 'suggest' && usable && (
                        <div className="menu menu-left" role="menu">
                          {options.map((name) => (
                            <button
                              key={name}
                              role="menuitem"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => {
                                editor.current
                                  ?.chain()
                                  .focus()
                                  .command(({ tr, state }) => {
                                    const pos = state.selection.$from;
                                    tr.insertText(name, pos.start(), pos.end());
                                    return true;
                                  })
                                  .run();
                                setMenu('');
                              }}
                            >
                              {name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}
                <button
                  className="icon-btn"
                  aria-label="Undo"
                  title="Undo"
                  disabled={reviewMode}
                  onClick={() => editor.current?.chain().focus().undo().run()}
                >
                  ↶
                </button>
                <button
                  className="icon-btn"
                  aria-label="Redo"
                  title="Redo"
                  disabled={reviewMode}
                  onClick={() => editor.current?.chain().focus().redo().run()}
                >
                  ↷
                </button>
                <button
                  className="icon-btn"
                  aria-label="Add element"
                  title="Add element"
                  disabled={reviewMode}
                  onClick={() => add(focus)}
                >
                  ＋
                </button>
                <span className="toolbar-separator" />
                <button
                  aria-label="Add review note"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    const e = editor.current;
                    const selection = e?.state.selection;
                    const quote =
                      e && selection && !selection.empty
                        ? e.state.doc.textBetween(selection.from, selection.to, '\n')
                        : '';
                    setNoteTarget({
                      sceneId: currentScene?.id,
                      blockId: active?.id,
                      quote,
                      anchorFrom: selection?.$from.parentOffset,
                      anchorTo:
                        selection && selection.$from.sameParent(selection.$to)
                          ? selection.$to.parentOffset
                          : selection?.$from.parent.content.size,
                      pinOffset: selection?.$from.parentOffset,
                      key: Date.now(),
                    });
                    setStickyNotes(true);
                  }}
                >
                  <span aria-hidden="true">✎</span>
                  <span className="note-label"> Note</span>
                </button>
                <div className="menu-wrap">
                  <button
                    aria-haspopup="menu"
                    aria-expanded={menu === 'view'}
                    className={reviewMode || zen ? 'active' : ''}
                    onClick={() => setMenu(menu === 'view' ? '' : 'view')}
                  >
                    View ▾
                  </button>
                  {menu === 'view' && (
                    <div className="menu" role="menu">
                      <button
                        role="menuitemcheckbox"
                        aria-checked={pageMode}
                        onClick={() => {
                          setPageMode(!pageMode);
                          setMenu('');
                        }}
                      >
                        {pageMode ? '✓ ' : ''}Single page mode
                      </button>
                      <button
                        role="menuitemcheckbox"
                        aria-checked={zen}
                        onClick={() => {
                          setZen(!zen);
                          setMenu('');
                        }}
                      >
                        {zen ? '✓ ' : ''}Focus mode
                      </button>
                      <button
                        role="menuitemcheckbox"
                        aria-checked={reviewMode}
                        onClick={() => {
                          setReviewMode(!reviewMode);
                          setStickyNotes(true);
                          setMenu('');
                        }}
                      >
                        {reviewMode ? '✓ ' : ''}Review mode (pin notes)
                      </button>
                      <button
                        role="menuitemcheckbox"
                        aria-checked={stickyNotes}
                        onClick={() => {
                          setStickyNotes(!stickyNotes);
                          if (stickyNotes) setReviewMode(false);
                          setMenu('');
                        }}
                      >
                        {stickyNotes ? '✓ ' : ''}Note markers
                      </button>
                      <button
                        role="menuitemcheckbox"
                        aria-checked={contextual}
                        onClick={() => {
                          setContextual(!contextual);
                          setMenu('');
                        }}
                      >
                        {contextual ? '✓ ' : ''}Scene notes panel
                      </button>
                    </div>
                  )}
                </div>
                <span className="counts">
                  {pageMode ? pageNo + ' / ' : ''}
                  {totalPages} pg
                  <span className="wordcount">
                    {' · '}
                    {
                      d.blocks
                        .map((b) => b.text)
                        .join(' ')
                        .split(/\s+/)
                        .filter(Boolean).length
                    }{' '}
                    words
                  </span>
                </span>
              </div>
              {reviewMode && (
                <div className="review-mode-banner">
                  Review mode · Click any word or position in the screenplay to pin a note. Exit
                  review mode to resume writing.
                </div>
              )}
              <div
                className={`canvas ${contextual ? 'with-context' : ''} ${stickyNotes ? 'with-sticky-notes' : ''}`}
              >
                <ScriptNotes
                  key={p!.id}
                  projectId={p!.id}
                  document={d}
                  target={noteTarget}
                  visible={stickyNotes}
                  openId={noteOpen}
                  isVisible={
                    pageMode
                      ? (id) => !id || !layout?.blockPages[id] || layout.blockPages[id] === pageNo
                      : undefined
                  }
                  onOpenId={setNoteOpen}
                  onCancel={() => setNoteTarget(undefined)}
                  onChange={(notes) => edit({ ...current.current!.document, notes })}
                  onOpen={(id) => {
                    setReviewNoteId(id);
                    setTab('notes');
                  }}
                >
                  <article className="paper">
                    <div className="paper-heading">
                      {d.title.toUpperCase()}
                      <span>DRAFT {d.metadata.draft}</span>
                    </div>
                    <ScreenplayEditor
                      key={p!.id}
                      blocks={d.blocks}
                      notes={d.notes}
                      showNotes={stickyNotes}
                      reviewMode={reviewMode}
                      pendingNote={noteTarget}
                      openNoteId={noteOpen}
                      pages={layout?.blockPages}
                      singlePage={pageMode ? pageNo : 0}
                      onPinNote={(target) => {
                        setNoteTarget(target);
                        setStickyNotes(true);
                      }}
                      onOpenNote={(id) => {
                        setStickyNotes(true);
                        setNoteOpen(id);
                      }}
                      onReady={(e) => {
                        editor.current = e;
                        const cursor = recall<{ id: string; offset: number } | null>(
                          p!.id + ':cursor',
                          null,
                        );
                        if (cursor)
                          e.state.doc.forEach((node, pos) => {
                            if (node.attrs.id === cursor.id) {
                              e.commands.setTextSelection(
                                pos + 1 + Math.min(cursor.offset, node.content.size),
                              );
                              setFocus(cursor.id);
                            }
                          });
                      }}
                      onFocus={(id) => {
                        setFocus(id);
                        const e = editor.current;
                        if (e && current.current)
                          remember(current.current.id + ':cursor', {
                            id,
                            offset: e.state.selection.$from.parentOffset,
                          });
                      }}
                      onChange={(blocks, notes) =>
                        edit({ ...current.current!.document, blocks, ...(notes ? { notes } : {}) })
                      }
                    />
                    <button
                      className="add-end"
                      hidden={pageMode && pageNo < totalPages}
                      disabled={reviewMode}
                      onClick={() => add()}
                    >
                      ＋ Continue your story
                    </button>
                  </article>
                </ScriptNotes>
                {contextual && currentScene && (
                  <aside className="context-panel">
                    <div className="eyebrow">CURRENT SCENE</div>
                    <h3>{currentScene.text}</h3>
                    <label>
                      Synopsis
                      <textarea
                        rows={5}
                        value={d.bible.scenes[currentScene.id] ?? ''}
                        onChange={(e) =>
                          edit({
                            ...d,
                            bible: {
                              ...d.bible,
                              scenes: { ...d.bible.scenes, [currentScene.id]: e.target.value },
                            },
                          })
                        }
                      />
                    </label>
                    <button onClick={() => setTab('scenes')}>Open scene direction</button>
                    <h3>Pending revisions</h3>
                    {pending.map((q) => (
                      <button key={q.id} onClick={() => setTab('review')}>
                        {q.summary}
                      </button>
                    ))}
                    {!pending.length && <p>No pending revisions.</p>}
                  </aside>
                )}
                <div className="canvas-note" hidden={pageMode}>
                  A little space for a big idea.
                </div>
              </div>
              {pageMode && (
                <nav className="pager" aria-label="Page navigation">
                  <button disabled={pageNo <= 1} onClick={() => goPage(pageNo - 1)}>
                    ‹ Prev
                  </button>
                  <label className="pager-field">
                    <span className="sr-only">Page number</span>
                    <input
                      inputMode="numeric"
                      pattern="[0-9]*"
                      aria-label="Go to page"
                      value={pageDraft || String(pageNo)}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => setPageDraft(e.target.value.replace(/[^0-9]/g, ''))}
                      onBlur={() => pageDraft && goPage(Number(pageDraft))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          goPage(Number(pageDraft || pageNo));
                          (e.target as HTMLInputElement).blur();
                        }
                        if (e.key === 'Escape') {
                          setPageDraft('');
                          (e.target as HTMLInputElement).blur();
                        }
                      }}
                    />
                    <span aria-hidden="true">of {totalPages}</span>
                  </label>
                  <button disabled={pageNo >= totalPages} onClick={() => goPage(pageNo + 1)}>
                    Next ›
                  </button>
                </nav>
              )}
            </div>
          </div>
        )}
        {d && tab === 'bible' && (
          <section className="panel stack">
            <header className="panel-head">
              <div>
                <div className="eyebrow">THE WORLD BEHIND THE WORDS</div>
                <h2>Story bible</h2>
              </div>
            </header>
            <div className="grid">
              <label>
                Title
                <input value={d.title} onChange={(e) => edit({ ...d, title: e.target.value })} />
              </label>
              <label>
                Written by
                <input value={d.author} onChange={(e) => edit({ ...d, author: e.target.value })} />
              </label>
            </div>
            {(
              [
                ['story', 'Story', ['logline', 'premise', 'story', 'characters'], true],
                [
                  'world',
                  'World & rules',
                  ['world', 'continuity', 'constraints', 'research'],
                  false,
                ],
              ] as const
            ).map(([group, title, keys, open]) => (
              <RememberedDetails
                className="fold"
                key={p!.id + ':bible-' + group}
                storageKey={p!.id + ':bible-' + group}
                defaultOpen={open}
              >
                <summary>
                  <span className="t">{title}</span>
                  <span className="meta">
                    {keys.filter((k) => d.bible[k].trim()).length}/{keys.length} filled
                  </span>
                </summary>
                {keys.map((k) => (
                  <label key={k}>
                    {k === 'world' ? 'World & continuity' : k[0].toUpperCase() + k.slice(1)}
                    <textarea
                      rows={3}
                      value={d.bible[k]}
                      onChange={(e) => edit({ ...d, bible: { ...d.bible, [k]: e.target.value } })}
                    />
                  </label>
                ))}
              </RememberedDetails>
            ))}
            <RememberedDetails
              className="fold"
              key={p!.id + ':bible-scenes'}
              storageKey={p!.id + ':bible-scenes'}
            >
              <summary>
                <span className="t">Scene bible</span>
                <span className="meta">{scenes.length} scenes</span>
              </summary>
              {scenes.map((s) => (
                <label key={s.id}>
                  {s.text}
                  <textarea
                    rows={3}
                    placeholder="Purpose, beats, location, continuity…"
                    value={d.bible.scenes[s.id] ?? ''}
                    onChange={(e) =>
                      edit({
                        ...d,
                        bible: {
                          ...d.bible,
                          scenes: { ...d.bible.scenes, [s.id]: e.target.value },
                        },
                      })
                    }
                  />
                </label>
              ))}
            </RememberedDetails>
          </section>
        )}

        {d && tab === 'scenes' && (
          <section className="panel stack">
            <header className="panel-head">
              <div>
                <div className="eyebrow">BEATS, PURPOSE & DIRECTION</div>
                <h2>Scene desk</h2>
              </div>
              <button
                onClick={() =>
                  edit({
                    ...d,
                    blocks: [
                      ...d.blocks,
                      { id: crypto.randomUUID(), type: 'scene', text: 'INT. NEW SCENE - DAY' },
                      { id: crypto.randomUUID(), type: 'action', text: '' },
                    ],
                  })
                }
              >
                ＋ New scene
              </button>
            </header>
            {!scenes.length && <p>No scenes yet. Add one, or start writing in the Script tab.</p>}
            {scenes.map((s, i) => {
              const status = d.sceneStatus[s.id] ?? 'drafting';
              return (
                <RememberedDetails
                  className="fold scene-card"
                  key={p!.id + ':scene-fold:' + s.id}
                  storageKey={p!.id + ':scene-fold:' + s.id}
                  defaultOpen={scenes.length <= 2}
                >
                  <summary>
                    <span className="n">{i + 1}</span>
                    <span className="t">{s.text || 'Untitled scene'}</span>
                    <span className={'status ' + status}>{status}</span>
                  </summary>
                  <div className="scene-actions">
                    <button
                      aria-label="Move scene up"
                      disabled={i === 0}
                      onClick={() => edit(moveScene(d, s.id, -1))}
                    >
                      ↑
                    </button>
                    <button
                      aria-label="Move scene down"
                      disabled={i === scenes.length - 1}
                      onClick={() => edit(moveScene(d, s.id, 1))}
                    >
                      ↓
                    </button>
                    <button onClick={() => edit(duplicateScene(d, s.id))}>Duplicate</button>
                    <button
                      onClick={async () => {
                        if (
                          await confirmAsync(
                            'Delete this scene and its screenplay text? Prior versions remain in history.',
                            { confirmLabel: 'Delete scene', danger: true },
                          )
                        ) {
                          const ids = new Set(sceneBlocks(d, s.id).map((b) => b.id));
                          edit({ ...d, blocks: d.blocks.filter((b) => !ids.has(b.id)) });
                        }
                      }}
                    >
                      Delete
                    </button>
                    <button className="link" onClick={() => navigate(s.id)}>
                      Open in script →
                    </button>
                  </div>
                  <div className="grid">
                    <label>
                      Scene heading
                      <input
                        value={s.text}
                        onChange={(e) => block(s.id, { text: e.target.value })}
                      />
                    </label>
                    <label>
                      Status
                      <select
                        value={status}
                        onChange={(e) =>
                          edit({
                            ...d,
                            sceneStatus: { ...d.sceneStatus, [s.id]: e.target.value as any },
                          })
                        }
                      >
                        {['planned', 'drafting', 'revision', 'approved'].map((x) => (
                          <option key={x}>{x}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label>
                    Synopsis & notes
                    <textarea
                      rows={2}
                      placeholder="What happens, and why the scene matters"
                      value={d.bible.scenes[s.id] ?? ''}
                      onChange={(e) =>
                        edit({
                          ...d,
                          bible: {
                            ...d.bible,
                            scenes: { ...d.bible.scenes, [s.id]: e.target.value },
                          },
                        })
                      }
                    />
                  </label>
                  <RememberedDetails
                    className="subfold"
                    key={p!.id + ':' + ('brief:' + s.id)}
                    storageKey={p!.id + ':' + ('brief:' + s.id)}
                  >
                    <summary>Scene direction brief</summary>
                    <div className="grid">
                      {Object.entries(BriefSchema.parse(d.briefs[s.id] ?? {})).map(([k, v]) => (
                        <label key={k}>
                          {(
                            k.replace(/([A-Z])/g, ' $1')[0].toUpperCase() +
                            k.replace(/([A-Z])/g, ' $1').slice(1)
                          ).trim()}
                          <textarea
                            rows={2}
                            value={v}
                            onChange={(e) =>
                              edit({
                                ...d,
                                briefs: {
                                  ...d.briefs,
                                  [s.id]: {
                                    ...BriefSchema.parse(d.briefs[s.id] ?? {}),
                                    [k]: e.target.value,
                                  },
                                },
                              })
                            }
                          />
                        </label>
                      ))}
                    </div>
                  </RememberedDetails>
                  {d.notes
                    .filter((n) => n.sceneId === s.id)
                    .map((n) => (
                      <p className="scene-note" key={n.id}>
                        <strong>{n.category}:</strong> {n.text}
                      </p>
                    ))}
                </RememberedDetails>
              );
            })}
          </section>
        )}
        {d && tab === 'characters' && (
          <section className="panel stack">
            <header className="panel-head">
              <div>
                <div className="eyebrow">THE CAST</div>
                <h2>The people in your story</h2>
              </div>
              <button
                onClick={() =>
                  edit({
                    ...d,
                    characters: [
                      ...d.characters,
                      CharacterSchema.parse({ id: crypto.randomUUID(), name: 'New character' }),
                    ],
                  })
                }
              >
                ＋ Add character
              </button>
            </header>
            {!d.characters.length && (
              <p>
                No characters yet. Profiles hold age, motivation, voice and arc, and chat can read
                them when it suggests dialogue or revisions.
              </p>
            )}
            {d.characters.map((c) => (
              <RememberedDetails
                className="fold"
                key={p!.id + ':char:' + c.id}
                storageKey={p!.id + ':char:' + c.id}
                defaultOpen={d.characters.length <= 2}
              >
                <summary>
                  <span className="t">{c.name || 'Unnamed'}</span>
                  <span className="meta">{c.age}</span>
                </summary>
                <div className="grid">
                  {(['name', 'aliases', 'age'] as const).map((k) => (
                    <label key={k}>
                      {k[0].toUpperCase() + k.slice(1)}
                      <input
                        value={c[k]}
                        onChange={(e) =>
                          edit({
                            ...d,
                            characters: d.characters.map((x) =>
                              x.id === c.id ? { ...x, [k]: e.target.value } : x,
                            ),
                          })
                        }
                      />
                    </label>
                  ))}
                </div>
                {(
                  [
                    'description',
                    'background',
                    'motivation',
                    'relationships',
                    'voice',
                    'arc',
                  ] as const
                ).map((k) => (
                  <label key={k}>
                    {k[0].toUpperCase() + k.slice(1)}
                    <textarea
                      rows={2}
                      value={c[k]}
                      onChange={(e) =>
                        edit({
                          ...d,
                          characters: d.characters.map((x) =>
                            x.id === c.id ? { ...x, [k]: e.target.value } : x,
                          ),
                        })
                      }
                    />
                  </label>
                ))}
                <button
                  onClick={async () => {
                    if (
                      await confirmAsync('Delete this character profile?', {
                        confirmLabel: 'Delete',
                        danger: true,
                      })
                    )
                      edit({ ...d, characters: d.characters.filter((x) => x.id !== c.id) });
                  }}
                >
                  Delete profile
                </button>
              </RememberedDetails>
            ))}
          </section>
        )}
        {d && tab === 'projects' && (
          <section className="panel stack">
            <header className="panel-head">
              <div>
                <div className="eyebrow">YOUR WRITING ROOM</div>
                <h2>Projects</h2>
              </div>
            </header>
            <p>
              Open, duplicate, archive or back up a screenplay. Archived projects stay available
              here.
            </p>
            <div className="row-list">
              {projects.map((q) => (
                <div className="history" key={q.id}>
                  <div>
                    <strong>{q.title}</strong>
                    <small>
                      Draft {q.draft}
                      {q.archived ? ' · Archived' : ''}
                      {q.id === p?.id ? ' · Open now' : ''}
                    </small>
                  </div>
                  <button disabled={q.id === p?.id} onClick={() => void open(q.id)}>
                    Open
                  </button>
                </div>
              ))}
            </div>
            <h3>Current project</h3>
            <div className="grid">
              <label>
                Title
                <input value={d.title} onChange={(e) => edit({ ...d, title: e.target.value })} />
              </label>
              <label>
                Draft
                <span className="draft-field">
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={d.metadata.draft}
                    onChange={(e) =>
                      edit({
                        ...d,
                        metadata: {
                          ...d.metadata,
                          draft: Math.min(99, Math.max(1, Math.floor(Number(e.target.value)) || 1)),
                        },
                      })
                    }
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      if (
                        !(await confirmAsync(
                          `Start draft ${d.metadata.draft + 1}? Draft ${d.metadata.draft} stays in History.`,
                          { confirmLabel: 'Start next draft' },
                        ))
                      )
                        return;
                      edit({ ...d, metadata: { ...d.metadata, draft: d.metadata.draft + 1 } });
                    }}
                  >
                    Start next draft
                  </button>
                </span>
              </label>
              <label>
                Genre
                <input
                  value={d.metadata.genre}
                  onChange={(e) =>
                    edit({ ...d, metadata: { ...d.metadata, genre: e.target.value } })
                  }
                />
              </label>
              <label>
                Format
                <select
                  value={d.metadata.format}
                  onChange={(e) =>
                    edit({ ...d, metadata: { ...d.metadata, format: e.target.value as any } })
                  }
                >
                  {['feature', 'short', 'television'].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
              <label>
                Page size
                <select
                  value={d.metadata.pageSize}
                  onChange={(e) =>
                    edit({ ...d, metadata: { ...d.metadata, pageSize: e.target.value as any } })
                  }
                >
                  <option value="LETTER">US Letter</option>
                  <option>A4</option>
                </select>
              </label>
            </div>
            <label>
              Description
              <textarea
                value={d.metadata.description}
                onChange={(e) =>
                  edit({ ...d, metadata: { ...d.metadata, description: e.target.value } })
                }
              />
            </label>
            <div className="decision">
              <button
                onClick={async () => {
                  if (dirty.current) return setError('Save your draft first.');
                  try {
                    const v = await api('/projects', {
                      document: { ...d, title: d.title + ' (copy)' },
                    });
                    await refresh();
                    await open(v.id);
                  } catch (e) {
                    fail(e);
                  }
                }}
              >
                Duplicate project
              </button>
              <button
                onClick={async () => {
                  if (
                    await confirmAsync(
                      d.metadata.archived
                        ? 'Restore project to workspace?'
                        : 'Archive this project? It remains in your project list.',
                      { confirmLabel: d.metadata.archived ? 'Restore' : 'Archive' },
                    )
                  )
                    edit({ ...d, metadata: { ...d.metadata, archived: !d.metadata.archived } });
                }}
              >
                {d.metadata.archived ? 'Unarchive' : 'Archive'}
              </button>
              <button
                onClick={() => {
                  if (dirty.current || saving.current)
                    return setError(
                      'Save first to include your latest draft in the complete backup.',
                    );
                  window.location.href = '/api/projects/' + p!.id + '/backup';
                }}
              >
                Complete project backup
              </button>
            </div>
          </section>
        )}
        {d && tab === 'review' && (
          <section className="panel">
            <div className="eyebrow">YOU HAVE THE FINAL WORD</div>
            <h2>Revision desk</h2>
            <p>
              Suggestions remain separate until you approve them. Each proposal is tied to the
              version it was written against.
            </p>
            {!proposals.length && (
              <div className="empty">
                <span>✧</span>
                <h3>A fresh pair of eyes, on your terms.</h3>
                <p>
                  Connect a local MCP client to submit suggestions, or create a sample proposal to
                  try the review flow.
                </p>
                <button
                  onClick={async () => {
                    try {
                      const document = structuredClone(d);
                      document.bible.logline += ' [Sample suggestion — edit or reject this.]';
                      await api(`/projects/${p!.id}/proposals`, {
                        baseVersion: p!.version,
                        summary: 'Sample: extend the logline',
                        document,
                      });
                      await refresh();
                    } catch (e) {
                      fail(e);
                    }
                  }}
                >
                  Try a sample proposal
                </button>
              </div>
            )}
            {proposals.map((q) => {
              const rows = diff(revisionDocs[p!.id + ':' + q.baseVersion] ?? d, q.document);
              const stale = q.baseVersion !== p!.version;
              return (
                <div className={'proposal ' + q.status} key={q.id}>
                  <div className="eyebrow">
                    {q.status} · WRITTEN AGAINST DRAFT {q.baseVersion}
                  </div>
                  <h3>{q.summary}</h3>
                  <small>
                    {q.createdAt} UTC · {rows.length} change{rows.length === 1 ? '' : 's'}
                  </small>
                  {q.status === 'pending' && (
                    <div className="decision">
                      <button
                        className="primary"
                        onClick={() => {
                          startReview(q.id);
                          setTab('script');
                        }}
                      >
                        Review in context
                      </button>
                      <button
                        disabled={stale || dirty.current || q.edited}
                        onClick={() => void decision(q, true)}
                      >
                        Approve
                      </button>
                      <button onClick={() => void decision(q, false)}>Reject</button>
                      {stale && (
                        <small className="stale">
                          Out of date: the script is now draft {p!.version}. Ask chat for an updated
                          suggestion.
                        </small>
                      )}
                    </div>
                  )}
                  <RememberedDetails
                    className="subfold"
                    key={p!.id + ':' + ('review:' + q.id)}
                    storageKey={p!.id + ':' + ('review:' + q.id)}
                    defaultOpen={q.status === 'pending'}
                  >
                    <summary>Changes ({rows.length})</summary>
                    <ChangeRows rows={rows} />
                  </RememberedDetails>
                  {q.status === 'pending' && (
                    <RememberedDetails
                      key={p!.id + ':' + ('edit-proposal:' + q.id)}
                      storageKey={p!.id + ':' + ('edit-proposal:' + q.id)}
                    >
                      <summary>Edit proposal</summary>
                      <label>
                        Title
                        <input
                          value={q.document.title}
                          onChange={(e) =>
                            setProposals((list) =>
                              list.map((x) =>
                                x.id === q.id
                                  ? {
                                      ...x,
                                      edited: true,
                                      document: { ...x.document, title: e.target.value },
                                    }
                                  : x,
                              ),
                            )
                          }
                        />
                      </label>
                      <label>
                        Logline
                        <textarea
                          value={q.document.bible.logline}
                          onChange={(e) =>
                            setProposals((list) =>
                              list.map((x) =>
                                x.id === q.id
                                  ? {
                                      ...x,
                                      edited: true,
                                      document: {
                                        ...x.document,
                                        bible: { ...x.document.bible, logline: e.target.value },
                                      },
                                    }
                                  : x,
                              ),
                            )
                          }
                        />
                      </label>
                      {q.document.blocks.map((b, i) => (
                        <label key={b.id}>
                          {labels[b.type]} {i + 1}
                          <textarea
                            rows={2}
                            value={b.text}
                            onChange={(e) =>
                              setProposals((list) =>
                                list.map((x) =>
                                  x.id === q.id
                                    ? {
                                        ...x,
                                        edited: true,
                                        document: {
                                          ...x.document,
                                          blocks: x.document.blocks.map((y) =>
                                            y.id === b.id ? { ...y, text: e.target.value } : y,
                                          ),
                                        },
                                      }
                                    : x,
                                ),
                              )
                            }
                          />
                        </label>
                      ))}
                      <button
                        onClick={async () => {
                          try {
                            await api('/projects/' + p!.id + '/proposals', {
                              baseVersion: q.baseVersion,
                              summary: 'Human-edited: ' + q.summary,
                              document: q.document,
                            });
                            await api('/proposals/' + q.id + '/decision', { accept: false });
                            await refresh();
                          } catch (e) {
                            fail(e);
                          }
                        }}
                      >
                        Submit edited proposal for review
                      </button>
                      <p>Submit edits before approving. Approval applies the stored proposal.</p>
                    </RememberedDetails>
                  )}
                </div>
              );
            })}
          </section>
        )}
        {d && tab === 'history' && (
          <section className="panel">
            <h2>Every draft has a story.</h2>
            <p>
              A draft is a full version of the script you start on purpose. Revisions are the saves
              along the way. Restoring creates another revision.
            </p>
            <h3>Drafts</h3>
            <div className="row-list">
              {[...new Set(history.map((h) => h.draft as number))].map((n) => {
                const latest = history.find((h) => h.draft === n)!;
                return (
                  <div className="history" key={n}>
                    <div>
                      <strong>Draft {n}</strong>
                      <small>
                        {history.filter((h) => h.draft === n).length} revisions · last saved{' '}
                        {latest.createdAt} UTC
                        {n === d.metadata.draft ? ' · Current draft' : ''}
                      </small>
                    </div>
                    <button
                      onClick={() => {
                        window.location.href =
                          '/api/projects/' + p!.id + '/revisions/' + latest.version + '/export';
                      }}
                    >
                      Download full script
                    </button>
                  </div>
                );
              })}
            </div>
            <h3>Revisions</h3>
            <button
              onClick={async () => {
                if (dirty.current || saving.current) return setError('Save your draft first.');
                try {
                  install(
                    await api(
                      '/projects/' + p!.id,
                      { version: p!.version, document: d, checkpoint: true },
                      'PUT',
                    ),
                  );
                  await refresh();
                } catch (e) {
                  fail(e);
                }
              }}
            >
              Create checkpoint
            </button>
            {history.map((h) => (
              <div className="history" key={h.id}>
                <div>
                  <strong>
                    Rev {h.version} · Draft {h.draft}
                  </strong>
                  <small>
                    {h.createdAt} UTC ·{' '}
                    {h.source.startsWith('notes:')
                      ? 'Revision notes added'
                      : h.source === 'note-reply'
                        ? 'Chat replied to a note'
                        : h.source.startsWith('approved:')
                          ? 'AI proposal approved'
                          : h.source === 'import'
                            ? 'Imported screenplay'
                            : h.source === 'created'
                              ? 'Project created'
                              : h.source}
                  </small>
                </div>
                <div>
                  <button
                    onClick={async () => {
                      try {
                        const snapshot = await api(
                          '/projects/' + p!.id + '/revisions/' + h.version,
                        );
                        setRevisionDocs((old) => ({
                          ...old,
                          [p!.id + ':' + h.version]: snapshot.document,
                        }));
                      } catch (e) {
                        fail(e);
                      }
                    }}
                  >
                    Compare
                  </button>
                  <button
                    onClick={async () => {
                      if (
                        await confirmAsync(`Restore revision ${h.version} as a new revision?`, {
                          confirmLabel: 'Restore',
                        })
                      )
                        try {
                          const snapshot = await api(
                            '/projects/' + p!.id + '/revisions/' + h.version,
                          );
                          edit(snapshot.document);
                        } catch (e) {
                          fail(e);
                        }
                    }}
                  >
                    Restore to editor
                  </button>
                  <button
                    onClick={() => {
                      window.location.href =
                        '/api/projects/' + p!.id + '/revisions/' + h.version + '/export';
                    }}
                  >
                    Download
                  </button>
                  {revisionDocs[p!.id + ':' + h.version] && (
                    <RememberedDetails
                      key={p!.id + ':' + ('history:' + h.version)}
                      storageKey={p!.id + ':' + ('history:' + h.version)}
                    >
                      <summary>Changes from revision {h.version}</summary>
                      <ChangeRows rows={diff(revisionDocs[p!.id + ':' + h.version], d)} />
                    </RememberedDetails>
                  )}
                </div>
              </div>
            ))}
          </section>
        )}
        {tab === 'connect' && (
          <section className="panel">
            <div className="eyebrow">LOCAL FIRST · HUMAN LED</div>
            <h2>Your writing connections</h2>
            <div className="connection-card">
              <h3>AI connections</h3>
              <p>
                Connect the chats you use. They read your project and propose revisions through one
                shared local server. Proposals land in Revisions and only you can approve them.
              </p>
              <ul className="client-list connect-list">
                {(connections?.clients ?? []).map((c) => (
                  <li key={c.id}>
                    <div className="connect-row">
                      <div>
                        <strong>{c.label}</strong>
                        <small>
                          {c.state === 'connected'
                            ? 'Connected'
                            : c.state === 'outdated'
                              ? 'Connected to an old location'
                              : c.state === 'not-detected'
                                ? c.detail
                                : 'Not connected'}
                        </small>
                      </div>
                      <button
                        className={c.state === 'connected' ? '' : 'primary'}
                        disabled={c.state === 'not-detected'}
                        onClick={() => void connectClient(c.id)}
                      >
                        {c.state === 'connected'
                          ? 'Reconnect'
                          : c.state === 'outdated'
                            ? 'Update'
                            : 'Connect'}
                      </button>
                    </div>
                    {connectNote[c.id] && (
                      <p className={'connect-note' + (connectNote[c.id].ok ? ' ok' : '')}>
                        {connectNote[c.id].message}
                        {connectNote[c.id].command && <code>{connectNote[c.id].command}</code>}
                      </p>
                    )}
                  </li>
                ))}
                {!connections && <li>Checking this computer…</li>}
                <li>
                  <strong>Chat browser panes</strong>
                  <small>
                    Open this app in the pane and the Site tools below register automatically.
                  </small>
                </li>
                <li>
                  <strong>ChatGPT on the web</strong>
                  <small>
                    Cannot reach this computer directly; it needs the private tunnel in
                    AI_INTEGRATION.md.
                  </small>
                </li>
              </ul>
              {connections && (
                <p className="data-path">
                  Your screenplays are saved in <code>{connections.dataDirectory}</code>
                </p>
              )}
            </div>
            <div className="connection-card">
              <h3>
                Browser tools <span className="badge">OPTIONAL</span>
              </h3>
              <p>
                Register read and propose actions when document.modelContext is available.
                Unsupported browsers keep the manual editor. Approval stays in the editor.
              </p>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={tools}
                  onChange={(e) => setTools(e.target.checked)}
                />{' '}
                Enable Site tools in this browser (remembered)
              </label>
              <code>document.modelContext?.registerTool</code>
              <p>
                {typeof (document as any).modelContext?.registerTool === 'function'
                  ? 'WebMCP registry detected — discovery still requires a compatible client.'
                  : 'WebMCP registry unavailable in this browser.'}
              </p>
            </div>
            <div className="connection-card">
              <h3>Hosted ChatGPT</h3>
              <p>
                No direct localhost connection is assumed. A separately configured, authenticated
                reachable transport and account support would be needed. This app does not publish
                your work or open a tunnel.
              </p>
            </div>
            <RememberedDetails
              key={(p?.id ?? 'no-project') + ':' + 'capabilities'}
              storageKey={(p?.id ?? 'no-project') + ':' + 'capabilities'}
            >
              <summary>Server capabilities</summary>
              <pre>{JSON.stringify(capabilities, null, 2)}</pre>
            </RememberedDetails>
          </section>
        )}
        <footer>
          <span>COURIER PAGES</span>
          <span>Local workspace · No account required</span>
          <button onClick={backup}>Download draft backup</button>
        </footer>
      </main>
    </div>
  );
}
function readable(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(readable).join('\n\n');
  if (typeof value === 'object')
    return Object.entries(value)
      .filter(([k, v]) => k !== 'id' && k !== 'sceneId' && v !== '' && v !== undefined)
      .map(([k, v]) => k.replace(/([A-Z])/g, ' $1') + ': ' + readable(v))
      .join('\n');
  return String(value);
}
function diff(a: Script, b: Script) {
  const rows: { label: string; before: string; after: string }[] = [];
  for (const k of [
    'title',
    'author',
    'metadata',
    'bible',
    'planning',
    'characters',
    'briefs',
    'sceneStatus',
    'notes',
  ] as const) {
    const x = typeof a[k] === 'string' ? (a[k] as string) : readable(a[k]),
      y = typeof b[k] === 'string' ? (b[k] as string) : readable(b[k]);
    if (x !== y) rows.push({ label: k, before: x, after: y });
  }
  const ids = [...new Set([...a.blocks, ...b.blocks].map((x) => x.id))];
  for (const id of ids) {
    const x = a.blocks.find((v) => v.id === id),
      y = b.blocks.find((v) => v.id === id);
    if (JSON.stringify(x) !== JSON.stringify(y))
      rows.push({
        label: labels[y?.type ?? x!.type],
        before: x ? `${x.type}: ${x.text}` : '',
        after: y ? `${y.type}: ${y.text}` : '',
      });
  }
  if (a.blocks.map((x) => x.id).join() !== b.blocks.map((x) => x.id).join())
    rows.push({
      label: 'Screenplay order',
      before: a.blocks
        .filter((x) => x.type === 'scene')
        .map((x) => x.text)
        .join('\n'),
      after: b.blocks
        .filter((x) => x.type === 'scene')
        .map((x) => x.text)
        .join('\n'),
    });
  return rows;
}
createRoot(document.getElementById('root')!).render(<App />);
