import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { type Project, type Script, type Proposal, type Block } from './model';
import { confirmAsync } from './dialogs';
import { type NoteTarget } from './ReviewNotes';
import { recall, remember, useRemembered } from './workspace';
import type { Editor } from '@tiptap/react';
import { registerBrowserTools } from './webmcp';
import { key, api, recoveryFor, cached } from './helpers';
import { useProposalReview } from './useProposalReview';

export function useStudio() {
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
  const {
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
  } = useProposalReview({
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
  });
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
  return {
    p,
    connections,
    connectClient,
    connectNote,
    tools,
    setTools,
    capabilities,
    history,
    latest,
    d,
    dirty,
    saving,
    setError,
    install,
    refresh,
    fail,
    setRevisionDocs,
    edit,
    revisionDocs,
    proposals,
    startReview,
    setTab,
    decision,
    setProposals,
    projects,
    open,
    scenes,
    status,
    navigate,
    block,
    reviewNoteId,
    setNoteTarget,
    zen,
    side,
    drawer,
    setDrawer,
    current,
    search,
    setSearch,
    focus,
    layout,
    main,
    keepScroll,
    wide,
    setSide,
    save,
    file,
    primaryTabs,
    tab,
    reviewing,
    unitCounts,
    moreTabs,
    menu,
    setMenu,
    pending,
    changed,
    setChangesOpen,
    changesOpen,
    setChanged,
    reviewActive,
    reviewBar,
    queue,
    landed,
    setReviewId,
    baseDoc,
    units,
    acceptedIds,
    reviseIds,
    showScriptReview,
    reviewView,
    switchView,
    applyReview,
    chosen,
    rejectReview,
    setReviewing,
    myRequests,
    setRequest,
    decideUnit,
    decideMany,
    error,
    backup,
    recovery,
    blocked,
    setRecovery,
    newDoc,
    viewScrolls,
    newPages,
    active,
    reviewMode,
    editor,
    names,
    add,
    currentScene,
    setStickyNotes,
    pageMode,
    setPageMode,
    setZen,
    setReviewMode,
    stickyNotes,
    contextual,
    setContextual,
    pageNo,
    totalPages,
    noteTarget,
    noteOpen,
    setNoteOpen,
    setReviewNoteId,
    setFocus,
    goPage,
    pageDraft,
    setPageDraft,
  };
}

export type Studio = ReturnType<typeof useStudio>;
