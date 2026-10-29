import { it, expect } from 'vitest';
import { blank, sceneBlocks } from '../src/model';
import { pdf, fdx, parseFDX } from '../server/formats';
import { Store } from '../server/store';
it('handles a script substantially longer than a feature and restores its backup', async () => {
  const d = blank('Long script verification');
  d.blocks = [];
  for (let i = 0; i < 240; i++) {
    d.blocks.push({ id: 's' + i, type: 'scene', text: `INT. CABIN ${i} - NIGHT` });
    for (let j = 0; j < 6; j++)
      d.blocks.push({
        id: `a${i}-${j}`,
        type: 'action',
        text: 'The cabin shifts in the weather. A thin line of light moves across the floor. Outside, the ship works against the tide. '.repeat(
          2,
        ),
      });
    d.blocks.push(
      { id: 'c' + i, type: 'character', text: 'MARA' },
      { id: 'd' + i, type: 'dialogue', text: 'We wait for the tide. Then we go.' },
    );
  }
  const start = performance.now();
  const store = new Store(':memory:');
  const p = store.create(d);
  expect(sceneBlocks(store.get(p.id).document, 's239')).toHaveLength(9);
  expect(parseFDX(fdx(d)).blocks).toHaveLength(d.blocks.length);
  const rendered = pdf(d);
  const pages = (rendered as any).layout.screenplayPages;
  expect(pages).toBeGreaterThan(130);
  for await (const _chunk of rendered) {
  }
  const copy = store.restore(store.backup(p.id));
  expect(copy.document).toEqual(d);
  const elapsed = performance.now() - start;
  expect(elapsed).toBeLessThan(15000);
  console.log(
    `Long-script check: ${d.blocks.length} elements, ${pages} screenplay pages, ${Math.round(elapsed)} ms`,
  );
  store.db.close();
}, 20000);
it('long unbroken dialogue cannot loop forever during PDF pagination', async () => {
  const d = blank();
  d.blocks.push(
    { id: 'cue', type: 'character', text: 'MARA' },
    { id: 'long', type: 'dialogue', text: 'x'.repeat(12000) },
  );
  for await (const _chunk of pdf(d)) {
  }
}, 5000);
