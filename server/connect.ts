import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { root, dataDirectory, port } from './paths.js';
/** One-click registration of the local MCP server with the AI clients installed on this computer. */
export const SERVER_NAME = 'courier-pages';
const LEGACY_NAMES = ['screenplay-studio'];
export type ClientId = 'claude-code' | 'claude-desktop' | 'codex';
export type ClientState = 'not-detected' | 'not-connected' | 'outdated' | 'connected';
export interface ServerSpec {
  command: string;
  args: string[];
  env: Record<string, string>;
}
export interface ClientStatus {
  id: ClientId;
  label: string;
  state: ClientState;
  detail: string;
  restart: string;
}
export interface ConnectResult {
  ok: boolean;
  message: string;
  command?: string;
}
const mcpEntry = () => path.join(root, 'server', 'mcp.ts');
export function serverSpec(): ServerSpec {
  return {
    command: process.execPath,
    args: ['--import', path.join(root, 'node_modules', 'tsx', 'dist', 'loader.mjs'), mcpEntry()],
    env: { PORT: String(port), STUDIO_DATA: dataDirectory, STUDIO_AUTOSTART: '1' },
  };
}
const home = os.homedir();
export function configPath(id: ClientId): string {
  if (id === 'claude-code') return path.join(home, '.claude.json');
  if (id === 'codex')
    return path.join(process.env.CODEX_HOME ?? path.join(home, '.codex'), 'config.toml');
  if (process.platform === 'darwin')
    return path.join(
      home,
      'Library',
      'Application Support',
      'Claude',
      'claude_desktop_config.json',
    );
  if (process.platform === 'win32')
    return path.join(
      process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming'),
      'Claude',
      'claude_desktop_config.json',
    );
  return path.join(home, '.config', 'Claude', 'claude_desktop_config.json');
}
const sameSpec = (entry: any, spec: ServerSpec) =>
  entry?.command === spec.command &&
  JSON.stringify(entry?.args ?? []) === JSON.stringify(spec.args) &&
  Object.entries(spec.env).every(([k, v]) => entry?.env?.[k] === v);
