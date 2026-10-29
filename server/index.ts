import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import express from 'express';
import { Store } from './store.js';
import { createApp } from './app.js';
import { root, dataDirectory as data } from './paths.js';
mkdirSync(data, { recursive: true, mode: 0o700 });
const tokenPath = path.join(data, 'mcp-token');
if (!existsSync(tokenPath))
  writeFileSync(tokenPath, randomBytes(32).toString('hex'), { mode: 0o600 });
const port = Number(process.env.PORT ?? 4310);
const databasePath = path.join(data, 'studio.sqlite');
const newDatabase = !existsSync(databasePath);
const store = new Store(databasePath);
if (newDatabase && process.env.STUDIO_SEED_SAMPLE !== '0' && !store.list().length) {
  const d = (await import('../src/model.js')).blank('The Last Light');
  d.author = 'Your name';
  d.bible.logline =
    'On the night a coastal lighthouse goes dark, two estranged siblings discover what their father left behind.';
  d.blocks = [
    { id: crypto.randomUUID(), type: 'scene', text: 'EXT. LIGHTHOUSE - DUSK' },
    {
      id: crypto.randomUUID(),
      type: 'action',
      text: 'The sea draws a long breath. Above the rocks, the lighthouse stands dark for the first time in a hundred years.',
    },
    {
      id: crypto.randomUUID(),
      type: 'action',
      text: 'MARA, 32, climbs the last stone step. A brass key turns in her hand.',
    },
    { id: crypto.randomUUID(), type: 'character', text: 'MARA' },
    { id: crypto.randomUUID(), type: 'dialogue', text: 'You could have left a light on.' },
    { id: crypto.randomUUID(), type: 'scene', text: 'INT. LIGHTHOUSE - CONTINUOUS' },
    {
      id: crypto.randomUUID(),
      type: 'action',
      text: 'A table. Two cups. One letter, still sealed.',
    },
  ];
  store.create(d);
}
const app = createApp(store, readFileSync(tokenPath, 'utf8'), port);
if (!process.env.STUDIO_DEV && existsSync(path.join(root, 'dist/index.html'))) {
  app.use(express.static(path.join(root, 'dist')));
  app.get('/', (_req, res) => res.sendFile(path.join(root, 'dist/index.html')));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({
    root,
    server: { middlewareMode: true, host: '127.0.0.1', hmr: { host: '127.0.0.1' } },
    appType: 'spa',
  });
  app.use(vite.middlewares);
}
const server = app.listen(port, '127.0.0.1', () =>
  console.log(`Courier Pages: http://127.0.0.1:${port}`),
);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    server.closeAllConnections();
    server.close(() => {
      store.db.close();
      process.exit(0);
    });
  });
