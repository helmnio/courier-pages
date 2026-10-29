import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Store } from '../server/store';
import { blank } from '../server/../src/model';
import { callTool } from '../server/tools';

describe('replying to notes', () => {
  it('commits a reply without approval and never touches the script', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'cp-'));
    const store = new Store(path.join(dir, 's.sqlite'));
    const d = blank('Reply test');
    d.blocks = [{ id: 'b1', type: 'action', text: 'Rain.' }];
    d.notes = [{ id: 'n1', category: 'note', text: 'Warmer open', status: 'open' }];
    const p = store.create(d);
    const out: any = callTool(store, 'screenplay_reply_to_note', {
      projectId: p.id,
      noteId: 'n1',
      text: 'Softened the first line.',
      addressed: true,
      blockId: 'b1',
    });
    const after = store.get(p.id);
    expect(out.noteStatus).toBe('addressed');
    expect(after.version).toBe(p.version + 1);
    expect(after.document.blocks).toEqual(p.document.blocks);
    expect(after.document.notes[0].replies?.[0]).toMatchObject({
      text: 'Softened the first line.',
      author: 'AI',
    });
    expect(after.document.notes[0].blockId).toBe('b1');
    expect(store.historySummaries(p.id)[0]).toMatchObject({ source: 'note-reply' });
    expect(() =>
      callTool(store, 'screenplay_reply_to_note', { projectId: p.id, noteId: 'x', text: 'hi' }),
    ).toThrow('Note not found');
    store.db.close();
    rmSync(dir, { recursive: true, force: true });
  });
});
