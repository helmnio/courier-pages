import { RememberedDetails } from '../workspace';
import type { Studio } from '../useStudio';

export function BibleTab({ s }: { s: Studio }) {
  const { edit, open, p, scenes } = s;
  const d = s.d!;
  return (
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
          ['world', 'World & rules', ['world', 'continuity', 'constraints', 'research'], false],
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
  );
}
