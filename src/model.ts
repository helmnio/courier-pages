import { z } from 'zod';
export const kinds = [
  'scene',
  'action',
  'character',
  'dialogue',
  'parenthetical',
  'transition',
  'shot',
  'general',
  'pageBreak',
  'note',
  'section',
] as const;
export const BlockSchema = z.object({
  id: z.string().min(1),
  type: z.enum(kinds),
  text: z.string().max(100000),
});
export const CharacterSchema = z.object({
  id: z.string(),
  name: z.string(),
  aliases: z.string().default(''),
  age: z.string().default(''),
  description: z.string().default(''),
  background: z.string().default(''),
  motivation: z.string().default(''),
  relationships: z.string().default(''),
  voice: z.string().default(''),
  arc: z.string().default(''),
});
export const BriefSchema = z.object({
  purpose: z.string().default(''),
  startingState: z.string().default(''),
  endingState: z.string().default(''),
  requiredBeats: z.string().default(''),
  characterIntentions: z.string().default(''),
  dialogueGuidance: z.string().default(''),
  tone: z.string().default(''),
  constraints: z.string().default(''),
});
export const MetadataSchema = z.object({
  genre: z.string().default(''),
  format: z.enum(['feature', 'short', 'television']).default('feature'),
  description: z.string().default(''),
  pageSize: z.enum(['LETTER', 'A4']).default('LETTER'),
  archived: z.boolean().default(false),
  draft: z.number().int().min(1).max(99).default(1),
});
export const planningKinds = [
  'outline',
  'treatment',
  'beatSheet',
  'actPlan',
  'sequencePlan',
  'research',
  'notes',
  'other',
] as const;
export const circleSteps = [
  'you',
  'need',
  'go',
  'search',
  'find',
  'take',
  'return',
  'change',
] as const;
export const PlanItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(200),
  kind: z.enum([...planningKinds, 'storyCircle']),
  body: z.string().max(1000000).default(''),
  subject: z.string().max(1000).default(''),
  stages: z
    .object({
      you: z.string().max(100000).default(''),
      need: z.string().max(100000).default(''),
      go: z.string().max(100000).default(''),
      search: z.string().max(100000).default(''),
      find: z.string().max(100000).default(''),
      take: z.string().max(100000).default(''),
      return: z.string().max(100000).default(''),
      change: z.string().max(100000).default(''),
    })
    .default(() => ({
      you: '',
      need: '',
      go: '',
      search: '',
      find: '',
      take: '',
      return: '',
      change: '',
    })),
});
export type PlanItem = z.infer<typeof PlanItemSchema>;
export const ReviewNoteSchema = z.object({
  id: z.string().min(1),
  sceneId: z.string().optional(),
  blockId: z.string().optional(),
  anchorFrom: z.number().int().nonnegative().optional(),
  anchorTo: z.number().int().nonnegative().optional(),
  pinOffset: z.number().int().nonnegative().optional(),
  quote: z.string().max(100000).optional(),
  category: z.enum(['note', 'continuity', 'critique']),
  text: z.string().max(100000),
  status: z.string().default('open'),
  priority: z.enum(['low', 'normal', 'high']).optional(),
  author: z.string().max(200).optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  replies: z
    .array(
      z.object({
        id: z.string().min(1),
        text: z.string().min(1).max(100000),
        author: z.string().max(200).optional(),
        createdAt: z.string(),
      }),
    )
    .optional(),
});
export type ReviewNote = z.infer<typeof ReviewNoteSchema>;
export const DocumentObject = z.object({
  schemaVersion: z.literal(1).default(1),
  title: z.string().min(1).max(200),
  author: z.string().max(200),
  metadata: MetadataSchema.default(() => MetadataSchema.parse({})),
  characters: z.array(CharacterSchema).default([]),
  planning: z.array(PlanItemSchema).max(1000).default([]),
  briefs: z.record(z.string(), BriefSchema).default({}),
  sceneStatus: z
    .record(z.string(), z.enum(['planned', 'drafting', 'revision', 'approved']))
    .default({}),
  notes: z.array(ReviewNoteSchema).default([]),
  blocks: z.array(BlockSchema).max(10000),
  bible: z.object({
    logline: z.string(),
    characters: z.string(),
    world: z.string(),
    premise: z.string().default(''),
    story: z.string().default(''),
    continuity: z.string().default(''),
    constraints: z.string().default(''),
    research: z.string().default(''),
    scenes: z.record(z.string(), z.string()),
  }),
});
export const DocumentSchema = DocumentObject.superRefine((d, c) => {
  if (new Set(d.blocks.map((b) => b.id)).size !== d.blocks.length)
    c.addIssue({ code: 'custom', message: 'Duplicate block IDs' });
  if (new Set(d.notes.map((n) => n.id)).size !== d.notes.length)
    c.addIssue({ code: 'custom', message: 'Duplicate review note IDs' });
  if (new Set(d.planning.map((b) => b.id)).size !== d.planning.length)
    c.addIssue({ code: 'custom', message: 'Duplicate planning IDs' });
  if (new Set(d.characters.map((b) => b.id)).size !== d.characters.length)
    c.addIssue({ code: 'custom', message: 'Duplicate character IDs' });
});
export type Script = z.infer<typeof DocumentSchema>;
export type Block = z.infer<typeof BlockSchema>;
export type Project = {
  id: string;
  version: number;
  document: Script;
  createdAt?: string;
  updatedAt?: string;
};
export type Proposal = {
  id: string;
  projectId: string;
  baseVersion: number;
  summary: string;
  document: Script;
  status: string;
  createdAt: string;
  reviewedAt?: string;
  sceneId?: string;
};
export const blank = (title = 'Untitled screenplay'): Script =>
  DocumentSchema.parse({
    title,
    author: '',
    blocks: [
      { id: crypto.randomUUID(), type: 'scene', text: 'INT. SOMEWHERE - DAY' },
      { id: crypto.randomUUID(), type: 'action', text: '' },
    ],
    bible: { logline: '', characters: '', world: '', scenes: {} },
  });
