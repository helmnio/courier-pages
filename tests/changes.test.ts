import { describe, expect, it } from 'vitest';
import { blank } from '../src/model.js';
import { applyUnits, computeUnits } from '../src/changes.js';
function script() {
  const d = blank('Test');
  d.blocks = [
    { id: 's1', type: 'scene', text: 'INT. KITCHEN - DAY' },
    { id: 'a1', type: 'action', text: 'A kettle boils.' },
    { id: 'a2', type: 'action', text: 'Mara waits.' },
  ];
  return d;
}
describe('reviewable changes', () => {
  it('lists each changed, added and removed element separately', () => {
    const base = script();
    const proposed = structuredClone(base);
    proposed.blocks[1].text = 'A kettle screams.';
    proposed.blocks.splice(2, 0, { id: 'n1', type: 'action', text: 'She flinches.' });
    proposed.blocks = proposed.blocks.filter((b) => b.id !== 'a2');
    proposed.bible.logline = 'A new logline.';
    const units = computeUnits(base, proposed, base);
    expect(units.map((u) => [u.id, u.kind])).toEqual([
      ['block:a1', 'changed'],
      ['block:n1', 'added'],
      ['block:a2', 'removed'],
      ['bible:logline', 'added'],
    ]);
    expect(units.every((u) => !u.conflict)).toBe(true);
  });
  it('applies only the accepted changes, in the right place', () => {
    const base = script();
    const proposed = structuredClone(base);
    proposed.blocks[1].text = 'A kettle screams.';
    proposed.blocks.splice(2, 0, { id: 'n1', type: 'action', text: 'She flinches.' });
    const units = computeUnits(base, proposed, base);
    const onlyAdded = applyUnits(base, proposed, units, new Set(['block:n1']));
    expect(onlyAdded.blocks.map((b) => b.id)).toEqual(['s1', 'a1', 'n1', 'a2']);
    expect(onlyAdded.blocks[1].text).toBe('A kettle boils.');
    const all = applyUnits(base, proposed, units, new Set(units.map((u) => u.id)));
    expect(all.blocks.map((b) => b.text)).toEqual([
      'INT. KITCHEN - DAY',
      'A kettle screams.',
      'She flinches.',
      'Mara waits.',
    ]);
    expect(base.blocks[1].text).toBe('A kettle boils.');
  });
  it('flags only the elements the person edited since, and hides ones already applied', () => {
    const base = script();
    const proposed = structuredClone(base);
    proposed.blocks[1].text = 'A kettle screams.';
    proposed.blocks[2].text = 'Mara waits, still.';
    const current = structuredClone(base);
    current.blocks[1].text = 'The kettle whistles.';
    current.blocks[2].text = 'Mara waits, still.';
    const units = computeUnits(base, proposed, current);
    expect(units.map((u) => [u.id, u.conflict])).toEqual([['block:a1', true]]);
  });
});
describe('revise requests', () => {
  it('become an open note on the passage, carrying what chat proposed', async () => {
    const { reviseNote } = await import('../src/changes.js');
    const base = script();
    const proposed = structuredClone(base);
    proposed.blocks[1].text = 'A kettle screams.';
    proposed.blocks.splice(2, 0, { id: 'n1', type: 'action', text: 'She flinches.' });
    const units = computeUnits(base, proposed, base);
    const changed = reviseNote(
      units.find((u) => u.id === 'block:a1')!,
      'Keep it quieter',
      base,
    );
    expect(changed).toMatchObject({
      blockId: 'a1',
      sceneId: 's1',
      status: 'open',
      author: 'Revision request',
    });
    expect(changed.text).toContain('Keep it quieter');
    expect(changed.text).toContain('A kettle screams.');
    const added = reviseNote(
      units.find((u) => u.id === 'block:n1')!,
      'Cut this',
      base,
    );
    expect(added.blockId).toBe('a1');
  });
});
