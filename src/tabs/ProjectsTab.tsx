import { confirmAsync } from '../dialogs';
import { api } from '../helpers';
import type { Studio } from '../useStudio';

export function ProjectsTab({ s }: { s: Studio }) {
  const { p, projects, open, edit, dirty, setError, refresh, fail, saving } = s;
  const d = s.d!;
  return (
    <section className="panel stack">
      <header className="panel-head">
        <div>
          <div className="eyebrow">YOUR WRITING ROOM</div>
          <h2>Projects</h2>
        </div>
      </header>
      <p>
        Open, duplicate, archive or back up a screenplay. Archived projects stay available here.
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
            onChange={(e) => edit({ ...d, metadata: { ...d.metadata, genre: e.target.value } })}
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
          onChange={(e) => edit({ ...d, metadata: { ...d.metadata, description: e.target.value } })}
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
              return setError('Save first to include your latest draft in the complete backup.');
            window.location.href = '/api/projects/' + p!.id + '/backup';
          }}
        >
          Complete project backup
        </button>
      </div>
    </section>
  );
}