export function scenes(d: Script) {
  return d.blocks
    .flatMap((b, i) =>
      b.type === 'scene'
        ? [
            {
              id: b.id,
              heading: b.text,
              start: i,
              end: d.blocks.findIndex(
                (v, j) => j > i && (v.type === 'scene' || v.type === 'section'),
              ),
              synopsis: d.bible.scenes[b.id] ?? '',
              status: d.sceneStatus[b.id] ?? 'drafting',
            },
          ]
        : [],
    )
    .map((s) => ({ ...s, end: s.end < 0 ? d.blocks.length : s.end }));
}
export function sceneBlocks(d: Script, id: string) {
  const s = scenes(d).find((s) => s.id === id);
  if (!s) throw Error('Scene not found');
  return d.blocks.slice(s.start, s.end);
}
export function moveScene(d: Script, id: string, direction: -1 | 1): Script {
  const list = scenes(d),
    i = list.findIndex((s) => s.id === id),
    target = list[i + direction];
  if (i < 0 || !target) return d;
  const own = list[i],
    blocks = [...d.blocks],
    chunk = blocks.splice(own.start, own.end - own.start);
  const at = direction < 0 ? target.start : target.end - chunk.length;
  blocks.splice(at, 0, ...chunk);
  return { ...d, blocks };
}
export function duplicateScene(d: Script, id: string): Script {
  const list = scenes(d),
    own = list.find((s) => s.id === id);
  if (!own) throw Error('Scene not found');
  const chunk = sceneBlocks(d, id).map((b) => ({ ...b, id: crypto.randomUUID() }));
  const copy = chunk[0].id;
  const blocks = [...d.blocks];
  blocks.splice(own.end, 0, ...chunk);
  return {
    ...d,
    blocks,
    bible: { ...d.bible, scenes: { ...d.bible.scenes, [copy]: d.bible.scenes[id] ?? '' } },
    briefs: { ...d.briefs, ...(d.briefs[id] ? { [copy]: structuredClone(d.briefs[id]) } : {}) },
    sceneStatus: { ...d.sceneStatus, [copy]: 'drafting' },
    notes: [
      ...d.notes,
      ...d.notes
        .filter((n) => n.sceneId === id)
        .map((n) => ({
          ...n,
          id: crypto.randomUUID(),
          sceneId: copy,
          blockId: chunk[sceneBlocks(d, id).findIndex((b) => b.id === n.blockId)]?.id,
        })),
    ],
  };
}
