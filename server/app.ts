import express from 'express';
import type { Response } from 'express';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { toolDefinitions, callTool } from './tools.js';
import { Store, Conflict } from './store.js';
import { DocumentSchema, blank } from '../src/model.js';
import { fountain, fdx, pdf, parseFDX, parseFountain } from './formats.js';
import { clientStatuses, connectClient } from './connect.js';
import { dataDirectory, root } from './paths.js';
export function createApp(store: Store, token: string, port: number) {
  const app = express();
  const session = randomBytes(32).toString('hex');
  const peers = new Set<Response>();
  const announce = (
    req: express.Request,
    details: { projectId?: string; entityId?: string; version?: number } = {},
  ) => {
    const projectId = String(
      details.projectId ?? req.body?.input?.projectId ?? req.params.id ?? '',
    );
    let version: number | null = null;
    try {
      version = store.get(projectId).version;
    } catch {}
    const event = {
      type:
        req.path.includes('proposal') || req.path.includes('tools')
          ? 'proposal.changed'
          : 'project.changed',
      projectId,
      entityId: details.entityId ?? req.params.id ?? null,
      version: details.version ?? version,
    };
    for (const p of peers) p.write('data: ' + JSON.stringify(event) + '\n\n');
  };
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host ?? ''))
      return void res.status(403).json({ error: 'Untrusted host' });
    const origin = req.headers.origin;
    if (origin && ![`http://127.0.0.1:${port}`, `http://localhost:${port}`].includes(origin))
      return void res.status(403).json({ error: 'Untrusted origin' });
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
  });
  app.use('/api/restore', express.json({ limit: '256mb' }));
  app.use(express.json({ limit: '8mb' }));
  const browser = (req: express.Request) =>
    req.headers.cookie?.split(';').some((c) => c.trim() === `studio_session=${session}`) ?? false;
  const agent = (req: express.Request) => {
    const b = Buffer.from(req.headers.authorization?.replace(/^Bearer /, '') ?? '');
    const a = Buffer.from(token);
    return a.length === b.length && timingSafeEqual(a, b);
  };
  app.get('/api/session', (_req, res) => {
    res.cookie('studio_session', session, { httpOnly: true, sameSite: 'strict', path: '/' });
    res.json({ ok: true });
  });
  app.use('/api', (req, res, next) => {
    if (!browser(req) && !agent(req))
      return void res.status(401).json({ error: 'Local authentication required' });
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  const human: express.RequestHandler = (req, res, next) => {
    if (!browser(req))
      return void res.status(403).json({ error: 'This action requires approval in the editor' });
    next();
  };
  app.get('/api/capabilities', (_req, res) =>
    res.json({
      storage: 'sqlite',
      sync: 'sse-optimistic',
      mcp: 'local-stdio',
      browserTools: 'opt-in',
      agentActions: ['list_projects', ...toolDefinitions.map((t) => t.name)],
      approval: 'editor-only',
      hostedChatGPT: 'requires separately configured reachable transport; localhost is not assumed',
      formats: { import: ['fountain', 'fdx'], export: ['fountain', 'fdx', 'pdf', 'json'] },
    }),
  );
  app.get('/api/connect', (_req, res) =>
    res.json({ dataDirectory, installDirectory: root, clients: clientStatuses() }),
  );
  app.post('/api/connect/:client', human, (req, res) => {
    const result = connectClient(String(req.params.client));
    res.status(result.ok ? 200 : 400).json({ ...result, clients: clientStatuses() });
  });
  app.get('/api/events', (req, res) => {
    if (!browser(req)) return void res.sendStatus(403);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.flushHeaders();
    peers.add(res);
    res.write('data: {"connected":true}\n\n');
    const t = setInterval(() => res.write(': keepalive\n\n'), 15000);
    req.on('close', () => {
      clearInterval(t);
      peers.delete(res);
    });
  });
  app.get('/api/tools', (_req, res) =>
    res.json(
      toolDefinitions.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: z.toJSONSchema(t.schema),
        annotations: { readOnlyHint: t.readOnly },
      })),
    ),
  );
  app.post('/api/tools/call', (req, res) => {
    const b = z.object({ name: z.string(), input: z.unknown() }).parse(req.body);
    const result = callTool(store, b.name, b.input);
    res.json(result);
    if (result.changed)
      announce(req, {
        projectId: result.projectId,
        version: result.version,
        entityId: 'proposalId' in result ? String(result.proposalId) : result.projectId,
      });
  });
  app.get('/api/projects', (_req, res) => res.json(store.list()));
  app.post('/api/projects', human, (req, res) => {
    const d = req.body.document
      ? DocumentSchema.parse(req.body.document)
      : blank(
          z
            .string()
            .min(1)
            .max(200)
            .parse(req.body.title ?? 'Untitled screenplay'),
        );
    const created = store.create(d);
    res.json(created);
    announce(req, { projectId: created.id, entityId: created.id, version: created.version });
  });
  app.post('/api/paginate', (req, res) => {
    const rendered = pdf(DocumentSchema.parse(req.body.document));
    res.json((rendered as any).layout);
    rendered.resume();
  });
  app.get('/api/projects/:id/pagination', (req, res) => {
    const rendered = pdf(store.get(String(req.params.id)).document);
    res.json((rendered as any).layout);
    rendered.resume();
  });
  app.get('/api/projects/:id/backup', (req, res) =>
    res.attachment('screenplay-project.studio.json').json(store.backup(String(req.params.id))),
  );
  app.post('/api/restore', human, (req, res) => {
    const restored = store.restore(req.body);
    res.json(restored);
    announce(req, { projectId: restored.id, entityId: restored.id, version: restored.version });
  });
  app.get('/api/projects/:id', (req, res) => res.json(store.get(req.params.id)));
  app.put('/api/projects/:id', human, (req, res) => {
    const version = z.number().int().positive().parse(req.body.version);
    res.json(
      store.save(
        String(req.params.id),
        version,
        req.body.document,
        req.body.checkpoint === true ? 'human checkpoint' : 'human',
      ),
    );
    announce(req);
  });
  app.get('/api/projects/:id/proposals', (req, res) => res.json(store.proposals(req.params.id)));
  app.post('/api/projects/:id/proposals', (req, res) => {
    const b = z
      .object({
        baseVersion: z.number().int().positive(),
        summary: z.string().min(1).max(2000),
        document: DocumentSchema,
      })
      .parse(req.body);
    const id = store.propose(String(req.params.id), b.baseVersion, b.summary, b.document);
    res.json({ id });
    announce(req, { projectId: String(req.params.id), entityId: id, version: b.baseVersion });
  });
  app.post('/api/proposals/:id/decision', human, (req, res) => {
    const body = z
      .object({
        accept: z.boolean(),
        document: DocumentSchema.optional(),
        version: z.number().int().positive().optional(),
      })
      .refine((b) => !b.document || b.version !== undefined)
      .parse(req.body);
    const next = store.decide(
      String(req.params.id),
      body.accept,
      body.document ? { document: body.document, version: body.version! } : undefined,
    );
    res.json(next);
    announce(req, { projectId: next.id, entityId: String(req.params.id), version: next.version });
  });
  app.get('/api/projects/:id/revisions/:version', (req, res) =>
    res.json(
      store.revision(
        String(req.params.id),
        z.coerce.number().int().positive().parse(req.params.version),
      ),
    ),
  );
  app.get('/api/projects/:id/revisions/:version/export', (req, res) =>
    res
      .attachment('screenplay-revision-' + req.params.version + '.json')
      .json(
        store.revision(
          String(req.params.id),
          z.coerce.number().int().positive().parse(req.params.version),
        ).document,
      ),
  );
  app.get('/api/projects/:id/history', (req, res) =>
    res.json(store.historySummaries(req.params.id)),
  );
  app.post('/api/import', human, (req, res) => {
    const b = z
      .object({ format: z.enum(['fdx', 'fountain', 'json']), text: z.string().max(6000000) })
      .parse(req.body);
    const d =
      b.format === 'fdx'
        ? parseFDX(b.text)
        : b.format === 'fountain'
          ? parseFountain(b.text)
          : DocumentSchema.parse(JSON.parse(b.text));
    const created = store.create(d, 'import');
    res.json(created);
    announce(req, { projectId: created.id, entityId: created.id, version: created.version });
  });
  app.get('/api/projects/:id/export/:format', (req, res) => {
    const d = store.get(String(req.params.id)).document;
    const f = z.enum(['fdx', 'fountain', 'pdf', 'json']).parse(req.params.format);
    res.attachment(`screenplay.${f}`);
    if (f === 'pdf') {
      res.type('pdf');
      pdf(d).pipe(res);
    } else if (f === 'json') res.json(d);
    else
      res
        .type(f === 'fdx' ? 'application/xml' : 'text/plain')
        .send(f === 'fdx' ? fdx(d) : fountain(d));
  });
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res
      .status(err instanceof Conflict ? 409 : err.status === 413 ? 413 : 400)
      .json({ error: err.message ?? 'Request failed' });
  });
  return app;
}
