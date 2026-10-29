import { spawn } from 'node:child_process';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { root, dataDirectory, port } from './paths.js';
export { root, dataDirectory, port };
export const backendURL = `http://127.0.0.1:${port}`;
export class BackendError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function backendToken() {
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new BackendError('invalid_backend_port', 'PORT must be a valid local port.');
  try {
    return readFileSync(path.join(dataDirectory, 'mcp-token'), 'utf8').trim();
  } catch {
    throw new BackendError(
      'backend_token_missing',
      'Courier Pages local token is missing. Start the application with the existing data folder before connecting MCP.',
    );
  }
}
function connectionRefused(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const value = error as { code?: string; cause?: unknown; errors?: unknown[] };
  return (
    value.code === 'ECONNREFUSED' ||
    connectionRefused(value.cause) ||
    !!value.errors?.some(connectionRefused)
  );
}
async function probe(token: string): Promise<boolean> {
  let response: Response;
  try {
    response = await fetch(backendURL + '/api/capabilities', {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(1500),
    });
  } catch (error) {
    if (connectionRefused(error)) return false;
    throw new BackendError(
      'backend_unreachable',
      `Cannot reach Courier Pages at ${backendURL}. Check the backend and local networking permissions.`,
    );
  }
  if (response.status === 401 || response.status === 403)
    throw new BackendError(
      'backend_auth_failed',
      'The backend is running but its local token does not match STUDIO_DATA. Use the same existing data folder for the app and MCP.',
    );
  let capabilities: any;
  try {
    capabilities = await response.json();
  } catch {
    /* Report the wrong listener below. */
  }
  if (
    !response.ok ||
    capabilities?.storage !== 'sqlite' ||
    capabilities?.approval !== 'editor-only'
  )
    throw new BackendError(
      'unexpected_backend',
      `Port ${port} is occupied but is not the expected Courier Pages backend. No additional server was started.`,
    );
  return true;
}
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
let starting: Promise<void> | undefined;
export async function ensureBackend(token: string) {
  if (await probe(token)) return;
  if (process.env.STUDIO_AUTOSTART === '0')
    throw new BackendError(
      'backend_not_running',
      `Courier Pages is stopped. Start the application at ${backendURL}, or enable STUDIO_AUTOSTART for the local MCP server.`,
    );
  // Never seed a replacement database when a client points at the wrong directory.
  if (!existsSync(path.join(dataDirectory, 'studio.sqlite')))
    throw new BackendError(
      'backend_database_missing',
      'The existing screenplay database was not found in STUDIO_DATA. No database or replacement project was created.',
    );
  if (!starting)
    starting = startBackend(token).finally(() => {
      starting = undefined;
    });
  await starting;
}
async function startBackend(token: string) {
  const lock = path.join(dataDirectory, '.backend-start.lock');
  const deadline = Date.now() + 15000;
  let ownsLock = false;
  while (Date.now() < deadline) {
    if (await probe(token)) return;
    try {
      mkdirSync(lock, { mode: 0o700 });
      ownsLock = true;
      writeFileSync(path.join(lock, 'owner.json'), JSON.stringify({ pid: process.pid }), {
        mode: 0o600,
      });
      break;
    } catch (error) {
      if (ownsLock) {
        rmSync(lock, { recursive: true, force: true });
        throw error;
      }
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      try {
        const owner = JSON.parse(readFileSync(path.join(lock, 'owner.json'), 'utf8'));
        if (Number.isInteger(owner.pid) && owner.pid > 0) {
          try {
            process.kill(owner.pid, 0);
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ESRCH')
              rmSync(lock, { recursive: true, force: true });
          }
        }
      } catch {
        // Recover a crash between creating the lock and writing its owner.
        try {
          if (Date.now() - statSync(lock).mtimeMs > 20000)
            rmSync(lock, { recursive: true, force: true });
        } catch {
          /* Another client already released it. */
        }
      }
      await delay(100);
    }
  }
  if (!ownsLock)
    throw new BackendError(
      'backend_start_timeout',
      'Another local client is starting Courier Pages. Retry once the application is ready.',
    );
  try {
    if (await probe(token)) return;
    const fd = openSync(path.join(dataDirectory, 'backend.log'), 'a', 0o600);
    let startupError: Error | undefined;
    try {
      const child = spawn(
        process.execPath,
        [
          '--import',
          path.join(root, 'node_modules/tsx/dist/loader.mjs'),
          path.join(root, 'server/index.ts'),
        ],
        {
          cwd: root,
          env: { ...process.env, PORT: String(port), STUDIO_DATA: dataDirectory },
          detached: true,
          stdio: ['ignore', fd, fd],
        },
      );
      child.once('error', (error) => {
        startupError = error;
      });
      child.unref();
      if (child.pid)
        writeFileSync(path.join(dataDirectory, 'backend.pid'), String(child.pid), { mode: 0o600 });
    } finally {
      closeSync(fd);
    }
    while (Date.now() < deadline) {
      if (startupError) break;
      if (await probe(token)) return;
      await delay(100);
    }
    throw new BackendError(
      'backend_start_failed',
      'Courier Pages could not start. See backend.log in the existing data folder. Your screenplay was not replaced.',
    );
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}
