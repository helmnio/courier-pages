import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Store, Conflict } from '../server/store';
import { blank, moveScene, duplicateScene, sceneBlocks, DocumentSchema } from '../src/model';
import { callTool } from '../server/tools';
import { fdx, parseFDX, fountain, parseFountain, pdf } from '../server/formats';
const sample = () => {
  const d = blank('Salt & Light <draft>');
  d.author = 'A. "Writer"';
  d.blocks = [
    { id: 'scene-a', type: 'scene' as const, text: 'INT. BOAT - NIGHT' },
    { id: 'act-a', type: 'action' as const, text: 'Rain & wind. <A light>.' },
    { id: 'cue-a', type: 'character' as const, text: 'MARA' },
    { id: 'par-a', type: 'parenthetical' as const, text: '(quietly)' },
    { id: 'dia-a', type: 'dialogue' as const, text: 'I know.\nDo you?' },
    { id: 'cue-b', type: 'character' as const, text: 'ELI (O.S.)' },
    { id: 'dia-b', type: 'dialogue' as const, text: 'Yes.' },
    { id: 'scene-b', type: 'scene' as const, text: 'EXT. QUAY - DAWN' },
    { id: 'act-b', type: 'action' as const, text: 'The ship is gone.' },
  ];
  return d;
};
describe('durability and migrations', () => {
  it('persists across database reopen and applies an idempotent migration', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'studio-'));
    const file = path.join(dir, 'db.sqlite');
    const s = new Store(file);
    const p = s.create(sample());
    s.save(p.id, 1, { ...p.document, title: 'Saved' });
    s.db.close();
    const reopened = new Store(file);
    expect(reopened.get(p.id).document.title).toBe('Saved');
    expect(reopened.history(p.id)).toHaveLength(2);
    expect(reopened.db.prepare('PRAGMA user_version').get()).toMatchObject({ user_version: 2 });
    reopened.db.close();
    rmSync(dir, { recursive: true });
  });
  it('rejects stale manual writes without losing content', () => {
    const s = new Store(':memory:');
    const p = s.create(sample());
    s.save(p.id, 1, { ...p.document, title: 'Human work' });
    expect(() => s.save(p.id, 1, p.document)).toThrow(Conflict);
    expect(s.get(p.id).document.title).toBe('Human work');
    s.db.close();
  });
});
describe('human approval', () => {
  it('proposes only the selected scene, then accepts atomically with history', () => {
    const s = new Store(':memory:');
    const p = s.create(sample());
    const blocks = sceneBlocks(p.document, 'scene-a').map((b) =>
      b.type === 'dialogue' ? { ...b, text: 'A quieter line.' } : b,
    );
    const r = callTool(s, 'screenplay_propose_scene_revision', {
      projectId: p.id,
      sceneId: 'scene-a',
      baseVersion: 1,
      summary: 'Dialogue pass',
      blocks,
    }) as any;
    expect(s.get(p.id).version).toBe(1);
    expect(r.screenplayChanged).toBe(false);
    const accepted = s.decide(r.proposalId, true);
    expect(accepted.version).toBe(2);
    expect(sceneBlocks(accepted.document, 'scene-b')).toEqual(sceneBlocks(p.document, 'scene-b'));
    expect(s.history(p.id)).toHaveLength(2);
    expect(() => s.decide(r.proposalId, true)).toThrow(Conflict);
    s.db.close();
  });
  it('rejects stale approval and preserves a human edit', () => {
    const s = new Store(':memory:');
    const p = s.create(sample());
    const id = s.propose(p.id, 1, 'Rewrite', { ...p.document, title: 'AI' });
    s.save(p.id, 1, { ...p.document, title: 'Human' });
    expect(() => s.decide(id, true)).toThrow(Conflict);
    expect(s.get(p.id).document.title).toBe('Human');
    expect(s.proposals(p.id)[0].status).toBe('pending');
    s.decide(id, false);
    expect(s.get(p.id).version).toBe(2);
    s.db.close();
  });
  it('reads narrowly scoped context and refuses cross-scene replacement', () => {
    const s = new Store(':memory:');
    const p = s.create(sample());
    const result = callTool(s, 'screenplay_get_story_bible', { projectId: p.id, section: 'world' });
    expect(result).toMatchObject({ version: 1, data: { section: 'world', content: '' } });
    expect(JSON.stringify(result)).not.toContain('BOAT');
    expect(() =>
      callTool(s, 'screenplay_propose_scene_revision', {
        projectId: p.id,
        sceneId: 'scene-a',
        baseVersion: 1,
        summary: 'Bad',
        blocks: [{ id: 'other', type: 'scene', text: 'Oops' }],
      }),
    ).toThrow();
    s.db.close();
  });
});
describe('scene identity and native backup', () => {
  it('moves entire scenes and retains attached briefs and notes', () => {
    const d = sample();
    d.bible.scenes['scene-a'] = 'Purpose';
    d.briefs['scene-a'] = {
      purpose: 'Tension',
      startingState: '',
      endingState: '',
      requiredBeats: '',
      characterIntentions: '',
      dialogueGuidance: '',
      tone: '',
      constraints: '',
    };
    const moved = moveScene(d, 'scene-a', 1);
    expect(moved.blocks[0].id).toBe('scene-b');
    expect(sceneBlocks(moved, 'scene-a')).toEqual(sceneBlocks(d, 'scene-a'));
    expect(moved.briefs).toEqual(d.briefs);
    const copy = duplicateScene(moved, 'scene-a');
    expect(copy.blocks.filter((b) => b.type === 'scene')).toHaveLength(3);
    expect(new Set(copy.blocks.map((b) => b.id)).size).toBe(copy.blocks.length);
  });
  it('restores every native document field, proposals and revisions to a clean database', () => {
    const s = new Store(':memory:');
    const d = sample();
    d.characters = [
      {
        id: 'mara',
        name: 'Mara',
        aliases: '',
        age: '32',
        description: '',
        background: '',
        motivation: '',
        relationships: '',
        voice: '',
        arc: '',
      },
    ];
    d.notes = [
      { id: 'n', sceneId: 'scene-a', category: 'continuity', text: 'Check tide', status: 'open' },
    ];
    const p = s.create(d);
    s.save(p.id, 1, { ...d, title: 'Draft two' });
    s.propose(p.id, 2, 'Suggestion', d);
    const backup = JSON.parse(JSON.stringify(s.backup(p.id)));
    const clean = new Store(':memory:');
    const restored = clean.restore(backup);
    expect(restored.id).not.toBe(p.id);
    expect(restored.document).toEqual(s.get(p.id).document);
    expect(clean.history(restored.id).map((h) => h.document)).toEqual(
      s.history(p.id).map((h) => h.document),
    );
    expect(clean.proposals(restored.id)[0].document).toEqual(d);
    expect(() => clean.restore({ ...backup, schemaVersion: 999 })).toThrow();
    clean.db.close();
    s.db.close();
  });
  it('rejects duplicate stable IDs', () => {
    const d = sample();
    d.blocks[1].id = d.blocks[0].id;
    expect(() => DocumentSchema.parse(d)).toThrow();
  });
});
describe('screenplay formats', () => {
  it('FDX round-trips supported elements, multiline text, title and XML escaping', () => {
    const d = sample();
    const result = parseFDX(fdx(d));
    expect(result.blocks.map(({ id, ...b }) => b)).toEqual(d.blocks.map(({ id, ...b }) => b));
    expect(result.title).toBe(d.title);
    expect(result.author).toBe(d.author);
  });
  it('rejects unsafe XML and malformed input', () => {
    expect(() => parseFDX('<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><x/>')).toThrow();
    expect(() => parseFDX('<FinalDraft>')).toThrow();
  });
  it('Fountain round-trips supported core elements', () => {
    const d = sample();
    const result = parseFountain(fountain(d));
    expect(result.title).toBe(d.title);
    expect(result.blocks.map(({ id, ...b }) => b)).toEqual(d.blocks.map(({ id, ...b }) => b));
  });
  it('keeps explicit page breaks in FDX and Fountain', () => {
    const d = sample();
    d.blocks.splice(7, 0, { id: 'break', type: 'pageBreak', text: '' });
    expect(parseFDX(fdx(d)).blocks.some((b) => b.type === 'pageBreak')).toBe(true);
    expect(parseFountain(fountain(d)).blocks.some((b) => b.type === 'pageBreak')).toBe(true);
  });
  it('generates a local multipage PDF with long dialogue and A4', async () => {
    const d = sample();
    d.metadata.pageSize = 'A4';
    d.blocks[4].text = 'A line that keeps going through the night. '.repeat(1400);
    const chunks: Buffer[] = [];
    for await (const c of pdf(d)) chunks.push(c);
    const bytes = Buffer.concat(chunks);
    expect(bytes.subarray(0, 4).toString()).toBe('%PDF');
    expect((bytes.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length).toBeGreaterThan(3);
  });
});
import { Store as ReviewStore } from '../server/store.js';
import { blank as blankDocument } from '../src/model.js';
describe('reviewing a proposal with notes', () => {
  it('lets a person close a proposal while saving their own document, without applying the proposal', () => {
    const store = new ReviewStore(':memory:');
    const first = store.create(blankDocument('Review'));
    const id = store.propose(first.id, first.version, 'Change it', {
      ...first.document,
      title: 'Proposed title',
    });
    const withNote = {
      ...first.document,
      notes: [
        {
          id: 'n',
          category: 'note' as const,
          text: 'Revise',
          status: 'open',
          author: 'Revision request',
        },
      ],
    };
    const saved = store.decide(id, false, { document: withNote as never, version: first.version });
    expect(saved.version).toBe(first.version + 1);
    expect(saved.document.title).toBe('Review');
    expect(saved.document.notes).toHaveLength(1);
    expect(store.proposals(first.id)[0].status).toBe('rejected');
  });
});
