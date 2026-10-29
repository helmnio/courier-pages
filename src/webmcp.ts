import { z } from 'zod';
type Registry = {
  registerTool: (
    t: {
      name: string;
      description: string;
      inputSchema: object;
      annotations?: object;
      execute: (input: unknown) => unknown;
    },
    o?: { signal: AbortSignal },
  ) => void | Promise<void>;
};
export function registerBrowserTools(
  project: () => string | null,
  selection: () => {
    elementId: string;
    sceneId?: string;
    version?: number;
    hasUnsavedEdits: boolean;
    text: string;
  },
  api: (url: string, body?: unknown) => Promise<any>,
  fail: (e: unknown) => void,
) {
  const registry = (document as Document & { modelContext?: Registry }).modelContext;
  if (typeof registry?.registerTool !== 'function') return () => {};
  const life = new AbortController();
  const register = (tool: Parameters<Registry['registerTool']>[0]) =>
    registry.registerTool(
      {
        ...tool,
        execute: async (input: unknown) => {
          try {
            return await tool.execute(input);
          } catch (error) {
            return {
              changed: false,
              screenplayChanged: false,
              projectId: project(),
              version: selection().version ?? null,
              error: {
                code: 'request_failed',
                message: error instanceof Error ? error.message : String(error),
              },
            };
          }
        },
      },
      { signal: life.signal },
    );
  void (async () => {
    const tools = await api('/tools');
    if (life.signal.aborted) return;
    for (const t of tools) {
      const schema = structuredClone(t.inputSchema);
      const projectScoped = Object.hasOwn(schema.properties ?? {}, 'projectId');
      if (schema.properties) delete schema.properties.projectId;
      schema.required = (schema.required ?? []).filter((x: string) => x !== 'projectId');
      await register({
        ...t,
        inputSchema: schema,
        execute: async (raw: unknown) => {
          const input = z.record(z.string(), z.unknown()).parse(raw);
          if (!projectScoped) return api('/tools/call', { name: t.name, input });
          const projectId = project();
          if (!projectId) throw Error('No active project');
          if (input.projectId && input.projectId !== projectId)
            throw Error('Tool is restricted to the active project');
          return api('/tools/call', { name: t.name, input: { ...input, projectId } });
        },
      });
    }
    await register({
      name: 'screenplay_get_current_scene',
      description:
        'Read the saved active scene. Reports unsaved edits; save before asking for revisions.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: async (input) => {
        z.object({}).strict().parse(input);
        const selected = selection();
        if (!selected.sceneId) throw Error('Place the cursor in a scene first.');
        return {
          ...(await api('/tools/call', {
            name: 'screenplay_get_scene',
            input: { projectId: project(), sceneId: selected.sceneId },
          })),
          hasUnsavedEdits: selected.hasUnsavedEdits,
        };
      },
    });
    await register({
      name: 'screenplay_get_current_selection',
      description: 'Read the selected element ID. Does not modify the document.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: (input) => {
        z.object({}).strict().parse(input);
        return { projectId: project(), ...selection(), changed: false };
      },
    });
  })().catch(fail);
  return () => life.abort();
}
