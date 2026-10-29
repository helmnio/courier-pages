import { useState, type ReactNode } from 'react';
export function recall<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem('studio-view:' + key) ?? 'null') ?? fallback;
  } catch {
    return fallback;
  }
}
export function remember(key: string, value: unknown) {
  try {
    localStorage.setItem('studio-view:' + key, JSON.stringify(value));
  } catch {
    /* Optional preferences never block writing. */
  }
}
export function useRemembered<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => recall(key, fallback));
  const update = (next: T | ((previous: T) => T)) =>
    setValue((previous) => {
      const value = typeof next === 'function' ? (next as (previous: T) => T)(previous) : next;
      remember(key, value);
      return value;
    });
  return [value, update] as const;
}
export function RememberedDetails({
  storageKey,
  children,
  defaultOpen = false,
  className,
}: {
  storageKey: string;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useRemembered(storageKey, defaultOpen);
  return (
    <details
      className={className}
      open={open}
      onClick={(e) => {
        const summary = (e.target as Element).closest('summary');
        if (summary?.parentElement === e.currentTarget) {
          e.preventDefault();
          setOpen(!open);
        }
      }}
      onToggle={(e) => {
        if (e.target === e.currentTarget) setOpen(e.currentTarget.open);
      }}
    >
      {children}
    </details>
  );
}
