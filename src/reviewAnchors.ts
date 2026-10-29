import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { Mapping } from '@tiptap/pm/transform';
import type { ReviewNote } from './model';
/** Map saved text offsets through the editor transaction, including paragraph splits. */
export function mapReviewAnchors(
  notes: ReviewNote[],
  before: ProseMirrorNode,
  after: ProseMirrorNode,
  mapping: Mapping,
): ReviewNote[] {
  const starts = new Map<string, number>();
  before.forEach((node, pos) => starts.set(node.attrs.id, pos));
  return notes.map((note) => {
    const start = note.blockId ? starts.get(note.blockId) : undefined;
    if (start === undefined || note.anchorFrom === undefined) return note;
    const oldNode = before.nodeAt(start);
    if (!oldNode) return note;
    const base = start + 1;
    const from = mapping.mapResult(base + Math.min(note.anchorFrom, oldNode.content.size), 1);
    const to = mapping.mapResult(
      base + Math.min(note.anchorTo ?? note.anchorFrom, oldNode.content.size),
      -1,
    );
    const pin = mapping.mapResult(
      base + Math.min(note.pinOffset ?? note.anchorFrom, oldNode.content.size),
      1,
    );
    // A removed paragraph remains an orphaned reference, rather than moving onto unrelated text.
    let stillExists = false;
    after.forEach((node) => {
      if (node.attrs.id === note.blockId) stillExists = true;
    });
    if (!stillExists && pin.deletedAcross) return note;
    const resolve = (pos: number) =>
      after.resolve(Math.max(1, Math.min(pos, after.content.size - 1)));
    const $pin = resolve(pin.pos),
      $from = resolve(from.pos),
      $to = resolve(to.pos);
    if (!$pin.parent.attrs.id) return note;
    let sceneId: string | undefined;
    after.forEach((node, pos) => {
      if (pos <= $pin.pos && node.attrs.kind === 'scene') sceneId = node.attrs.id;
    });
    const anchorFrom = $from.parent === $pin.parent ? $from.parentOffset : $pin.parentOffset;
    const anchorTo =
      $to.parent === $pin.parent ? Math.max(anchorFrom, $to.parentOffset) : anchorFrom;
    return {
      ...note,
      blockId: $pin.parent.attrs.id,
      sceneId,
      anchorFrom,
      anchorTo,
      pinOffset: $pin.parentOffset,
    };
  });
}
