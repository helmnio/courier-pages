import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { DocumentSchema, blank, type Script, type Project, type Proposal } from '../src/model.js';
export class Conflict extends Error {}
export class Store {
  db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    const version = this.db.prepare('PRAGMA user_version').get() as { user_version: number };
    if (version.user_version > 2) {
      this.db.close();
      throw Error('This database requires a newer version of Courier Pages.');
    }
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY, version INTEGER NOT NULL, document TEXT NOT NULL, createdAt TEXT DEFAULT CURRENT_TIMESTAMP, updatedAt TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS revisions(id TEXT PRIMARY KEY, projectId TEXT NOT NULL, version INTEGER NOT NULL, document TEXT NOT NULL, source TEXT NOT NULL, createdAt TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS proposals(id TEXT PRIMARY KEY, projectId TEXT NOT NULL, baseVersion INTEGER NOT NULL, summary TEXT NOT NULL, document TEXT NOT NULL, status TEXT DEFAULT 'pending', createdAt TEXT DEFAULT CURRENT_TIMESTAMP);`);
    const columns = this.db.prepare('PRAGMA table_info(projects)').all() as any[];
    for (const name of ['createdAt', 'updatedAt'])
      if (!columns.some((c) => c.name === name))
        this.db.exec(`ALTER TABLE projects ADD COLUMN ${name} TEXT`);
    const proposalColumns = this.db.prepare('PRAGMA table_info(proposals)').all() as any[];
    if (!proposalColumns.some((c) => c.name === 'reviewedAt'))
      this.db.exec('ALTER TABLE proposals ADD COLUMN reviewedAt TEXT');
    this.db.exec(
      'CREATE INDEX IF NOT EXISTS revisions_project_version ON revisions(projectId,version);CREATE INDEX IF NOT EXISTS proposals_project ON proposals(projectId);PRAGMA user_version=2',
    );
  }
  list() {
    return (this.db.prepare('SELECT * FROM projects').all() as any[]).map((p) => ({
      id: p.id,
      version: p.version,
      title: JSON.parse(p.document).title,
      archived: JSON.parse(p.document).metadata?.archived ?? false,
      draft: JSON.parse(p.document).metadata?.draft ?? 1,
    }));
  }
  get(id: string): Project {
    const p = this.db.prepare('SELECT * FROM projects WHERE id=?').get(id) as any;
    if (!p) throw Error('Project not found');
    return { ...p, document: DocumentSchema.parse(JSON.parse(p.document)) };
  }
  create(document: Script = blank(), source = 'created') {
    const id = randomUUID();
    const d = DocumentSchema.parse(document);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db
        .prepare('INSERT INTO projects(id,version,document) VALUES(?,?,?)')
        .run(id, 1, JSON.stringify(d));
      this.db
        .prepare('INSERT INTO revisions(id,projectId,version,document,source) VALUES(?,?,?,?,?)')
        .run(randomUUID(), id, 1, JSON.stringify(d), source);
      this.db.exec('COMMIT');
      return this.get(id);
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
  save(id: string, version: number, document: Script, source = 'human') {
    const d = DocumentSchema.parse(document);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const r = this.db
        .prepare(
          'UPDATE projects SET version=version+1,updatedAt=CURRENT_TIMESTAMP,document=? WHERE id=? AND version=?',
        )
        .run(JSON.stringify(d), id, version);
      if (!r.changes)
        throw new Conflict('The script changed. Review the latest version before saving.');
      this.db
        .prepare('INSERT INTO revisions(id,projectId,version,document,source) VALUES(?,?,?,?,?)')
        .run(randomUUID(), id, version + 1, JSON.stringify(d), source);
      this.db.exec('COMMIT');
      return this.get(id);
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
  propose(id: string, baseVersion: number, summary: string, document: Script) {
    if (this.get(id).version !== baseVersion)
      throw new Conflict('Proposal is based on an old version');
    const d = DocumentSchema.parse(document);
    const pid = randomUUID();
    this.db
      .prepare('INSERT INTO proposals(id,projectId,baseVersion,summary,document) VALUES(?,?,?,?,?)')
      .run(pid, id, baseVersion, summary, JSON.stringify(d));
    return pid;
  }
  proposals(id: string): Proposal[] {
    return (
      this.db
        .prepare('SELECT * FROM proposals WHERE projectId=? ORDER BY createdAt DESC')
        .all(id) as any[]
    ).map((p) => ({ ...p, document: JSON.parse(p.document) }));
  }
  /**
   * Approving normally applies the stored proposal. A person reviewing element by element supplies
   * the merged document they chose, plus the version they were looking at.
   */
  decide(id: string, accept: boolean, merged?: { document: Script; version: number }) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const p = this.db.prepare('SELECT * FROM proposals WHERE id=?').get(id) as any;
      if (!p || p.status !== 'pending') throw new Conflict('Proposal already decided or missing');
      if (accept || merged) {
        const document = merged
          ? JSON.stringify(DocumentSchema.parse(merged.document))
          : p.document;
        const from = merged ? merged.version : p.baseVersion;
        const r = this.db
          .prepare(
            'UPDATE projects SET version=version+1,updatedAt=CURRENT_TIMESTAMP,document=? WHERE id=? AND version=?',
          )
          .run(document, p.projectId, from);
        if (!r.changes)
          throw new Conflict(
            merged
              ? 'The script changed while you were reviewing. Review the latest version.'
              : 'Stale proposal: request a new proposal against the current version',
          );
        this.db
          .prepare('INSERT INTO revisions(id,projectId,version,document,source) VALUES(?,?,?,?,?)')
          .run(
            randomUUID(),
            p.projectId,
            from + 1,
            document,
            accept ? `approved:${id}` : `notes:${id}`,
          );
      }
      this.db
        .prepare('UPDATE proposals SET status=?,reviewedAt=CURRENT_TIMESTAMP WHERE id=?')
        .run(accept ? 'accepted' : 'rejected', id);
      this.db.exec('COMMIT');
      return this.get(p.projectId);
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
  backup(id: string) {
    return {
      format: 'screenplay-studio',
      schemaVersion: 1,
      project: this.get(id),
      revisions: this.history(id),
      proposals: this.proposals(id),
    };
  }
  restore(raw: unknown) {
    const b = z
      .object({
        format: z.literal('screenplay-studio'),
        schemaVersion: z.literal(1),
        project: z.object({
          version: z.number().int().positive(),
          document: DocumentSchema,
          createdAt: z.string().nullable().optional(),
          updatedAt: z.string().nullable().optional(),
        }),
        revisions: z.array(
          z.object({
            version: z.number().int().positive(),
            document: DocumentSchema,
            source: z.string(),
            createdAt: z.string(),
          }),
        ),
        proposals: z.array(
          z.object({
            id: z.string(),
            baseVersion: z.number().int().positive(),
            summary: z.string(),
            document: DocumentSchema,
            status: z.enum(['pending', 'accepted', 'rejected']),
            createdAt: z.string(),
            reviewedAt: z.string().nullable().optional(),
          }),
        ),
      })
      .parse(raw);
    const latest = b.revisions.find((h) => h.version === b.project.version);
    if (
      !latest ||
      JSON.stringify(latest.document) !== JSON.stringify(b.project.document) ||
      new Set(b.revisions.map((h) => h.version)).size !== b.revisions.length ||
      b.revisions.some((h) => h.version > b.project.version) ||
      b.proposals.some((p) => p.baseVersion > b.project.version)
    )
      throw Error('Backup history does not match its current document version.');
    const id = randomUUID();
    const proposalIds = new Map(b.proposals.map((p) => [p.id, randomUUID()]));
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db
        .prepare(
          'INSERT INTO projects(id,version,document,createdAt,updatedAt) VALUES(?,?,?,COALESCE(?,CURRENT_TIMESTAMP),COALESCE(?,CURRENT_TIMESTAMP))',
        )
        .run(
          id,
          b.project.version,
          JSON.stringify(b.project.document),
          b.project.createdAt ?? null,
          b.project.updatedAt ?? null,
        );
      for (const h of b.revisions)
        this.db
          .prepare(
            'INSERT INTO revisions(id,projectId,version,document,source,createdAt) VALUES(?,?,?,?,?,?)',
          )
          .run(
            randomUUID(),
            id,
            h.version,
            JSON.stringify(h.document),
            h.source.startsWith('approved:')
              ? 'approved:' + (proposalIds.get(h.source.slice(9)) ?? h.source.slice(9))
              : h.source,
            h.createdAt,
          );
      for (const p of b.proposals)
        this.db
          .prepare(
            'INSERT INTO proposals(id,projectId,baseVersion,summary,document,status,createdAt,reviewedAt) VALUES(?,?,?,?,?,?,?,?)',
          )
          .run(
            proposalIds.get(p.id)!,
            id,
            p.baseVersion,
            p.summary,
            JSON.stringify(p.document),
            p.status,
            p.createdAt,
            p.reviewedAt ?? null,
          );
      this.db.exec('COMMIT');
      return this.get(id);
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
  historySummaries(id: string) {
    return this.db
      .prepare(
        "SELECT id,projectId,version,source,createdAt,COALESCE(json_extract(document,'$.metadata.draft'),1) AS draft FROM revisions WHERE projectId=? ORDER BY version DESC",
      )
      .all(id);
  }
  revision(id: string, version: number) {
    const h = this.db
      .prepare('SELECT * FROM revisions WHERE projectId=? AND version=? LIMIT 1')
      .get(id, version) as any;
    if (!h) throw Error('Revision not found');
    return { ...h, document: DocumentSchema.parse(JSON.parse(h.document)) };
  }
  history(id: string) {
    return (
      this.db
        .prepare('SELECT * FROM revisions WHERE projectId=? ORDER BY version DESC')
        .all(id) as any[]
    ).map((p) => ({ ...p, document: JSON.parse(p.document) }));
  }
}
