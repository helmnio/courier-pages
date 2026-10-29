import { test, expect } from '@playwright/test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Store } from '../server/store';
test('the first MCP-created project appears in an empty editor and survives backend and client reconnects', async ({
  page,
}) => {
  const root = path.resolve('.');
  const dir = mkdtempSync(path.join(tmpdir(), 'studio-empty-editor-'));
  const token = 'browser-isolated-agent';
  writeFileSync(path.join(dir, 'mcp-token'), token, { mode: 0o600 });
  const db = new Store(path.join(dir, 'studio.sqlite'));
  db.db.close();
  const reserve = createServer();
  await new Promise<void>((r) => reserve.listen(0, '127.0.0.1', r));
  const port = (reserve.address() as any).port;
  await new Promise<void>((r) => reserve.close(() => r()));
  const env = {
    ...(process.env as Record<string, string>),
    PORT: String(port),
    STUDIO_DATA: dir,
    STUDIO_AUTOSTART: '0',
  };
  let child: ReturnType<typeof spawn> | undefined, client: Client | undefined;
  async function start() {
    child = spawn(
      process.execPath,
      [
        '--import',
        path.join(root, 'node_modules/tsx/dist/loader.mjs'),
        path.join(root, 'server/index.ts'),
      ],
      { cwd: root, env, stdio: 'ignore' },
    );
    for (let i = 0; i < 100; i++) {
      try {
        const r = await fetch(`http://127.0.0.1:${port}/api/session`, {
          signal: AbortSignal.timeout(150),
        });
        if (r.ok) return;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    throw Error('Isolated backend did not start');
  }
  async function stop() {
    if (!child || child.exitCode !== null) return;
    const closed = new Promise<void>((r) => child!.once('exit', () => r()));
    child.kill('SIGTERM');
    await closed;
  }
  async function connect() {
    client = new Client({ name: 'empty-editor-mcp-check', version: '1' });
    await client.connect(
      new StdioClientTransport({
        command: '/bin/zsh',
        args: [path.join(root, 'integration/run-mcp.sh')],
        cwd: tmpdir(),
        env,
        stderr: 'pipe',
      }),
    );
  }
  async function invoke(name: string, input: Record<string, unknown> = {}) {
    const result = await client!.callTool({ name, arguments: input });
    expect(result.isError).not.toBe(true);
    return JSON.parse((result.content as any[])[0].text);
  }
  try {
    await start();
    await connect();
    expect(await invoke('list_projects')).toEqual([]);
    await page.goto(`http://127.0.0.1:${port}/`);
    await expect(page.getByRole('heading', { name: 'Your next story starts here' })).toBeVisible();
    const created = await invoke('create_project', {
      title: 'Empty storage browser fixture',
      author: 'Fixture writer',
      description: 'No real data',
    });
    await expect(
      page.getByRole('heading', { name: 'Empty storage browser fixture', exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel('Project', { exact: true })).toHaveValue(created.projectId);
    await expect(page.getByRole('textbox', { name: 'Screenplay editor' })).toBeVisible();
    expect((await invoke('screenplay_list_scenes', { projectId: created.projectId })).data).toEqual(
      [],
    );
    await page.getByRole('button', { name: 'Planning', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'A home for the shape of your story' }),
    ).toBeVisible();
    await page.screenshot({ path: path.join(root, 'docs/screenshots/empty-project-mcp.png') });
    await client!.close();
    client = undefined;
    await stop();
    // Exercise a genuine offline interval, including expired browser session cookies.
    await new Promise((r) => setTimeout(r, 2000));
    await start();
    await connect();
    expect(await invoke('list_projects')).toEqual([
      expect.objectContaining({
        id: created.projectId,
        title: 'Empty storage browser fixture',
        version: 1,
      }),
    ]);
    expect(
      (await invoke('screenplay_get_planning', { projectId: created.projectId })).data,
    ).toEqual([]);
    await expect(page.locator('.save-status')).toContainText('Connected locally');
    const pending = await invoke('screenplay_propose_planning_update', {
      projectId: created.projectId,
      baseVersion: 1,
      summary: 'Reviewable outline suggestion',
      plan: {
        id: 'fixture-outline',
        title: 'An outline',
        kind: 'outline',
        body: 'A suggested beat',
      },
    });
    await expect(page.getByRole('button', { name: 'Revisions · 1', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Revisions · 1', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Reviewable outline suggestion', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve revision', exact: true })).toBeEnabled();
    expect(
      (await invoke('screenplay_get_planning', { projectId: created.projectId })).data,
    ).toEqual([]);
    const snapshot = new Store(path.join(dir, 'studio.sqlite'));
    expect(snapshot.get(created.projectId).version).toBe(1);
    expect(snapshot.proposals(created.projectId)[0]).toMatchObject({
      id: pending.proposalId,
      status: 'pending',
    });
    snapshot.db.close();
    await client!.close();
    client = undefined;
    await connect();
    expect(
      (await invoke('screenplay_get_current_project', { projectId: created.projectId })).version,
    ).toBe(1);
  } finally {
    await page.close();
    await client?.close();
    await stop();
    rmSync(dir, { recursive: true, force: true });
  }
});
