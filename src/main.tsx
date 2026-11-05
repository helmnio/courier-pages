import { createRoot } from 'react-dom/client';
import { kinds } from './model';
import { ChangeRows } from './Review';
import { ChangePanel, ReviewScope, ScriptReview } from './ReviewUI';
import { confirmAsync, DialogHost, newScreenplayDialog } from './dialogs';
import { ScriptNotes } from './ScriptNotes';
import { recall, remember } from './workspace';
import { ScreenplayEditor } from './Editor';
import './style.css';
import { api, diff, key, labels } from './helpers';
import { useStudio } from './useStudio';
import { NotesTab } from './tabs/NotesTab';
import { PlanningTab } from './tabs/PlanningTab';
import { BibleTab } from './tabs/BibleTab';
import { ScenesTab } from './tabs/ScenesTab';
import { CharactersTab } from './tabs/CharactersTab';
import { ProjectsTab } from './tabs/ProjectsTab';
import { ReviewTab } from './tabs/ReviewTab';
import { HistoryTab } from './tabs/HistoryTab';
import { ConnectTab } from './tabs/ConnectTab';

function App() {
  const s = useStudio();
  const {
    zen,
    side,
    drawer,
    setDrawer,
    p,
    open,
    projects,
    dirty,
    setError,
    refresh,
    current,
    edit,
    fail,
    scenes,
    search,
    setSearch,
    d,
    navigate,
    setTab,
    focus,
    layout,
    main,
    keepScroll,
    wide,
    setSide,
    status,
    save,
    file,
    saving,
    primaryTabs,
    tab,
    reviewing,
    unitCounts,
    moreTabs,
    menu,
    setMenu,
    pending,
    startReview,
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
    latest,
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
    setNoteTarget,
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
  } = s;
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
        {d && tab === 'notes' && <NotesTab s={s} />}
        {d && tab === 'planning' && <PlanningTab s={s} />}
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
        {d && tab === 'bible' && <BibleTab s={s} />}

        {d && tab === 'scenes' && <ScenesTab s={s} />}
        {d && tab === 'characters' && <CharactersTab s={s} />}
        {d && tab === 'projects' && <ProjectsTab s={s} />}
        {d && tab === 'review' && <ReviewTab s={s} />}
        {d && tab === 'history' && <HistoryTab s={s} />}
        {tab === 'connect' && <ConnectTab s={s} />}
        <footer>
          <span>COURIER PAGES</span>
          <span>Local workspace · No account required</span>
          <button onClick={backup}>Download draft backup</button>
        </footer>
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
