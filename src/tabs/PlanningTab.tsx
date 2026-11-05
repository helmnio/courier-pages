import { Planning } from '../Planning';
import type { Studio } from '../useStudio';

export function PlanningTab({ s }: { s: Studio }) {
  const { p, edit } = s;
  const d = s.d!;
  return (
    <Planning
      key={p!.id}
      projectId={p!.id}
      items={d.planning ?? []}
      onChange={(planning) => edit({ ...d, planning })}
    />
  );
}
