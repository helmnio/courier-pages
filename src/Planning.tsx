import { useState } from 'react';
import { circleSteps, PlanItemSchema, planningKinds, type PlanItem } from './model';
import { useRemembered } from './workspace';
import { confirmAsync } from './dialogs';
export const planLabels: Record<PlanItem['kind'], string> = {
  outline: 'Outline',
  treatment: 'Treatment',
  beatSheet: 'Beat sheet',
  actPlan: 'Act plan',
  sequencePlan: 'Sequence plan',
  research: 'Research',
  notes: 'Notes',
  other: 'Other',
  storyCircle: 'Story circle',
};
const prompts = [
  'Where does the character begin? What feels familiar?',
  'What is missing? What do they want?',
  'What takes them into unfamiliar territory?',
  'How do they adapt, struggle and experiment?',
  'What do they reach or discover?',
  'What price do they pay? What do they lose?',
  'How do they come back to the familiar world?',
  'What is different about them now?',
];
const templates: Partial<Record<PlanItem['kind'], string>> = {
  outline: 'Beginning\n\nMiddle\n\nEnding\n',
  actPlan: 'Act I — Setup\n\nAct II — Confrontation\n\nAct III — Resolution\n',
  sequencePlan: 'Sequence 1\nGoal:\nTurning point:\n\nSequence 2\nGoal:\nTurning point:\n',
  beatSheet:
    'Opening\n\nInciting incident\n\nFirst turning point\n\nMidpoint\n\nCrisis\n\nClimax\n\nResolution\n',
};
export function Planning({
  projectId,
  items,
  onChange,
}: {
  projectId: string;
  items: PlanItem[];
  onChange: (items: PlanItem[]) => void;
}) {
  const [selected, select] = useRemembered<string>(projectId + ':plan-selected', '');
  const [step, setStep] = useRemembered<number>(projectId + ':circle-step', 0);
  const [query, setQuery] = useState('');
  const item = items.find((p) => p.id === selected) ?? items[0];
  const visible = items.filter((p) =>
    (
      p.title +
      ' ' +
      planLabels[p.kind] +
      ' ' +
      p.body +
      ' ' +
      p.subject +
      ' ' +
      Object.values(p.stages).join(' ')
    )
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  function add(kind: PlanItem['kind']) {
    const next = PlanItemSchema.parse({
      id: crypto.randomUUID(),
      title: planLabels[kind],
      kind,
      body: templates[kind] ?? '',
    });
    onChange([...items, next]);
    select(next.id);
    setQuery('');
    setStep(0);
  }
  function update(patch: Partial<PlanItem>) {
    if (item) onChange(items.map((p) => (p.id === item.id ? { ...p, ...patch } : p)));
  }
  const stage = circleSteps[step] ?? circleSteps[0];
  return (
    <section className="panel planning-panel">
      <div className="eyebrow">THE WRITING ROOM</div>
      <h2>Planning</h2>
      <p>
        Keep your outlines, story circles and working notes here. Return to them while drafting;
        every change saves with this project.
      </p>
      <div className="plan-actions" aria-label="Create a plan">
        <button onClick={() => add('outline')}>New outline</button>
        <button onClick={() => add('storyCircle')}>New story circle</button>
        <button onClick={() => add('actPlan')}>New act plan</button>
        <button onClick={() => add('notes')}>New notes</button>
        <label>
          More plans
          <select
            aria-label="More planning templates"
            value=""
            onChange={(e) => {
              if (e.target.value) add(e.target.value as PlanItem['kind']);
            }}
          >
            <option value="">Choose a type…</option>
            {['treatment', 'beatSheet', 'sequencePlan', 'research', 'other'].map((k) => (
              <option key={k} value={k}>
                {planLabels[k as PlanItem['kind']]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!items.length ? (
        <div className="empty">
          <h3>A home for the shape of your story</h3>
          <p>
            Start with an outline or explore a character’s journey in an eight-step story circle.
            Add as many plans as you need.
          </p>
        </div>
      ) : (
        <div className="planning-grid">
          <aside className="plan-list" aria-label="Saved plans">
            <input
              aria-label="Search planning"
              placeholder="Find a plan or note…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {visible.map((p) => (
              <button key={p.id} aria-pressed={item?.id === p.id} onClick={() => select(p.id)}>
                <strong>{p.title}</strong>
                <small>{planLabels[p.kind]}</small>
              </button>
            ))}
            {!visible.length && <p>No matching plans.</p>}
          </aside>
          {item && (
            <article className="plan-editor" aria-label="Selected plan">
              <div className="plan-fields">
                <label>
                  Plan title
                  <input
                    value={item.title}
                    maxLength={200}
                    onChange={(e) => update({ title: e.target.value || 'Untitled plan' })}
                  />
                </label>
                <label>
                  Plan type
                  <select
                    value={item.kind}
                    onChange={(e) => update({ kind: e.target.value as PlanItem['kind'] })}
                  >
                    {[...planningKinds, 'storyCircle'].map((k) => (
                      <option key={k} value={k}>
                        {planLabels[k as PlanItem['kind']]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {item.kind === 'storyCircle' && (
                <>
                  <label>
                    Character or story thread
                    <input
                      value={item.subject}
                      maxLength={1000}
                      placeholder="Whose journey is this?"
                      onChange={(e) => update({ subject: e.target.value })}
                    />
                  </label>
                  <div className="story-circle" aria-label="Story circle stages">
                    <div className="circle-center" aria-hidden="true">
                      THE
                      <br />
                      JOURNEY
                    </div>
                    {circleSteps.map((s, i) => (
                      <button
                        key={s}
                        aria-pressed={stage === s}
                        onClick={() => setStep(i)}
                        style={{
                          left: `${50 + 38 * Math.sin((i * Math.PI) / 4)}%`,
                          top: `${50 - 38 * Math.cos((i * Math.PI) / 4)}%`,
                        }}
                      >
                        <small>
                          {i + 1}
                          {item.stages[s].trim() ? ' · ●' : ''}
                        </small>
                        {s[0].toUpperCase() + s.slice(1)}
                      </button>
                    ))}
                  </div>
                  <label>
                    {step + 1}. {stage[0].toUpperCase() + stage.slice(1)}
                    <textarea
                      rows={6}
                      aria-label="Story circle stage notes"
                      placeholder={prompts[step]}
                      value={item.stages[stage]}
                      onChange={(e) =>
                        update({ stages: { ...item.stages, [stage]: e.target.value } })
                      }
                    />
                  </label>
                  <div className="plan-actions">
                    <button onClick={() => setStep((step + 7) % 8)}>Previous stage</button>
                    <button onClick={() => setStep((step + 1) % 8)}>Next stage</button>
                  </div>
                  <div className="circle-overview">
                    <h3>Journey at a glance</h3>
                    {circleSteps.map((s, i) => (
                      <div key={s}>
                        <strong>
                          {i + 1}. {s[0].toUpperCase() + s.slice(1)}
                        </strong>
                        <p>{item.stages[s] || 'Not planned yet'}</p>
                      </div>
                    ))}
                  </div>
                </>
              )}
              <label>
                {item.kind === 'storyCircle'
                  ? 'Additional reference notes'
                  : 'Plan & reference notes'}
                <textarea
                  className="plan-body"
                  aria-label={
                    item.kind === 'storyCircle'
                      ? 'Additional reference notes'
                      : 'Plan & reference notes'
                  }
                  rows={18}
                  value={item.body}
                  placeholder="Write your plan here. Scene headings, questions, references and loose ideas all belong."
                  onChange={(e) => update({ body: e.target.value })}
                />
              </label>
              <div className="plan-actions">
                <button
                  onClick={() => {
                    const copy = {
                      ...structuredClone(item),
                      id: crypto.randomUUID(),
                      title: (item.title + ' — copy').slice(0, 200),
                    };
                    onChange([...items, copy]);
                    select(copy.id);
                  }}
                >
                  Duplicate plan
                </button>
                <button
                  disabled={items.indexOf(item) === 0}
                  onClick={() => {
                    const list = [...items],
                      i = list.indexOf(item);
                    [list[i - 1], list[i]] = [list[i], list[i - 1]];
                    onChange(list);
                  }}
                >
                  Move plan up
                </button>
                <button
                  disabled={items.indexOf(item) === items.length - 1}
                  onClick={() => {
                    const list = [...items],
                      i = list.indexOf(item);
                    [list[i + 1], list[i]] = [list[i], list[i + 1]];
                    onChange(list);
                  }}
                >
                  Move plan down
                </button>
                <button
                  onClick={async () => {
                    if (
                      await confirmAsync(
                        'Delete “' + item.title + '”? Saved versions remain in History.',
                        {
                          confirmLabel: 'Delete plan',
                          danger: true,
                        },
                      )
                    ) {
                      const next = items.filter((p) => p.id !== item.id);
                      onChange(next);
                      select(next[0]?.id ?? '');
                    }
                  }}
                >
                  Delete plan
                </button>
              </div>
            </article>
          )}
        </div>
      )}
    </section>
  );
}