const isOurs = (entry: any) => JSON.stringify(entry?.args ?? []).includes(mcpEntry());
function backup(file: string) {
  const copy = file + '.bak-courier-pages';
  if (existsSync(file) && !existsSync(copy)) copyFileSync(file, copy);
}
/** Adds the server to a Claude Desktop style JSON config, replacing our earlier entries. */
export function mergeJsonConfig(text: string | undefined, spec: ServerSpec): string {
  const config = text?.trim() ? JSON.parse(text) : {};
  config.mcpServers ??= {};
  for (const name of LEGACY_NAMES)
    if (isOurs(config.mcpServers[name])) delete config.mcpServers[name];
  config.mcpServers[SERVER_NAME] = { command: spec.command, args: spec.args, env: spec.env };
  return JSON.stringify(config, null, 2) + '\n';
}
interface Section {
  header: string;
  start: number;
  end: number;
}
function tomlSections(lines: string[]): Section[] {
  const found: Section[] = [];
  lines.forEach((line, i) => {
    const m = line.match(/^\s*\[([^\]]+)\]\s*$/);
    if (!m) return;
    if (found.length) found[found.length - 1].end = i;
    found.push({ header: m[1].trim(), start: i, end: lines.length });
  });
  return found;
}
const tomlName = (header: string) => header.match(/^mcp_servers\.("?)([^."]+)\1(\..*)?$/)?.[2];
/** Removes our server's blocks (current and earlier names) from a Codex config.toml. */
export function removeTomlServer(text: string): string {
  const lines = text.split('\n');
  const drop = new Set<number>();
  const groups = new Map<string, Section[]>();
  for (const s of tomlSections(lines)) {
    const name = tomlName(s.header);
    if (name) groups.set(name, [...(groups.get(name) ?? []), s]);
  }
  for (const [name, sections] of groups) {
    const block = sections.map((s) => lines.slice(s.start, s.end).join('\n')).join('\n');
    const ours =
      name === SERVER_NAME || (LEGACY_NAMES.includes(name) && block.includes(mcpEntry()));
    if (!ours) continue;
    for (const s of sections) {
      for (let i = s.start; i < s.end; i++) drop.add(i);
      for (
        let i = s.start - 1;
        i >= 0 && /^\s*#/.test(lines[i]) && /studio|courier/i.test(lines[i]);
        i--
      )
        drop.add(i);
    }
  }
  return lines.filter((_, i) => !drop.has(i)).join('\n');
}
export function mergeTomlConfig(text: string | undefined, spec: ServerSpec): string {
  const q = (v: string) => JSON.stringify(v);
  const base = removeTomlServer(text ?? '').replace(/\s+$/, '');
  const block = [
    '# Courier Pages: local screenplay server and its data folder.',
    `[mcp_servers.${SERVER_NAME}]`,
    `command = ${q(spec.command)}`,
    `args = [${spec.args.map(q).join(', ')}]`,
    `cwd = ${q(root)}`,
    'enabled = true',
    'startup_timeout_sec = 30',
    'tool_timeout_sec = 45',
    '',
    `[mcp_servers.${SERVER_NAME}.env]`,
    ...Object.entries(spec.env).map(([k, v]) => `${k} = ${q(v)}`),
    '',
  ].join('\n');
  return (base ? base + '\n\n' : '') + block;
}
function readText(file: string) {
  return existsSync(file) ? readFileSync(file, 'utf8') : undefined;
}
function findClaudeCli(): string | undefined {
  const candidates = [
    ...(process.env.PATH ?? '').split(path.delimiter).map((d) => path.join(d, 'claude')),
    path.join(home, '.local', 'bin', 'claude'),
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude',
  ];
  return candidates.find((c) => existsSync(c));
}
function stateFromEntry(entry: any, spec: ServerSpec): ClientState {
  if (!entry) return 'not-connected';
  return sameSpec(entry, spec) ? 'connected' : 'outdated';
}
function tomlEntryState(text: string | undefined, spec: ServerSpec): ClientState {
  if (!text) return 'not-connected';
  const lines = text.split('\n');
  const sections = tomlSections(lines).filter((s) => tomlName(s.header) === SERVER_NAME);
  if (!sections.length) return 'not-connected';
  const block = sections.map((s) => lines.slice(s.start, s.end).join('\n')).join('\n');
  const ok =
    block.includes(JSON.stringify(spec.command)) &&
    spec.args.every((a) => block.includes(JSON.stringify(a))) &&
    Object.entries(spec.env).every(([k, v]) => block.includes(`${k} = ${JSON.stringify(v)}`));
  return ok ? 'connected' : 'outdated';
}
export function clientStatuses(): ClientStatus[] {
  const spec = serverSpec();
  const code = readJson(configPath('claude-code'));
  const desktopFile = configPath('claude-desktop');
  const desktop = readJson(desktopFile);
  const codexFile = configPath('codex');
  const cli = findClaudeCli();
  return [
    {
      id: 'claude-code',
      label: 'Claude Code',
      state: cli || code ? stateFromEntry(code?.mcpServers?.[SERVER_NAME], spec) : 'not-detected',
      detail: cli ? 'Available in every Claude Code session' : 'Claude Code was not found',
      restart: 'Start a new Claude Code session.',
    },
    {
      id: 'claude-desktop',
      label: 'Claude Desktop chats',
      state: existsSync(path.dirname(desktopFile))
        ? stateFromEntry(desktop?.mcpServers?.[SERVER_NAME], spec)
        : 'not-detected',
      detail: existsSync(path.dirname(desktopFile))
        ? 'Available in new Claude chats'
        : 'Claude Desktop was not found',
      restart: 'Fully quit and reopen Claude Desktop.',
    },
    {
      id: 'codex',
      label: 'Codex',
      state: existsSync(path.dirname(codexFile))
        ? tomlEntryState(readText(codexFile), spec)
        : 'not-detected',
      detail: existsSync(path.dirname(codexFile))
        ? 'Available in Codex sessions'
        : 'Codex was not found',
      restart: 'Reload MCP servers or restart Codex.',
    },
  ];
}
function readJson(file: string): any {
  try {
    const text = readText(file);
    return text ? JSON.parse(text) : undefined;
  } catch {
    return undefined;
  }
}
export function connectClient(id: string): ConnectResult {
  const spec = serverSpec();
  try {
    if (id === 'claude-desktop') {
      const file = configPath(id);
      mkdirSync(path.dirname(file), { recursive: true });
      backup(file);
      writeFileSync(file, mergeJsonConfig(readText(file), spec));
      return { ok: true, message: 'Added to Claude Desktop. Fully quit and reopen it.' };
    }
    if (id === 'codex') {
      const file = configPath(id);
      if (!existsSync(path.dirname(file)))
        return { ok: false, message: 'Codex was not found on this computer.' };
      backup(file);
      writeFileSync(file, mergeTomlConfig(readText(file), spec));
      return { ok: true, message: 'Added to Codex. Reload MCP servers or restart Codex.' };
    }
    if (id === 'claude-code') {
      const cli = findClaudeCli();
      const add = [
        'mcp',
        'add',
        '--scope',
        'user',
        SERVER_NAME,
        ...Object.entries(spec.env).flatMap(([k, v]) => ['-e', `${k}=${v}`]),
        '--',
        spec.command,
        ...spec.args,
      ];
      const shown = 'claude ' + add.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(' ');
      if (!cli)
        return {
          ok: false,
          message: 'Claude Code was not found. Run this once it is installed:',
          command: shown,
        };
      backup(configPath(id));
      for (const name of [...LEGACY_NAMES, SERVER_NAME])
        if (isOurs(readJson(configPath(id))?.mcpServers?.[name]) || name === SERVER_NAME)
          spawnSync(cli, ['mcp', 'remove', '--scope', 'user', name], { encoding: 'utf8' });
      const run = spawnSync(cli, add, { encoding: 'utf8' });
      if (run.status !== 0)
        return {
          ok: false,
          message: (run.stderr || run.stdout || 'Claude Code refused the change.').trim(),
          command: shown,
        };
      return { ok: true, message: 'Added to Claude Code. Start a new session.' };
    }
    return { ok: false, message: 'Unknown client.' };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}
