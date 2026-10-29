import { it, expect, vi } from 'vitest';
import { registerBrowserTools } from '../src/webmcp';
it('returns actionable structured Site tool errors and cleans up registrations', async () => {
  const registered = new Map<string, any>();
  let signal: AbortSignal | undefined;
  vi.stubGlobal('document', {
    modelContext: {
      registerTool: (tool: any, options: any) => {
        registered.set(tool.name, tool);
        signal = options.signal;
      },
    },
  });
  try {
    const dispose = registerBrowserTools(
      () => 'project',
      () => ({
        elementId: 'element',
        sceneId: 'scene',
        version: 7,
        hasUnsavedEdits: false,
        text: '',
      }),
      async (url) => {
        if (url === '/tools')
          return [
            {
              name: 'screenplay_get_scene',
              description: 'Read a scene',
              inputSchema: {
                type: 'object',
                properties: { projectId: { type: 'string' }, sceneId: { type: 'string' } },
                required: ['projectId', 'sceneId'],
              },
            },
          ];
        throw Error('Scene not found');
      },
      () => {},
    );
    await vi.waitFor(() => expect(registered.size).toBe(3));
    const result = await registered.get('screenplay_get_scene').execute({ sceneId: 'missing' });
    expect(result).toMatchObject({
      changed: false,
      version: 7,
      error: { message: 'Scene not found' },
    });
    expect(registered.get('screenplay_get_scene').inputSchema.required).not.toContain('projectId');
    const crossProject = await registered
      .get('screenplay_get_scene')
      .execute({ projectId: 'other', sceneId: 's' });
    expect(crossProject.error.message).toContain('active project');
    dispose();
    expect(signal?.aborted).toBe(true);
  } finally {
    vi.unstubAllGlobals();
  }
});
it('can create the first project through Site tools without requiring or injecting a project ID', async () => {
  const registered = new Map<string, any>();
  vi.stubGlobal('document', {
    modelContext: { registerTool: (tool: any) => registered.set(tool.name, tool) },
  });
  const api = vi.fn(async (url: string, body?: any) =>
    url === '/tools'
      ? [
          {
            name: 'create_project',
            description: 'Create blank project',
            inputSchema: {
              type: 'object',
              properties: { title: { type: 'string' } },
              required: ['title'],
              additionalProperties: false,
            },
          },
        ]
      : { projectId: 'new-project', version: 1, input: body.input },
  );
  try {
    const dispose = registerBrowserTools(
      () => null,
      () => ({ elementId: '', hasUnsavedEdits: false, text: '' }),
      api,
      () => {},
    );
    await vi.waitFor(() => expect(registered.has('create_project')).toBe(true));
    expect(
      await registered.get('create_project').execute({ title: 'First project' }),
    ).toMatchObject({ projectId: 'new-project', input: { title: 'First project' } });
    expect(api.mock.calls.at(-1)?.[1].input).not.toHaveProperty('projectId');
    dispose();
  } finally {
    vi.unstubAllGlobals();
  }
});
