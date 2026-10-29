import { it, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Store } from '../server/store';
import { createApp } from '../server/app';
import { callTool } from '../server/tools';
import { scenes } from '../src/model';
it('creates schema-valid blank projects with unique IDs and never overwrites a matching title', () => {
  const store = new Store(':memory:');
  try {
    const a = callTool(store, 'create_project', {
      title: '  A title  ',
      author: 'Writer',
      description: 'An idea.',
    });
    const before = store.backup(a.projectId);
    const b = callTool(store, 'create_project', { title: 'A title' });
    expect(a).toMatchObject({ changed: true, status: 'created', version: 1 });
    expect(b.projectId).not.toBe(a.projectId);
    expect(store.backup(a.projectId)).toEqual(before);
    const saved = store.get(a.projectId);
    expect(saved.document.author).toBe('Writer');
    expect(saved.document.metadata.description).toBe('An idea.');
    expect(scenes(saved.document)).toEqual([]);
    expect(saved.document.planning).toEqual([]);
    expect(store.history(a.projectId)).toHaveLength(1);
    expect(() => callTool(store, 'create_project', { title: '   ' })).toThrow();
    expect(() =>
      callTool(store, 'create_project', { title: 'x', projectId: a.projectId }),
    ).toThrow();
    expect(store.list()).toHaveLength(2);
  } finally {
    store.db.close();
  }
});
it('empty listing, creation, reads, pending proposals and reconnects succeed over real stdio', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'studio-empty-mcp-'));
  const token = 'isolated-project-test';
  writeFileSync(path.join(dir, 'mcp-token'), token, { mode: 0o600 });
  const store = new Store(path.join(dir, 'studio.sqlite'));
  // createApp enforces its configured Host port, so reserve an OS-assigned port first.
  const { createServer } = await import('node:net');
  const probe = createServer();
  await new Promise<void>((r) => probe.listen(0, '127.0.0.1', r));
  const port = (probe.address() as any).port;
  await new Promise<void>((r) => probe.close(() => r()));
  const listener = createApp(store, token, port).listen(port, '127.0.0.1');
  await new Promise<void>((r) => listener.once('listening', r));
  let client: Client | undefined;
  async function connect() {
    const c = new Client({ name: 'empty-collection-verification', version: '1' });
    await c.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [path.resolve('node_modules/tsx/dist/cli.mjs'), path.resolve('server/mcp.ts')],
        cwd: tmpdir(),
        env: {
          ...(process.env as Record<string, string>),
          STUDIO_DATA: dir,
          PORT: String(port),
          STUDIO_AUTOSTART: '0',
        },
        stderr: 'pipe',
      }),
    );
    return c;
  }
  async function invoke(name: string, input: Record<string, unknown> = {}) {
    const response = await client!.callTool({ name, arguments: input });
    expect(response.isError).not.toBe(true);
    return JSON.parse((response.content as any[])[0].text);
  }
  try {
    client = await connect();
    expect(await invoke('list_projects')).toEqual([]);
    const bad = await client.callTool({ name: 'create_project', arguments: { title: '' } });
    expect(bad.isError).toBe(true);
    expect(await invoke('list_projects')).toEqual([]);
    const created = await invoke('create_project', {
      title: 'Isolated screenplay',
      author: 'Test writer',
      description: 'Fixture only',
    });
    const id = created.projectId;
    expect(created.version).toBe(1);
    expect(await invoke('list_projects')).toEqual([
      expect.objectContaining({ id, title: 'Isolated screenplay', version: 1 }),
    ]);
    expect(await invoke('screenplay_get_current_project', { projectId: id })).toMatchObject({
      version: 1,
      data: {
        id,
        title: 'Isolated screenplay',
        author: 'Test writer',
        metadata: { description: 'Fixture only' },
      },
    });
    expect((await invoke('screenplay_list_scenes', { projectId: id })).data).toEqual([]);
    expect((await invoke('screenplay_get_planning', { projectId: id })).data).toEqual([]);
    const baseline = store.get(id);
    const proposal = await invoke('screenplay_propose_planning_update', {
      projectId: id,
      baseVersion: 1,
      summary: 'Outline suggestion',
      plan: { id: 'outline', title: 'Possible outline', kind: 'outline', body: 'A proposed beat' },
    });
    expect(proposal.status).toBe('pending');
    expect(store.get(id)).toEqual(baseline);
    expect(store.proposals(id)[0].status).toBe('pending');
    const denied = await fetch(
      `http://127.0.0.1:${port}/api/proposals/${proposal.proposalId}/decision`,
      {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: '{"accept":true}',
      },
    );
    expect(denied.status).toBe(403);
    await client.close();
    client = await connect();
    expect((await invoke('list_projects'))[0].id).toBe(id);
    expect((await invoke('screenplay_get_current_project', { projectId: id })).version).toBe(1);
    expect((await invoke('screenplay_get_planning', { projectId: id })).data).toEqual([]);
    expect(store.get(id)).toEqual(baseline);
    const tools = await client.listTools();
    expect(tools.tools.some((t) => t.name === 'create_project')).toBe(true);
    expect(tools.tools.some((t) => /accept|approve|overwrite/.test(t.name))).toBe(false);
  } finally {
    await client?.close();
    listener.closeAllConnections();
    await new Promise<void>((r) => listener.close(() => r()));
    store.db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
