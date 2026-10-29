import { request } from 'node:http';
import { it, expect } from 'vitest';
import { createApp } from '../server/app';
import { Store } from '../server/store';
import { blank } from '../src/model';
it('protects writes, emits live events, validates origin and rejects agent approval', async () => {
  const store = new Store(':memory:');
  const p = store.create(blank('API screenplay'));
  const port = 4398;
  const server = createApp(store, 'test-local-agent-secret', port).listen(port, '127.0.0.1');
  await new Promise<void>((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${port}`;
  const get = (url: string, headers: Record<string, string> = {}) => fetch(base + url, { headers });
  let controller: AbortController | undefined;
  try {
    expect((await get('/api/projects')).status).toBe(401);
    expect((await get('/api/session', { Origin: 'https://untrusted.example' })).status).toBe(403);
    const session = await get('/api/session');
    const cookie = session.headers.get('set-cookie')!.split(';')[0];
    const agent = {
      Authorization: 'Bearer test-local-agent-secret',
      'Content-Type': 'application/json',
    };
    const human = { Cookie: cookie, 'Content-Type': 'application/json' };
    const input = {
      name: 'screenplay_add_scene_note',
      input: {
        projectId: p.id,
        sceneId: p.document.blocks[0].id,
        baseVersion: 1,
        text: 'Tighten the opening.',
      },
    };
    controller = new AbortController();
    const events = await fetch(base + '/api/events', {
      headers: { Cookie: cookie },
      signal: controller.signal,
    });
    const reader = events.body!.getReader();
    await reader.read();
    const response = await fetch(base + '/api/tools/call', {
      method: 'POST',
      headers: agent,
      body: JSON.stringify(input),
    });
    expect(response.status).toBe(200);
    const proposal = await response.json();
    const update = await reader.read();
    expect(new TextDecoder().decode(update.value)).toContain('proposal.changed');
    expect(store.get(p.id).version).toBe(1);
    const url = base + `/api/proposals/${proposal.proposalId}/decision`;
    expect(
      (await fetch(url, { method: 'POST', headers: agent, body: '{"accept":true}' })).status,
    ).toBe(403);
    expect(
      (
        await fetch(base + `/api/projects/${p.id}`, {
          method: 'PUT',
          headers: agent,
          body: JSON.stringify({ version: 1, document: p.document }),
        })
      ).status,
    ).toBe(403);
    expect(
      (await fetch(url, { method: 'POST', headers: human, body: '{"accept":true}' })).status,
    ).toBe(200);
    expect(store.get(p.id).version).toBe(2);
    expect(store.get(p.id).document.notes[0].text).toBe('Tighten the opening.');
    const backup = await (await get(`/api/projects/${p.id}/backup`, { Cookie: cookie })).json();
    expect(backup.proposals).toHaveLength(1);
    const hostStatus = await new Promise<number>((resolve) => {
      const req = request(base + '/api/projects', { headers: { Host: 'evil.example' } }, (res) => {
        res.resume();
        resolve(res.statusCode!);
      });
      req.end();
    });
    expect(hostStatus).toBe(403);
  } finally {
    controller?.abort();
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
    store.db.close();
  }
});
it('restores a complete native backup larger than the screenplay import limit', async () => {
  const store = new Store(':memory:');
  const d = blank('Large backup');
  d.bible.world = 'x'.repeat(3000000);
  const p = store.create(d);
  store.save(p.id, 1, { ...d, title: 'Large backup saved' });
  const app = createApp(store, 'test-token', 4397);
  const server = app.listen(4397, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  try {
    const session = await fetch('http://127.0.0.1:4397/api/session');
    const cookie = session.headers.get('set-cookie')!.split(';')[0];
    const body = JSON.stringify(store.backup(p.id));
    expect(body.length).toBeGreaterThan(8000000);
    const response = await fetch('http://127.0.0.1:4397/api/restore', {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body,
    });
    expect(response.status).toBe(200);
    const restored = await response.json();
    expect(store.get(restored.id).document.bible.world.length).toBe(3000000);
    expect(store.history(restored.id)).toHaveLength(2);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    store.db.close();
  }
});
