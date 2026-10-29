import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { serverSpec } from '../server/connect.js';
import { root } from '../server/paths.js';
/** Starts the MCP server exactly as a client would, lists its tools and projects. Writes nothing. */
const spec = serverSpec();
const client = new Client({ name: 'courier-pages-verification', version: '1' });
const transport = new StdioClientTransport({
  command: spec.command,
  args: spec.args,
  cwd: root,
  env: { ...(process.env as Record<string, string>), ...spec.env },
  stderr: 'pipe',
});
try {
  await client.connect(transport);
  const tools = await client.listTools();
  if (tools.tools.some((t) => /accept|approve|overwrite/.test(t.name)))
    throw Error('Unexpected approval tool');
  const response = (await client.callTool({ name: 'list_projects', arguments: {} })) as any;
  const projects = JSON.parse(response.content[0].text);
  if (response.isError || !Array.isArray(projects)) throw Error(JSON.stringify(projects));
  console.log(
    JSON.stringify(
      { transport: 'local-stdio', tools: tools.tools.length, approvalTools: 0, projects },
      null,
      2,
    ),
  );
} finally {
  await client.close();
}
