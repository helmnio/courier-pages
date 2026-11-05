import { ReviewNotes } from '../ReviewNotes';
import type { Studio } from '../useStudio';

export function NotesTab({ s }: { s: Studio }) {
  const { p, reviewNoteId, setNoteTarget, edit, navigate } = s;
  const d = s.d!;
  return (
    <ReviewNotes
      key={p!.id}
      projectId={p!.id}
      document={d}
      initialNoteId={reviewNoteId}
      onTargetConsumed={() => setNoteTarget(undefined)}
      onChange={(notes) => edit({ ...d, notes })}
      onNavigate={navigate}
    />
  );
}
