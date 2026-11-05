import { confirmAsync } from '../dialogs';
import { RememberedDetails } from '../workspace';
import { moveScene, duplicateScene, sceneBlocks, BriefSchema } from '../model';
import type { Studio } from '../useStudio';

export function ScenesTab({ s }: { s: Studio }) {
  const { edit, scenes, p, status, navigate, block } = s;
  const d = s.d!;
  return (
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
                <input value={s.text} onChange={(e) => block(s.id, { text: e.target.value })} />
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
  );
}
