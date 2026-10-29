import { it, expect } from 'vitest';
import { Schema } from '@tiptap/pm/model';
import { Transform } from '@tiptap/pm/transform';
import { mapReviewAnchors } from '../src/reviewAnchors';
import type { ReviewNote } from '../src/model';
const schema = new Schema({
  nodes: {
    doc: { content: 'paragraph+' },
    paragraph: { content: 'text*', attrs: { id: { default: '' }, kind: { default: 'action' } } },
    text: {},
  },
});
const paragraph = (id: string, text: string) =>
  schema.node('paragraph', { id, kind: 'action' }, schema.text(text));
it('tracks exact repeated-word offsets through insertions and undo mappings', () => {
  const doc = schema.node('doc', null, [paragraph('p', 'key then key')]);
  const notes: ReviewNote[] = [
    {
      id: 'n',
      blockId: 'p',
      text: 'Second key',
      category: 'note',
      status: 'open',
      quote: 'key',
      anchorFrom: 9,
      anchorTo: 12,
      pinOffset: 10,
    },
  ];
  const tr = new Transform(doc).insert(1, schema.text('Brass '));
  const mapped = mapReviewAnchors(notes, doc, tr.doc, tr.mapping);
  expect(mapped[0].anchorFrom).toBe(15);
  expect(mapped[0].anchorTo).toBe(18);
  expect(mapped[0].pinOffset).toBe(16);
  expect(mapReviewAnchors(mapped, tr.doc, doc, tr.mapping.invert())[0].pinOffset).toBe(10);
});
it('follows the pinned word into a split paragraph and leaves deleted paragraphs orphaned', () => {
  const doc = schema.node('doc', null, [
    paragraph('p', 'key then key'),
    paragraph('other', 'unrelated'),
  ]);
  const note: ReviewNote = {
    id: 'n',
    blockId: 'p',
    text: 'Second key',
    category: 'note',
    status: 'open',
    anchorFrom: 9,
    anchorTo: 12,
    pinOffset: 10,
  };
  const tr = new Transform(doc).split(6, 1, [
    { type: schema.nodes.paragraph, attrs: { id: 'split', kind: 'action' } },
  ]);
  const mapped = mapReviewAnchors([note], doc, tr.doc, tr.mapping)[0];
  expect(mapped.blockId).toBe('split');
  expect(mapped.anchorFrom).toBe(4);
  expect(mapped.pinOffset).toBe(5);
  const remove = new Transform(doc).delete(0, doc.child(0).nodeSize);
  expect(mapReviewAnchors([note], doc, remove.doc, remove.mapping)[0].blockId).toBe('p');
});
