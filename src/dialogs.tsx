import { useEffect, useRef, useState } from 'react';
/**
 * In-app dialogs. Native prompt()/confirm() are blocked or silently ignored in embedded
 * browser panes, so every question the app asks goes through these promise-based dialogs.
 */
export type NewScreenplay = {
  title: string;
  format: 'feature' | 'short' | 'television';
  pageSize: 'LETTER' | 'A4';
};
type Request =
  | {
      kind: 'confirm';
      message: string;
      confirmLabel: string;
      danger: boolean;
      resolve: (ok: boolean) => void;
    }
  | { kind: 'new'; resolve: (v: NewScreenplay | null) => void };
let show: ((r: Request | null) => void) | null = null;
function ask<T>(make: (resolve: (v: T) => void) => Request, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    if (!show) return resolve(fallback);
    show(make(resolve));
  });
}
export const confirmAsync = (
  message: string,
  options: { confirmLabel?: string; danger?: boolean } = {},
) =>
  ask<boolean>(
    (resolve) => ({
      kind: 'confirm',
      message,
      confirmLabel: options.confirmLabel ?? 'Confirm',
      danger: options.danger ?? false,
      resolve,
    }),
    false,
  );
export const newScreenplayDialog = () =>
  ask<NewScreenplay | null>((resolve) => ({ kind: 'new', resolve }), null);
export function DialogHost() {
  const [request, setRequest] = useState<Request | null>(null);
  const [title, setTitle] = useState('');
  const [format, setFormat] = useState<NewScreenplay['format']>('feature');
  const [pageSize, setPageSize] = useState<NewScreenplay['pageSize']>('LETTER');
  const first = useRef<HTMLElement | null>(null);
  useEffect(() => {
    show = (r) => {
      setTitle('');
      setRequest(r);
    };
    return () => {
      show = null;
    };
  }, []);
  const finish = (value: boolean | NewScreenplay | null) => {
    if (!request) return;
    (request.resolve as (v: typeof value) => void)(value);
    setRequest(null);
  };
  useEffect(() => {
    if (!request) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish(request.kind === 'confirm' ? false : null);
    };
    document.addEventListener('keydown', key);
    first.current?.focus();
    return () => document.removeEventListener('keydown', key);
  }, [request]);
  if (!request) return null;
  const cancel = () => finish(request.kind === 'confirm' ? false : null);
  return (
    <div className="dialog-scrim" onPointerDown={(e) => e.target === e.currentTarget && cancel()}>
      {request.kind === 'confirm' ? (
        <div className="dialog" role="alertdialog" aria-modal="true" aria-label="Confirm">
          <p>{request.message}</p>
          <div className="dialog-actions">
            <button
              ref={(el) => {
                first.current = el;
              }}
              onClick={cancel}
            >
              Cancel
            </button>
            <button className={request.danger ? 'danger' : 'primary'} onClick={() => finish(true)}>
              {request.confirmLabel}
            </button>
          </div>
        </div>
      ) : (
        <form
          className="dialog"
          role="dialog"
          aria-modal="true"
          aria-label="New screenplay"
          onSubmit={(e) => {
            e.preventDefault();
            if (title.trim()) finish({ title: title.trim(), format, pageSize });
          }}
        >
          <h2>New screenplay</h2>
          <label>
            Title
            <input
              ref={(el) => {
                first.current = el;
              }}
              value={title}
              maxLength={200}
              placeholder="Untitled screenplay"
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <div className="dialog-grid">
            <label>
              Format
              <select value={format} onChange={(e) => setFormat(e.target.value as any)}>
                <option value="feature">Feature</option>
                <option value="short">Short</option>
                <option value="television">Television</option>
              </select>
            </label>
            <label>
              Page size
              <select value={pageSize} onChange={(e) => setPageSize(e.target.value as any)}>
                <option value="LETTER">US Letter</option>
                <option value="A4">A4</option>
              </select>
            </label>
          </div>
          <div className="dialog-actions">
            <button type="button" onClick={cancel}>
              Cancel
            </button>
            <button type="submit" className="primary" disabled={!title.trim()}>
              Create
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
