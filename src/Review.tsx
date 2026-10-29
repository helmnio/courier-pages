import type { ReactNode } from 'react';
export type DiffRow = { label: string; before: string; after: string };
type Segment = { kind: 'same' | 'del' | 'ins'; text: string };
/** Word-level diff so a reviewer sees exactly what the chat changed inside a paragraph. */
export function wordDiff(a: string, b: string): Segment[] | null {
  const x = a.split(/(\s+)/).filter(Boolean);
  const y = b.split(/(\s+)/).filter(Boolean);
  if (x.length * y.length > 250000) return null;
  const n = x.length;
  const m = y.length;
  const table = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      table[i][j] =
        x[i] === y[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
  const out: Segment[] = [];
  const push = (kind: Segment['kind'], text: string) => {
    const last = out[out.length - 1];
    if (last && last.kind === kind) last.text += text;
    else out.push({ kind, text });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (x[i] === y[j]) {
      push('same', x[i]);
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) push('del', x[i++]);
    else push('ins', y[j++]);
  }
  while (i < n) push('del', x[i++]);
  while (j < m) push('ins', y[j++]);
  return out;
}
export function ChangeRows({ rows, empty }: { rows: DiffRow[]; empty?: ReactNode }) {
  if (!rows.length) return <p className="no-changes">{empty ?? 'No differences.'}</p>;
  return (
    <div className="change-list">
      {rows.map((original, i) => {
        let row = original;
        const prefix = /^[a-zA-Z]+: /;
        const lead = row.before.match(prefix)?.[0];
        const strip = lead && row.after.startsWith(lead);
        if (strip)
          row = {
            ...row,
            before: row.before.slice(lead.length),
            after: row.after.slice(lead.length),
          };
        const segments =
          row.before && row.after && row.before !== row.after
            ? wordDiff(row.before, row.after)
            : null;
        return (
          <div className="change" key={i}>
            <strong>{row.label}</strong>
            {segments ? (
              <p className="inline-diff">
                {segments.map((s, k) =>
                  s.kind === 'same' ? (
                    <span key={k}>{s.text}</span>
                  ) : s.kind === 'del' ? (
                    <del key={k}>{s.text}</del>
                  ) : (
                    <ins key={k}>{s.text}</ins>
                  ),
                )}
              </p>
            ) : (
              <>
                {row.before && <pre className="before">− {row.before}</pre>}
                {row.after ? (
                  <pre className="after">+ {row.after}</pre>
                ) : (
                  <pre className="before">(removed)</pre>
                )}
                {!row.before && <span className="added-tag">new</span>}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
