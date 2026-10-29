import { readFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { verifyTunnelAccess } from './tunnel-auth.ts';
const profile = readFileSync(
  fileURLToPath(new URL('./profiles/screenplay-studio.yaml', import.meta.url)),
  'utf8',
);
const id = profile.match(/^\s*tunnel_id:\s*"?(tunnel_[a-f0-9]{32})"?\s*$/m)?.[1] ?? '';
const result = verifyTunnelAccess(id, process.env);
const logs = fileURLToPath(new URL('./logs/', import.meta.url));
mkdirSync(logs, { recursive: true, mode: 0o700 });
appendFileSync(
  fileURLToPath(new URL('./logs/tunnel-auth.log', import.meta.url)),
  JSON.stringify({ time: new Date().toISOString(), code: result.code, ok: result.ok }) + '\n',
  { mode: 0o600 },
);
console.log(result.message);
if (!result.ok) process.exitCode = 1;
