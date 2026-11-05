import { ChangeRows } from '../Review';
import { RememberedDetails } from '../workspace';
import { api, diff, labels } from '../helpers';
import type { Studio } from '../useStudio';

export function ReviewTab({ s }: { s: Studio }) {
  const {
    p,
    proposals,
    refresh,
    fail,
    revisionDocs,
    startReview,
    setTab,
    dirty,
    decision,
    setProposals,
  } = s;
  const d = s.d!;
  return (
    <section className="panel">
      <div className="eyebrow">YOU HAVE THE FINAL WORD</div>
      <h2>Revision desk</h2>
      <p>
        Suggestions remain separate until you approve them. Each proposal is tied to the version it
        was written against.
      </p>
      {!proposals.length && (
        <div className="empty">
          <span>✧</span>
          <h3>A fresh pair of eyes, on your terms.</h3>
          <p>
            Connect a local MCP client to submit suggestions, or create a sample proposal to try the
            review flow.
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
  );
}
