import { describe, expect, it } from 'vitest';
import {
  SERVER_NAME,
  mergeJsonConfig,
  mergeTomlConfig,
  removeTomlServer,
  serverSpec,
} from '../server/connect.js';
const spec = serverSpec();
describe('client connection config', () => {
  it('adds the server to a Claude Desktop config without touching other settings', () => {
    const before = JSON.stringify({
      preferences: { a: 1 },
      mcpServers: { other: { command: 'x' } },
    });
    const after = JSON.parse(mergeJsonConfig(before, spec));
    expect(after.preferences).toEqual({ a: 1 });
    expect(after.mcpServers.other).toEqual({ command: 'x' });
    expect(after.mcpServers[SERVER_NAME].args).toEqual(spec.args);
    expect(JSON.parse(mergeJsonConfig(mergeJsonConfig(before, spec), spec))).toEqual(after);
  });
  it('replaces our earlier entry but keeps a different one with the same old name', () => {
    const ours = { command: 'n', args: [spec.args[2]] };
    const theirs = { command: 'n', args: ['/elsewhere/mcp.ts'] };
    const migrated = JSON.parse(
      mergeJsonConfig(JSON.stringify({ mcpServers: { 'screenplay-studio': ours } }), spec),
    );
    expect(migrated.mcpServers['screenplay-studio']).toBeUndefined();
    const kept = JSON.parse(
      mergeJsonConfig(JSON.stringify({ mcpServers: { 'screenplay-studio': theirs } }), spec),
    );
    expect(kept.mcpServers['screenplay-studio']).toEqual(theirs);
  });
  it('writes and then replaces the Codex block, leaving other servers alone', () => {
    const original = [
      'model = "x"',
      '',
      '[mcp_servers.other]',
      'command = "o"',
      '',
      '# Screenplay Studio: existing local server.',
      '[mcp_servers.screenplay-studio]',
      `args = ["${spec.args[2]}"]`,
      '',
      '[mcp_servers.screenplay-studio.env]',
      'PORT = "4310"',
      '',
      '[tools]',
      'a = 1',
      '',
    ].join('\n');
    const once = mergeTomlConfig(original, spec);
    expect(once).toContain('[mcp_servers.other]');
    expect(once).toContain('[tools]');
    expect(once).not.toContain('screenplay-studio');
    expect(once.match(/\[mcp_servers\.courier-pages\]/g)).toHaveLength(1);
    expect(mergeTomlConfig(once, spec)).toBe(once);
    expect(removeTomlServer(once)).not.toContain('courier-pages');
  });
});
