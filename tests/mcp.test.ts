import { it, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Store } from '../server/store';
import { createApp } from '../server/app';
it('real SDK client discovers tools, reads a scene and submits a pending revision over stdio', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'studio-mcp-'));
  const token = 'mcp-test-only';
  writeFileSync(path.join(dir, 'mcp-token'), token, { mode: 0o600 });
  const store = new Store(':memory:');
  const p = store.create();
  const server = createApp(store, token, 4399).listen(4399, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const client = new Client({ name: 'integration-test', version: '1' });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.resolve('node_modules/tsx/dist/cli.mjs'), path.resolve('server/mcp.ts')],
    env: { ...(process.env as Record<string, string>), STUDIO_DATA: dir, PORT: '4399' },
    stderr: 'pipe',
  });
  try {
    await client.connect(transport);
    const list = await client.listTools();
    expect(list.tools.some((t) => t.name === 'screenplay_get_scene')).toBe(true);
    expect(list.tools.some((t) => /accept|approve|overwrite/.test(t.name))).toBe(false);
    const read = await client.callTool({
      name: 'screenplay_get_scene',
      arguments: { projectId: p.id, sceneId: p.document.blocks[0].id },
    });
    const data = JSON.parse((read.content as any[])[0].text);
    expect(data.version).toBe(1);
    const proposed = await client.callTool({
      name: 'screenplay_add_scene_note',
      arguments: {
        projectId: p.id,
        sceneId: p.document.blocks[0].id,
        baseVersion: 1,
        text: 'MCP integration test note',
      },
    });
    expect(proposed.isError).toBe(false);
    expect(store.proposals(p.id)).toHaveLength(1);
    expect(store.get(p.id).document.notes).toHaveLength(0);
  } finally {
    await client.close();
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
    store.db.close();
    rmSync(dir, { recursive: true });
  }
});
