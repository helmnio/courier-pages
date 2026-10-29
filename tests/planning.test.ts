import { it, expect } from 'vitest';
import { Store, Conflict } from '../server/store';
import { blank, DocumentSchema, PlanItemSchema } from '../src/model';
import { callTool } from '../server/tools';
it('loads legacy documents with empty planning and rejects duplicate planning identities', () => {
  const legacy: any = blank();
  delete legacy.planning;
  expect(DocumentSchema.parse(legacy).planning).toEqual([]);
  const item = PlanItemSchema.parse({ id: 'one', title: 'Outline', kind: 'outline' });
  expect(() => DocumentSchema.parse({ ...legacy, planning: [item, item] })).toThrow(
    'Duplicate planning IDs',
  );
});
it('preserves outlines and all eight circle stages through native backup with revision history', () => {
  const s = new Store(':memory:'),
    clean = new Store(':memory:');
  const d = blank();
  d.planning = [
    PlanItemSchema.parse({
      id: 'outline',
      title: 'Main outline',
      kind: 'outline',
      body: 'The ship returns.',
    }),
    PlanItemSchema.parse({
      id: 'circle',
      title: 'Mara’s journey',
      kind: 'storyCircle',
      subject: 'Mara',
      stages: {
        you: 'keeper',
        need: 'answers',
        go: 'sea',
        search: 'wreck',
        find: 'letter',
        take: 'boat lost',
        return: 'shore',
        change: 'lets go',
      },
    }),
  ];
  const p = s.create(d);
  s.save(p.id, 1, { ...d, title: 'Draft two' });
  const restored = clean.restore(JSON.parse(JSON.stringify(s.backup(p.id))));
  expect(restored.document.planning).toEqual(d.planning);
  expect(clean.history(restored.id)).toHaveLength(2);
  s.db.close();
  clean.db.close();
});
it('scopes planning reads and requires human approval, preserving stale-write protection', () => {
  const s = new Store(':memory:');
  const d = blank();
  d.planning = [
    PlanItemSchema.parse({ id: 'one', title: 'Outline', kind: 'outline', body: 'Private notes' }),
    PlanItemSchema.parse({
      id: 'two',
      title: 'Research',
      kind: 'research',
      body: 'Other private notes',
    }),
  ];
  const p = s.create(d);
  const list: any = callTool(s, 'screenplay_get_planning', { projectId: p.id });
  expect(JSON.stringify(list)).not.toContain('Private notes');
  const selected: any = callTool(s, 'screenplay_get_planning', { projectId: p.id, planId: 'one' });
  expect(selected.data.body).toBe('Private notes');
  expect(JSON.stringify(selected)).not.toContain('Other private notes');
  expect(() =>
    callTool(s, 'screenplay_get_planning', { projectId: p.id, planId: 'missing' }),
  ).toThrow('Plan not found');
  const result: any = callTool(s, 'screenplay_propose_planning_update', {
    projectId: p.id,
    baseVersion: 1,
    summary: 'Clarify the outline',
    plan: { ...d.planning[0], body: 'Suggested opening' },
  });
  expect(s.get(p.id).document).toEqual(d);
  const accepted = s.decide(result.proposalId, true);
  expect(accepted.document.planning[0].body).toBe('Suggested opening');
  expect(accepted.document.planning[1]).toEqual(d.planning[1]);
  expect(accepted.document.blocks).toEqual(d.blocks);
  expect(() =>
    callTool(s, 'screenplay_propose_planning_update', {
      projectId: p.id,
      baseVersion: 1,
      summary: 'Stale',
      plan: d.planning[0],
    }),
  ).toThrow(Conflict);
  s.db.close();
});
