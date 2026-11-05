import { type Project, type Script } from './model';

export async function api(url: string, body?: unknown, method = 'POST') {
  const r = await fetch('/api' + url, {
    method: body ? method : 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw Error(data.error);
  return data;
}
export function cached<T = any>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null');
  } catch {
    return null;
  }
}
export const tabId = (() => {
  try {
    let id = sessionStorage.getItem('studio-tab');
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem('studio-tab', id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
})();
export const key = (id: string) => `studio-recovery:${id}:${tabId}`;
export function recoveryFor(id: string): (Project & { recoveryKey?: string }) | null {
  try {
    const own = cached<Project>(key(id));
    if (own) return { ...own, recoveryKey: key(id) };
    const other = Object.keys(localStorage)
      .filter((k) => k.startsWith('studio-recovery:' + id + ':'))
      .map((k) => ({ key: k, value: cached<Project>(k) }))
      .filter((x) => x.value)
      .at(-1);
    return other?.value ? { ...other.value, recoveryKey: other.key } : null;
  } catch {
    return null;
  }
}
export const labels: Record<string, string> = {
  scene: 'Scene heading',
  action: 'Action',
  character: 'Character',
  dialogue: 'Dialogue',
  parenthetical: 'Parenthetical',
  transition: 'Transition',
  shot: 'Shot',
  general: 'General text',
  pageBreak: 'Page break',
  note: 'Private note',
  section: 'Act / sequence',
};
export function readable(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(readable).join('\n\n');
  if (typeof value === 'object')
    return Object.entries(value)
      .filter(([k, v]) => k !== 'id' && k !== 'sceneId' && v !== '' && v !== undefined)
      .map(([k, v]) => k.replace(/([A-Z])/g, ' $1') + ': ' + readable(v))
      .join('\n');
  return String(value);
}
export function diff(a: Script, b: Script) {
  const rows: { label: string; before: string; after: string }[] = [];
  for (const k of [
    'title',
    'author',
    'metadata',
    'bible',
    'planning',
    'characters',
    'briefs',
    'sceneStatus',
    'notes',
  ] as const) {
    const x = typeof a[k] === 'string' ? (a[k] as string) : readable(a[k]),
      y = typeof b[k] === 'string' ? (b[k] as string) : readable(b[k]);
    if (x !== y) rows.push({ label: k, before: x, after: y });
  }
  const ids = [...new Set([...a.blocks, ...b.blocks].map((x) => x.id))];
  for (const id of ids) {
    const x = a.blocks.find((v) => v.id === id),
      y = b.blocks.find((v) => v.id === id);
    if (JSON.stringify(x) !== JSON.stringify(y))
      rows.push({
        label: labels[y?.type ?? x!.type],
        before: x ? `${x.type}: ${x.text}` : '',
        after: y ? `${y.type}: ${y.text}` : '',
      });
  }
  if (a.blocks.map((x) => x.id).join() !== b.blocks.map((x) => x.id).join())
    rows.push({
      label: 'Screenplay order',
      before: a.blocks
        .filter((x) => x.type === 'scene')
        .map((x) => x.text)
        .join('\n'),
      after: b.blocks
        .filter((x) => x.type === 'scene')
        .map((x) => x.text)
        .join('\n'),
    });
  return rows;
}
