import type { Block, PlanItem, ReviewNote, Script } from './model';
/**
 * Turns "the chat's proposed document" into individual, reviewable changes, and applies only the
 * ones a person accepts. Changes are measured against the version the proposal was written
 * against, so edits made since then only block the elements they actually touch.
 */
export type ReviewTab =
  'script' | 'bible' | 'scenes' | 'characters' | 'planning' | 'notes' | 'projects';
export interface Unit {
  id: string;
  tab: ReviewTab;
  label: string;
  kind: 'changed' | 'added' | 'removed';
  before: string;
  after: string;
  /** The person edited this element since the proposal was written. */
  conflict: boolean;
  blockId?: string;
  blockType?: string;
  /** For added blocks: the block this one follows in the proposed script. */
  anchorAfter?: string | null;
  apply: (target: Script, proposed: Script) => void;
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const sceneHeading = (d: Script, id: string) =>
  d.blocks.find((b) => b.id === id)?.text.trim() || 'Scene';
function field(
  units: Unit[],
  id: string,
  tab: ReviewTab,
  label: string,
  read: (d: Script) => string,
  write: (target: Script, value: string) => void,
  docs: { base: Script; proposed: Script; current: Script },
) {
  const before = read(docs.base);
  const after = read(docs.proposed);
  const now = read(docs.current);
  if (before === after || now === after) return;
  units.push({
    id,
    tab,
    label,
    kind: before ? (after ? 'changed' : 'removed') : 'added',
    before,
    after,
    conflict: now !== before,
    apply: (target, proposed) => write(target, read(proposed)),
  });
}
/** A whole record kept in a list by id: planning items, review notes, characters. */
function listItems<T extends { id: string }>(
  units: Unit[],
  tab: ReviewTab,
  prefix: string,
  label: (item: T) => string,
  text: (item: T) => string,
  get: (d: Script) => T[],
  set: (d: Script, items: T[]) => void,
  docs: { base: Script; proposed: Script; current: Script },
) {
  const ids = [...new Set([...get(docs.proposed), ...get(docs.base)].map((x) => x.id))];
  for (const id of ids) {
    const base = get(docs.base).find((x) => x.id === id);
    const proposed = get(docs.proposed).find((x) => x.id === id);
    const current = get(docs.current).find((x) => x.id === id);
    if (same(base, proposed) || same(current, proposed)) continue;
    const item = (proposed ?? base)!;
    units.push({
      id: `${prefix}:${id}`,
      tab,
      label: label(item),
      kind: !base ? 'added' : !proposed ? 'removed' : 'changed',
      before: base ? text(base) : '',
      after: proposed ? text(proposed) : '',
      conflict: !same(current, base),
      apply: (target, source) => {
        const items = get(target).filter((x) => x.id !== id);
        const next = get(source).find((x) => x.id === id);
        if (!next) return set(target, items);
        const index = get(target).findIndex((x) => x.id === id);
        items.splice(index < 0 ? items.length : index, 0, next);
        set(target, items);
      },
    });
  }
}
export function computeUnits(base: Script, proposed: Script, current: Script): Unit[] {
  const docs = { base, proposed, current };
  const units: Unit[] = [];
  // Screenplay elements, in proposed order, with removals alongside.
  const ids = [...new Set([...proposed.blocks, ...base.blocks].map((b) => b.id))];
  const find = (d: Script, id: string) => d.blocks.find((b) => b.id === id);
  for (const id of ids) {
    const before = find(base, id);
    const after = find(proposed, id);
    const now = find(current, id);
    if (same(before, after) || same(now, after)) continue;
    if (!after && !now) continue;
    const at = proposed.blocks.findIndex((b) => b.id === id);
    units.push({
      id: 'block:' + id,
      tab: 'script',
      label: '',
      kind: !before ? 'added' : !after ? 'removed' : 'changed',
      before: before?.text ?? '',
      after: after?.text ?? '',
      conflict: before ? !same(now, before) : false,
      blockId: id,
      blockType: (after ?? before)!.type,
      anchorAfter: !before && at > 0 ? proposed.blocks[at - 1].id : null,
      apply: (target, source) => {
        const next = find(source, id);
        if (!next) {
          target.blocks = target.blocks.filter((b) => b.id !== id);
          return;
        }
        const index = target.blocks.findIndex((b) => b.id === id);
        if (index >= 0) {
          target.blocks[index] = next;
          return;
        }
        const position = source.blocks.findIndex((b) => b.id === id);
        for (let i = position - 1; i >= 0; i--) {
          const prior = target.blocks.findIndex((b) => b.id === source.blocks[i].id);
          if (prior >= 0) {
            target.blocks.splice(prior + 1, 0, next);
            return;
          }
        }
        target.blocks.unshift(next);
      },
    });
  }
  field(
    units,
    'title',
    'bible',
    'Title',
    (d) => d.title,
    (t, v) => void (t.title = v),
    docs,
  );
  field(
    units,
    'author',
    'bible',
    'Written by',
    (d) => d.author,
    (t, v) => void (t.author = v),
    docs,
  );
  for (const key of ['genre', 'description'] as const)
    field(
      units,
      'meta:' + key,
      'projects',
      'Project ' + key,
      (d) => d.metadata[key],
      (t, v) => void (t.metadata[key] = v),
      docs,
    );
  for (const key of [
    'logline',
    'premise',
    'story',
    'characters',
    'world',
    'continuity',
    'constraints',
    'research',
  ] as const)
    field(
      units,
      'bible:' + key,
      'bible',
      'Bible · ' + key,
      (d) => d.bible[key],
      (t, v) => void (t.bible[key] = v),
      docs,
    );
  const sceneIds = [
    ...new Set([
      ...Object.keys(proposed.bible.scenes),
      ...Object.keys(base.bible.scenes),
      ...Object.keys(proposed.briefs),
      ...Object.keys(base.briefs),
      ...Object.keys(proposed.sceneStatus),
    ]),
  ];
  for (const sid of sceneIds) {
    const name = sceneHeading(proposed, sid) || sceneHeading(base, sid);
    field(
      units,
      'synopsis:' + sid,
      'scenes',
      `Synopsis · ${name}`,
      (d) => d.bible.scenes[sid] ?? '',
      (t, v) => void (t.bible.scenes[sid] = v),
      docs,
    );
    field(
      units,
      'status:' + sid,
      'scenes',
      `Status · ${name}`,
      (d) => d.sceneStatus[sid] ?? '',
      (t, v) => void (v ? (t.sceneStatus[sid] = v as never) : delete t.sceneStatus[sid]),
      docs,
    );
    const keys = new Set([
      ...Object.keys(proposed.briefs[sid] ?? {}),
      ...Object.keys(base.briefs[sid] ?? {}),
    ]);
    for (const key of keys)
      field(
        units,
        `brief:${sid}:${key}`,
        'scenes',
        `Brief · ${name} · ${key.replace(/([A-Z])/g, ' $1').toLowerCase()}`,
        (d) => (d.briefs[sid] as Record<string, string> | undefined)?.[key] ?? '',
        (t, v) => {
          const brief = (t.briefs[sid] ??= {} as never) as Record<string, string>;
          brief[key] = v;
        },
        docs,
      );
  }
  const characterIds = [...new Set([...proposed.characters, ...base.characters].map((c) => c.id))];
  for (const cid of characterIds) {
    const before = base.characters.find((c) => c.id === cid);
    const after = proposed.characters.find((c) => c.id === cid);
    const name = (after ?? before)!.name;
    if (!before || !after) {
      listItems(
        units,
        'characters',
        'character',
        () => `Character · ${name}`,
        (c: Script['characters'][number]) =>
          Object.entries(c)
            .filter(([k, v]) => k !== 'id' && v)
            .map(([k, v]) => `${k}: ${v}`)
            .join('\n'),
        (d) => d.characters.filter((c) => c.id === cid),
        (d, items) => void (d.characters = [...d.characters.filter((c) => c.id !== cid), ...items]),
        docs,
      );
      continue;
    }
    for (const key of Object.keys(after).filter((k) => k !== 'id') as (keyof typeof after)[])
      field(
        units,
        `character:${cid}:${key}`,
        'characters',
        `${name} · ${key}`,
        (d) => String(d.characters.find((c) => c.id === cid)?.[key] ?? ''),
        (t, v) => {
          const target = t.characters.find((c) => c.id === cid);
          if (target) (target as Record<string, string>)[key] = v;
        },
        docs,
      );
  }
  listItems<PlanItem>(
    units,
    'planning',
    'plan',
    (p) => `Plan · ${p.title || p.kind}`,
    (p) =>
      [p.title, p.body, p.subject, ...Object.values(p.stages ?? {})].filter(Boolean).join('\n'),
    (d) => d.planning ?? [],
    (d, items) => void (d.planning = items),
    docs,
  );
  listItems<ReviewNote>(
    units,
    'notes',
    'note',
    () => 'Review note',
    (n) => n.text,
    (d) => d.notes,
    (d, items) => void (d.notes = items),
    docs,
  );
  return units;
}
/** The current document plus only the accepted changes. */
export function applyUnits(
  current: Script,
  proposed: Script,
  units: Unit[],
  accepted: Set<string>,
): Script {
  const next = structuredClone(current);
  for (const unit of units) if (accepted.has(unit.id)) unit.apply(next, proposed);
  return next;
}
export const unitTabs: ReviewTab[] = [
  'script',
  'bible',
  'scenes',
  'characters',
  'planning',
  'notes',
  'projects',
];
export function countByTab(units: Unit[]): Partial<Record<ReviewTab, number>> {
  const counts: Partial<Record<ReviewTab, number>> = {};
  for (const u of units) counts[u.tab] = (counts[u.tab] ?? 0) + 1;
  return counts;
}
export type { Block };

/** A "revise" request becomes an ordinary open note on the passage, so the next chat pass picks it up. */
export function reviseNote(unit: Unit, request: string, doc: Script): ReviewNote {
  const anchor = unit.kind === 'added' ? (unit.anchorAfter ?? undefined) : unit.blockId;
  const index = anchor ? doc.blocks.findIndex((b) => b.id === anchor) : -1;
  const scene =
    index >= 0
      ? doc.blocks
          .slice(0, index + 1)
          .reverse()
          .find((b) => b.type === 'scene')?.id
      : undefined;
  const what = unit.label || unit.blockType || 'change';
  const proposed =
    unit.kind === 'removed'
      ? `removing "${unit.before.slice(0, 400)}"`
      : `"${unit.after.slice(0, 600)}"`;
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    sceneId: scene,
    blockId: index >= 0 ? anchor : undefined,
    category: 'note',
    text: `Revise this change: ${request}\n\nChat proposed (${what}): ${proposed}`,
    status: 'open',
    priority: 'normal',
    author: 'Revision request',
    createdAt: now,
    updatedAt: now,
    replies: [],
  };
}
