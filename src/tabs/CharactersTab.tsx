import { confirmAsync } from '../dialogs';
import { RememberedDetails } from '../workspace';
import { CharacterSchema } from '../model';
import type { Studio } from '../useStudio';

export function CharactersTab({ s }: { s: Studio }) {
  const { edit, p } = s;
  const d = s.d!;
  return (
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
          No characters yet. Profiles hold age, motivation, voice and arc, and chat can read them
          when it suggests dialogue or revisions.
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
            ['description', 'background', 'motivation', 'relationships', 'voice', 'arc'] as const
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
  );
}
