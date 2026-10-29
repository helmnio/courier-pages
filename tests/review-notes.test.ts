import { it, expect } from 'vitest';
import { blank, DocumentSchema, duplicateScene } from '../src/model';
import { Store, Conflict } from '../server/store';
import { callTool } from '../server/tools';
it('keeps legacy notes readable and preserves full review threads in backups and history', () => {
  const store = new Store(':memory:'),
    clean = new Store(':memory:');
  const d = blank('Review roundtrip');
  d.notes = [{ id: 'legacy', category: 'critique', text: 'Keep this old note', status: 'open' }];
  const p = store.create(d);
  d.notes.push({
    id: 'review',
    sceneId: d.blocks[0].id,
    blockId: d.blocks[1].id,
    quote: 'Original line',
    category: 'continuity',
    text: 'Check the key',
    status: 'resolved',
    priority: 'high',
    author: 'Reader',
    createdAt: '2026-10-28T12:00:00Z',
    updatedAt: '2026-10-28T13:00:00Z',
    replies: [
      {
        id: 'reply',
        text: 'Addressed in the next draft',
        author: 'Writer',
        createdAt: '2026-10-28T13:00:00Z',
      },
    ],
  });
  store.save(p.id, 1, d);
  const restored = clean.restore(JSON.parse(JSON.stringify(store.backup(p.id))));
  expect(restored.document.notes).toEqual(d.notes);
  expect(clean.history(restored.id).map((r) => r.document.notes)).toEqual(
    store.history(p.id).map((r) => r.document.notes),
  );
  expect(() => DocumentSchema.parse({ ...d, notes: [d.notes[0], d.notes[0]] })).toThrow(
    'Duplicate review note IDs',
  );
  const copy = duplicateScene(d, d.blocks[0].id);
  const copied = copy.notes.find((n) => n.id !== 'review' && n.category === 'continuity')!;
  expect(copied.sceneId).not.toBe(d.blocks[0].id);
  expect(copied.blockId).not.toBe(d.blocks[1].id);
  expect(copy.blocks.some((b) => b.id === copied.blockId)).toBe(true);
  store.db.close();
  clean.db.close();
});
it('MCP reads and updates review notes through pending proposals with version protection', () => {
  const store = new Store(':memory:');
  const p = store.create(blank());
  const result: any = callTool(store, 'screenplay_propose_review_note', {
    projectId: p.id,
    baseVersion: 1,
    summary: 'Review opening',
    note: {
      id: 'review',
      category: 'critique',
      sceneId: p.document.blocks[0].id,
      text: 'Clarify the stakes',
      status: 'open',
      priority: 'high',
    },
  });
  expect(result.status).toBe('pending');
  expect(store.get(p.id).document.notes).toEqual([]);
  expect(store.get(p.id).version).toBe(1);
  store.decide(result.proposalId, true);
  const read: any = callTool(store, 'screenplay_get_review_notes', {
    projectId: p.id,
    status: 'open',
  });
  expect(read.data).toHaveLength(1);
  expect(read.version).toBe(2);
  const update: any = callTool(store, 'screenplay_propose_review_note', {
    projectId: p.id,
    baseVersion: 2,
    summary: 'Mark addressed',
    note: { ...read.data[0], status: 'resolved' },
  });
  expect(store.get(p.id).document.notes[0].status).toBe('open');
  store.save(p.id, 2, { ...store.get(p.id).document, author: 'Human' });
  expect(() => store.decide(update.proposalId, true)).toThrow(Conflict);
  expect(() =>
    callTool(store, 'screenplay_propose_review_note', {
      projectId: p.id,
      baseVersion: 3,
      summary: 'Bad reference',
      note: { id: 'bad', sceneId: 'missing', category: 'note', text: 'No', status: 'open' },
    }),
  ).toThrow('Scene not found');
  store.db.close();
});
