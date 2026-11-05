import { ChangeRows } from '../Review';
import { confirmAsync } from '../dialogs';
import { RememberedDetails } from '../workspace';
import { api, diff } from '../helpers';
import type { Studio } from '../useStudio';

export function HistoryTab({ s }: { s: Studio }) {
  const {
    p,
    history,
    latest,
    dirty,
    saving,
    setError,
    install,
    refresh,
    fail,
    setRevisionDocs,
    edit,
    revisionDocs,
  } = s;
  const d = s.d!;
  return (
    <section className="panel">
      <h2>Every draft has a story.</h2>
      <p>
        A draft is a full version of the script you start on purpose. Revisions are the saves along
        the way. Restoring creates another revision.
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
                  const snapshot = await api('/projects/' + p!.id + '/revisions/' + h.version);
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
                    const snapshot = await api('/projects/' + p!.id + '/revisions/' + h.version);
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
  );
}
