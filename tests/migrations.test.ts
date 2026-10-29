import { it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../server/store';
import { blank } from '../src/model';
it('upgrades the original schema without changing saved writing', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'studio-migration-'));
  const file = path.join(dir, 'db.sqlite');
  const old = new DatabaseSync(file);
  old.exec(
    'CREATE TABLE projects(id TEXT PRIMARY KEY,version INTEGER NOT NULL,document TEXT NOT NULL)',
  );
  const d = blank('Legacy screenplay');
  old.prepare('INSERT INTO projects VALUES(?,?,?)').run('legacy', 1, JSON.stringify(d));
  old.close();
  const store = new Store(file);
  expect(store.get('legacy').document).toEqual(d);
  expect(store.db.prepare('PRAGMA user_version').get()).toMatchObject({ user_version: 2 });
  expect(
    (store.db.prepare('PRAGMA table_info(proposals)').all() as any[]).some(
      (c) => c.name === 'reviewedAt',
    ),
  ).toBe(true);
  store.db.close();
  rmSync(dir, { recursive: true });
});
it('refuses a future database instead of downgrading its schema marker', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'studio-future-'));
  const file = path.join(dir, 'db.sqlite');
  const db = new DatabaseSync(file);
  db.exec('PRAGMA user_version=99');
  db.close();
  expect(() => new Store(file)).toThrow('newer version');
  const reopened = new DatabaseSync(file);
  expect(reopened.prepare('PRAGMA user_version').get()).toMatchObject({ user_version: 99 });
  reopened.close();
  rmSync(dir, { recursive: true });
});
it('backup restoration preserves review timestamps and remaps approval references', () => {
  const s = new Store(':memory:');
  const p = s.create();
  const proposal = s.propose(p.id, 1, 'Test', p.document);
  s.decide(proposal, true);
  const copy = s.restore(s.backup(p.id));
  const restored = s.proposals(copy.id)[0];
  expect(restored.reviewedAt).toBe(s.proposals(p.id)[0].reviewedAt);
  expect(s.history(copy.id)[0].source).toBe('approved:' + restored.id);
  expect(copy.createdAt).toBe(p.createdAt);
  s.db.close();
});
