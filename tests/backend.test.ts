import { it, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createServer } from 'node:net';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  utimesSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Store } from '../server/store';
import { createApp } from '../server/app';
async function freePort() {
  const s = createServer();
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r));
  const port = (s.address() as { port: number }).port;
  await new Promise<void>((r) => s.close(() => r()));
  return port;
}
async function connect(dir: string, port: number, autostart = '1') {
  const client = new Client({ name: 'backend-lifecycle-test', version: '1' });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [path.resolve('node_modules/tsx/dist/cli.mjs'), path.resolve('server/mcp.ts')],
      cwd: tmpdir(),
      env: {
        ...(process.env as Record<string, string>),
        PORT: String(port),
        STUDIO_DATA: dir,
        STUDIO_AUTOSTART: autostart,
      },
      stderr: 'pipe',
    }),
  );
  return client;
}
const call = (c: Client) => c.callTool({ name: 'list_projects', arguments: {} });
const data = (r: any) => JSON.parse(r.content[0].text);
function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), 'studio-backend-'));
  writeFileSync(path.join(dir, 'mcp-token'), 'lifecycle-test-only', { mode: 0o600 });
  return dir;
}
it('two independent MCP clients start one backend, reuse it and preserve the existing project', async () => {
  const dir = fixture(),
    port = await freePort();
  const store = new Store(path.join(dir, 'studio.sqlite'));
  const project = store.create();
  const before = store.backup(project.id);
  store.db.close();
  const staleLock = path.join(dir, '.backend-start.lock');
  mkdirSync(staleLock);
  const old = new Date(Date.now() - 60000);
  utimesSync(staleLock, old, old);
  const clients = await Promise.all([connect(dir, port), connect(dir, port)]);
  let pid: number | undefined;
  try {
    const results = await Promise.all(clients.map(call));
    pid = Number(readFileSync(path.join(dir, 'backend.pid'), 'utf8'));
    expect(results.every((r) => !r.isError)).toBe(true);
    for (const result of results) expect(data(result)[0].id).toBe(project.id);
    expect(pid).toBeGreaterThan(0);
    expect(() => process.kill(pid!, 0)).not.toThrow();
    expect(readFileSync(path.join(dir, 'backend.log'), 'utf8')).not.toContain('EADDRINUSE');
    await call(clients[0]);
    expect(Number(readFileSync(path.join(dir, 'backend.pid'), 'utf8'))).toBe(pid);
    expect(existsSync(path.join(dir, '.backend-start.lock'))).toBe(false);
    const reopened = new Store(path.join(dir, 'studio.sqlite'));
    expect(reopened.backup(project.id)).toEqual(before);
    reopened.db.close();
  } finally {
    await Promise.all(clients.map((c) => c.close()));
    if (!pid && existsSync(path.join(dir, 'backend.pid')))
      pid = Number(readFileSync(path.join(dir, 'backend.pid'), 'utf8'));
    if (pid) process.kill(pid, 'SIGTERM');
    for (let i = 0; i < 60; i++) {
      try {
        await fetch(`http://127.0.0.1:${port}/api/session`, { signal: AbortSignal.timeout(100) });
        await new Promise((r) => setTimeout(r, 50));
      } catch {
        break;
      }
    }
    rmSync(dir, { recursive: true, force: true });
  }
}, 20000);
it('returns an actionable error when the backend is stopped and autostart is disabled', async () => {
  const dir = fixture(),
    client = await connect(dir, await freePort(), '0');
  try {
    const result = await call(client);
    expect(result.isError).toBe(true);
    expect(data(result).error.code).toBe('backend_not_running');
    expect(existsSync(path.join(dir, 'backend.pid'))).toBe(false);
  } finally {
    await client.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
it('never creates a replacement database for a misconfigured data folder', async () => {
  const dir = fixture(),
    client = await connect(dir, await freePort());
  try {
    const result = await call(client);
    expect(data(result).error.code).toBe('backend_database_missing');
    expect(existsSync(path.join(dir, 'studio.sqlite'))).toBe(false);
  } finally {
    await client.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
it('does not start another backend when a running server rejects the configured token', async () => {
  const dir = fixture(),
    port = await freePort(),
    store = new Store(':memory:');
  const server = createApp(store, 'different-test-token', port).listen(port, '127.0.0.1');
  await new Promise<void>((r) => server.once('listening', r));
  const client = await connect(dir, port);
  try {
    const result = await call(client);
    expect(data(result).error.code).toBe('backend_auth_failed');
    expect(existsSync(path.join(dir, 'backend.pid'))).toBe(false);
  } finally {
    await client.close();
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
    store.db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
